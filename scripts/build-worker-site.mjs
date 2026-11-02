import { readFile, writeFile, mkdir, cp, readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const prefix = '/ark/storyline'
const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
const data = JSON.parse(await readFile('portal/links.json', 'utf8'))
if (
  typeof data.title !== 'string' ||
  typeof data.description !== 'string' ||
  !Array.isArray(data.links)
)
  throw new Error('Invalid portal metadata')
const cards = data.links
  .map(({ name, description, url, tags }) => {
    if (
      typeof name !== 'string' ||
      typeof description !== 'string' ||
      !Array.isArray(tags) ||
      !tags.every((tag) => typeof tag === 'string') ||
      typeof url !== 'string' ||
      (!url.startsWith('/') && !url.startsWith('https://')) ||
      url.startsWith('//')
    )
      throw new Error(`Invalid portal link: ${name}`)
    return `<a class="card" href="${escapeHtml(url)}"><span class="card-top"><span class="symbol">${escapeHtml(name.slice(0, 1))}</span><span class="arrow" aria-hidden="true">↗</span></span><span class="name">${escapeHtml(name)}</span><span class="desc">${escapeHtml(description)}</span><span class="tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</span></a>`
  })
  .join('')
await mkdir('dist/_portal', { recursive: true })
await writeFile(
  'dist/_portal/index.html',
  `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escapeHtml(data.description)}"><title>${escapeHtml(data.title)}</title><style>
:root{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#202a27;background:#f5f5ef;font-synthesis:none}*{box-sizing:border-box}body{margin:0}.shell{max-width:1100px;margin:auto;padding:42px 32px 72px}header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #cfd6ce;padding-bottom:25px}.brand{font-weight:750;letter-spacing:.14em;font-size:13px}.dot{color:#527967}.nav{font-size:12px;letter-spacing:.14em;color:#697971}.hero{padding:92px 0 64px}.eyebrow{font-size:12px;font-weight:700;letter-spacing:.2em;color:#5a7c6c}.hero h1{font-size:clamp(42px,7vw,76px);letter-spacing:-.055em;line-height:1.1;margin:20px 0}.hero p{color:#718078;font-size:16px;line-height:1.8;margin:0}.section-head{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #cfd6ce;padding-bottom:14px;margin-bottom:20px}.section-head h2{font-size:16px;margin:0}.count{font-size:12px;color:#7d8b82}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}.card{display:flex;flex-direction:column;min-height:240px;padding:24px;text-decoration:none;color:inherit;border:1px solid #dfe5dc;background:#fff;transition:transform .2s,border-color .2s,box-shadow .2s}.card:hover,.card:focus-visible{transform:translateY(-3px);border-color:#8eae99;box-shadow:0 12px 30px #243e2710}.card-top{display:flex;justify-content:space-between;align-items:start;margin-bottom:28px}.symbol{display:grid;place-items:center;width:42px;height:42px;background:#e9f0e8;color:#426b54;font-weight:700;font-size:17px}.arrow{color:#799083;font-size:20px}.name{font-size:20px;font-weight:700;letter-spacing:-.02em}.desc{color:#77847b;line-height:1.7;font-size:13px;margin-top:9px}.tags{display:flex;gap:7px;flex-wrap:wrap;margin-top:auto;padding-top:22px}.tags span{font-size:11px;color:#68816e;background:#f1f5ef;padding:5px 8px}footer{margin-top:90px;padding-top:20px;border-top:1px solid #cfd6ce;color:#93a098;font-size:11px;letter-spacing:.08em}@media(max-width:600px){.shell{padding:28px 20px 50px}.hero{padding:70px 0 50px}.nav{display:none}.card{min-height:210px}footer{margin-top:65px}}
</style></head><body><main class="shell"><header><span class="brand">THY<span class="dot">.</span>ICU</span><span class="nav">A SMALL CORNER OF THE INTERNET</span></header><section class="hero"><div class="eyebrow">PERSONAL COLLECTION / 个人收藏</div><h1>${escapeHtml(data.title)}</h1><p>${escapeHtml(data.description)}</p></section><section aria-labelledby="sites"><div class="section-head"><h2 id="sites">网站收藏</h2><span class="count">${String(data.links.length).padStart(2, '0')} SITES</span></div><div class="grid">${cards}</div></section><footer>THY.ICU &nbsp; / &nbsp; LINKS &amp; THINGS</footer></main></body></html>`
)

const result = spawnSync(
  'pnpm',
  ['exec', 'vite', 'build', `--base=${prefix}/`, '--outDir', '.ark-subsite'],
  { stdio: 'inherit', env: { ...process.env, VITE_ARK_DATA_BASE_URL: `${prefix}/data` } }
)
if (result.status !== 0) process.exit(result.status ?? 1)
// Generated JSON may contain absolute local asset URLs. Scope them to the mounted site.
async function prefixJson(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) await prefixJson(file)
    else if (entry.name.endsWith('.json')) {
      const original = await readFile(file, 'utf8')
      const updated = original.replace(/"\/(assets|data)\//g, `"${prefix}/$1/`)
      if (original !== updated) await writeFile(file, updated)
    }
  }
}
await prefixJson('.ark-subsite/data')
await mkdir('dist/ark/storyline', { recursive: true })
await cp('.ark-subsite', 'dist/ark/storyline', { recursive: true })
