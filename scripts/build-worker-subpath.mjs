import { readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const prefix = process.env.ARK_BASE_PATH?.replace(/\/+$/, '')
if (!prefix || !/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(prefix)) {
  throw new Error('ARK_BASE_PATH must be a non-root URL path such as /apps/reader')
}
const outputDirectory = path.join('dist', prefix.slice(1))
await rm('dist', { recursive: true, force: true })
const build = spawnSync(
  'pnpm',
  ['exec', 'vite', 'build', `--base=${prefix}/`, '--outDir', outputDirectory, '--emptyOutDir'],
  {
    stdio: 'inherit',
    env: { ...process.env, VITE_ARK_DATA_BASE_URL: `${prefix}/data` },
  }
)
if (build.status !== 0) process.exit(build.status ?? 1)

// Some generated catalog and story records contain root-relative asset paths.
// Scope those paths to the Worker mount without modifying source data.
async function prefixJson(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) await prefixJson(file)
    else if (entry.name.endsWith('.json')) {
      const original = await readFile(file, 'utf8')
      const updated = original.replace(/"\/(assets|data)\//g, `"${prefix}/$1/`)
      if (original !== updated) await writeFile(file, updated)
    }
  }
}
await prefixJson(path.join(outputDirectory, 'data'))
const config = JSON.parse(await readFile('wrangler.worker.json', 'utf8'))
config.vars = { ...config.vars, SITE_BASE_PATH: prefix }
config.assets.run_worker_first = [
  prefix,
  `${prefix}/*`,
  `!${prefix}/assets/*`,
  `!${prefix}/data/*`,
  `!${prefix}/fonts/*`,
]
await writeFile('.wrangler-generated.json', `${JSON.stringify(config, null, 2)}\n`)
