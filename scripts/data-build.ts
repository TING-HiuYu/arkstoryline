import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  DEFAULT_STORYLINE_OVERRIDES_PATH,
  buildStaticDataService,
  createAssetSourceProvider,
} from './build-static-data'
import { SCRIPT_CONFIG } from './config'
import { validateStageTableStorylineStorySetsStructure } from './transform/stage-table-storyline-story-sets-validator'
import { validateStageTableStorylinesStructure } from './transform/stage-table-storylines-validator'

interface DataBuildCliOptions {
  locale: string
  inputDir?: string
  outputDir: string
  coverAssetsOutputDir?: string
  revision?: string
  allowMissingStoryText: boolean
}

interface ParsedArgs {
  locale?: string
  inputDir?: string
  outputDir?: string
  revision?: string
  allowMissingStoryText?: boolean
}

const DEFAULT_LOCALE = SCRIPT_CONFIG.locale
const DEFAULT_OUTPUT_DIR = SCRIPT_CONFIG.dataDir
const DEFAULT_CACHE_ROOT = SCRIPT_CONFIG.arkDataCacheDir

export async function runDataBuild(options: DataBuildCliOptions): Promise<unknown> {
  const inputDir =
    options.inputDir ??
    (await resolveInputDirFromCache({
      locale: options.locale,
      revision: options.revision,
      cacheRoot: DEFAULT_CACHE_ROOT,
    }))

  await validateStageTableSchemaForBuild(inputDir)

  const report = await buildStaticDataService.build({
    locale: options.locale,
    inputDir,
    outputDir: resolve(options.outputDir),
    coverAssetsOutputDir: resolve(
      options.coverAssetsOutputDir ?? dirname(resolve(options.outputDir)),
      'assets/covers'
    ),
    assetSourceProvider: createAssetSourceProvider({
      mode: process.env.ARK_COVER_ASSET_MODE,
      roots: splitEnvList(process.env.ARK_COVER_ASSET_ROOTS),
      baseUrls: splitEnvList(process.env.ARK_COVER_ASSET_BASE_URLS),
    }),
    allowMissingStoryText: options.allowMissingStoryText,
    timelineRulesInput: {
      overridesFilePath: DEFAULT_STORYLINE_OVERRIDES_PATH,
    },
  })

  return {
    commandStatus: 'ok',
    command: 'data:build',
    requestedLocale: options.locale,
    inputDir,
    resolvedOutputDir: resolve(options.outputDir, options.locale),
    allowMissingStoryText: options.allowMissingStoryText,
    ...report,
  }
}

export async function validateStageTableSchemaForBuild(inputDir: string): Promise<void> {
  const stageTablePath = resolve(inputDir, 'gamedata/excel/stage_table.json')
  const stageTableText = await readFile(stageTablePath, 'utf8')
  const stageTable = JSON.parse(stageTableText) as unknown

  const storylinesReport = validateStageTableStorylinesStructure(stageTable, {
    sampleSize: 50,
    locationSampleSize: 50,
  })
  const storySetsReport = validateStageTableStorylineStorySetsStructure(stageTable, {
    sampleSize: 50,
  })

  const issueLines = [
    ...storylinesReport.issues.map((issue) => `- [storylines] ${issue.path}: ${issue.message}`),
    ...storySetsReport.issues.map(
      (issue) => `- [storylineStorySets] ${issue.path}: ${issue.message}`
    ),
  ]

  if (issueLines.length > 0) {
    throw new Error(
      [
        '[data:build] stage_table schema validation failed. Upstream field shape may have changed.',
        'Please update schema handling and, if needed, adjust contents/storyline-overrides.json.',
        ...issueLines.slice(0, 10),
      ].join('\n')
    )
  }
}

async function resolveInputDirFromCache(input: {
  locale: string
  revision?: string
  cacheRoot: string
}): Promise<string> {
  const localeDir = resolve(input.cacheRoot, input.locale)

  if (input.revision) {
    return resolve(localeDir, input.revision)
  }

  const entries = await readdir(localeDir, { withFileTypes: true })
  const revisionDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)

  if (revisionDirs.length === 0) {
    throw new Error(
      `[data:build] No synced revision found in "${localeDir}". Run "pnpm data:sync --locale ${input.locale}" first.`
    )
  }

  const revisionWithMtime = await Promise.all(
    revisionDirs.map(async (revision) => {
      const revisionDir = join(localeDir, revision)
      const metadata = await stat(revisionDir)
      return {
        revision,
        mtimeMs: metadata.mtimeMs,
      }
    })
  )

  revisionWithMtime.sort((left, right) => {
    if (left.mtimeMs !== right.mtimeMs) {
      return right.mtimeMs - left.mtimeMs
    }

    return right.revision.localeCompare(left.revision)
  })

  return resolve(localeDir, revisionWithMtime[0]!.revision)
}

export function parseDataBuildArgs(argv: readonly string[]): DataBuildCliOptions {
  const parsed = parseArgs(argv)

  return {
    locale: parsed.locale ?? DEFAULT_LOCALE,
    inputDir: parsed.inputDir,
    outputDir: parsed.outputDir ?? DEFAULT_OUTPUT_DIR,
    revision: parsed.revision,
    allowMissingStoryText: parsed.allowMissingStoryText ?? false,
  }
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const parsed: ParsedArgs = {}

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]

    if (token === '--locale') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('[data:build] Missing value for "--locale".')
      }

      parsed.locale = value
      index += 1
      continue
    }

    if (token.startsWith('--locale=')) {
      parsed.locale = token.slice('--locale='.length)
      continue
    }

    if (token === '--input-dir') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('[data:build] Missing value for "--input-dir".')
      }

      parsed.inputDir = value
      index += 1
      continue
    }

    if (token.startsWith('--input-dir=')) {
      parsed.inputDir = token.slice('--input-dir='.length)
      continue
    }

    if (token === '--output-dir') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('[data:build] Missing value for "--output-dir".')
      }

      parsed.outputDir = value
      index += 1
      continue
    }

    if (token.startsWith('--output-dir=')) {
      parsed.outputDir = token.slice('--output-dir='.length)
      continue
    }

    if (token === '--revision') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('[data:build] Missing value for "--revision".')
      }

      parsed.revision = value
      index += 1
      continue
    }

    if (token === '--allow-missing-story-text') {
      parsed.allowMissingStoryText = true
      continue
    }

    if (token.startsWith('--revision=')) {
      parsed.revision = token.slice('--revision='.length)
      continue
    }

    throw new Error(`[data:build] Unknown argument: "${token}".`)
  }

  return parsed
}

function splitEnvList(value: string | undefined): string[] {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

async function main(): Promise<void> {
  const options = parseDataBuildArgs(process.argv.slice(2))
  const result = await runDataBuild(options)
  console.log(JSON.stringify(result, null, 2))
}

if (isExecutedAsEntry(import.meta.url, process.argv[1])) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[data:build] ${message}`)
    process.exitCode = 1
  })
}

function isExecutedAsEntry(moduleUrl: string, argvPath: string | undefined): boolean {
  if (argvPath === undefined) {
    return false
  }

  return moduleUrl === pathToFileURL(resolve(argvPath)).href
}
