import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  type DataSourceProvider,
  GitHubRawDataSource,
  resolveRemoteSourceRevision,
} from '../src/infrastructure/data-source'
import { SCRIPT_CONFIG } from './config'
import {
  type ArkDataCache,
  FileSystemArkDataCache,
  createSyncReport,
  type SyncReportDiagnostics,
  type SyncReportFileResult,
} from './sync'
import { normalizeStoryTextPath } from './transform/story-text-path'
import type { RawStoryReviewTablePayload } from './transform/raw-models/raw-story-review-entry'

interface DataSyncCliOptions {
  locale: string
}

interface DataSyncDiagnostics {
  syncedAvgStoryTextCount: number
  failedAvgStoryTextCount: number
  failedAvgStoryTextSamples: string[]
  parseErrors: DataSyncParseError[]
  missingFiles: DataSyncMissingFile[]
}

interface DataSyncParseError {
  path: string
  stage: 'parse-story-review-table'
  message: string
}

interface DataSyncMissingFile {
  path: string
  stage: 'sync-required-avg-story-texts'
  message: string
}

interface DataSyncDependencies {
  source?: DataSourceProvider
  cache?: ArkDataCache
  now?: () => Date
}

type DataSyncStatus = 'success' | 'skipped'

type DataSyncReason =
  | 'revision-changed-or-first-sync'
  | 'revision-unchanged'
  | 'revision-unchanged-cache-incomplete'

interface ParsedArgs {
  locale?: string
}

const DEFAULT_LOCALE = SCRIPT_CONFIG.locale
const STORY_REVIEW_TABLE_PATH = 'gamedata/excel/story_review_table.json'
const STORY_REVIEW_META_TABLE_PATH = 'gamedata/excel/story_review_meta_table.json'
const CHAPTER_TABLE_PATH = 'gamedata/excel/chapter_table.json'
const STAGE_TABLE_PATH = 'gamedata/excel/stage_table.json'
const REQUIRED_CORE_CACHE_PATHS = [
  STORY_REVIEW_TABLE_PATH,
  STORY_REVIEW_META_TABLE_PATH,
  CHAPTER_TABLE_PATH,
  STAGE_TABLE_PATH,
] as const

export async function runDataSync(options: DataSyncCliOptions): Promise<{
  locale: string
  providerId: string
  revision: string
  status: DataSyncStatus
  reason: DataSyncReason
  reportPath: string
  diagnostics: DataSyncDiagnostics
}> {
  return runDataSyncWithDependencies(options)
}

export async function runDataSyncWithDependencies(
  options: DataSyncCliOptions,
  dependencies: DataSyncDependencies = {}
): Promise<{
  locale: string
  providerId: string
  revision: string
  status: DataSyncStatus
  reason: DataSyncReason
  reportPath: string
  diagnostics: DataSyncDiagnostics
}> {
  const source = dependencies.source ?? new GitHubRawDataSource()
  const cache = dependencies.cache ?? new FileSystemArkDataCache()
  const now = dependencies.now ?? (() => new Date())
  const startedAt = now()

  const revision = await resolveRemoteSourceRevision(source)
  await cache.ensureRevisionDir(options.locale, revision.commitSha)

  const existingReportPath = 'sync-report.json'
  const hasExistingReport = await cache.exists(
    options.locale,
    revision.commitSha,
    existingReportPath
  )

  const files: SyncReportFileResult[] = []
  let diagnostics: DataSyncDiagnostics = {
    syncedAvgStoryTextCount: 0,
    failedAvgStoryTextCount: 0,
    failedAvgStoryTextSamples: [],
    parseErrors: [],
    missingFiles: [],
  }

  const cacheIntegrity = hasExistingReport
    ? await checkRevisionCacheCompleteness({
        cache,
        locale: options.locale,
        revision: revision.commitSha,
      })
    : {
        isComplete: false,
      }

  const shouldReuseRevisionCache = hasExistingReport && cacheIntegrity.isComplete

  if (!shouldReuseRevisionCache) {
    const storyReviewTableText = await syncStoryReviewTable({
      source,
      cache,
      locale: options.locale,
      revision: revision.commitSha,
      files,
    })

    await syncStoryReviewMetaTable({
      source,
      cache,
      locale: options.locale,
      revision: revision.commitSha,
      files,
    })

    await syncChapterTable({
      source,
      cache,
      locale: options.locale,
      revision: revision.commitSha,
      files,
    })

    await syncStageTable({
      source,
      cache,
      locale: options.locale,
      revision: revision.commitSha,
      files,
    })

    diagnostics = await syncRequiredAvgStoryTexts({
      source,
      cache,
      locale: options.locale,
      revision: revision.commitSha,
      files,
      storyReviewTableText,
    })
  }

  const status: DataSyncStatus = shouldReuseRevisionCache ? 'skipped' : 'success'
  const reason: DataSyncReason = shouldReuseRevisionCache
    ? 'revision-unchanged'
    : hasExistingReport
      ? 'revision-unchanged-cache-incomplete'
      : 'revision-changed-or-first-sync'

  const report = createSyncReport({
    locale: options.locale,
    providerId: revision.providerId,
    revision: revision.commitSha,
    status,
    reason,
    startedAt,
    finishedAt: now(),
    files,
    diagnostics: mapDiagnosticsToSyncReportDiagnostics(diagnostics),
  })

  const reportPath = await cache.writeJson(
    options.locale,
    revision.commitSha,
    existingReportPath,
    report
  )

  return {
    locale: options.locale,
    providerId: revision.providerId,
    revision: revision.commitSha,
    status,
    reason,
    reportPath,
    diagnostics,
  }
}

async function checkRevisionCacheCompleteness(input: {
  cache: ArkDataCache
  locale: string
  revision: string
}): Promise<{
  isComplete: boolean
}> {
  for (const requiredPath of REQUIRED_CORE_CACHE_PATHS) {
    const exists = await input.cache.exists(input.locale, input.revision, requiredPath)
    if (!exists) {
      return {
        isComplete: false,
      }
    }
  }

  let storyReviewTableText: string
  try {
    storyReviewTableText = await input.cache.readText(
      input.locale,
      input.revision,
      STORY_REVIEW_TABLE_PATH
    )
  } catch {
    return {
      isComplete: false,
    }
  }

  const collectionResult = collectRequiredAvgStoryTextPaths(storyReviewTableText)
  if (collectionResult.parseErrors.length > 0) {
    return {
      isComplete: false,
    }
  }

  for (const relativeStoryPath of collectionResult.paths) {
    const exists = await input.cache.exists(input.locale, input.revision, relativeStoryPath)
    if (!exists) {
      return {
        isComplete: false,
      }
    }
  }

  return {
    isComplete: true,
  }
}

async function syncStoryReviewTable(input: {
  source: DataSourceProvider
  cache: ArkDataCache
  locale: string
  revision: string
  files: SyncReportFileResult[]
}): Promise<string> {
  return syncTextFile({
    ...input,
    path: STORY_REVIEW_TABLE_PATH,
  })
}

async function syncStoryReviewMetaTable(input: {
  source: DataSourceProvider
  cache: ArkDataCache
  locale: string
  revision: string
  files: SyncReportFileResult[]
}): Promise<void> {
  await syncTextFile({
    ...input,
    path: STORY_REVIEW_META_TABLE_PATH,
  })
}

async function syncChapterTable(input: {
  source: DataSourceProvider
  cache: ArkDataCache
  locale: string
  revision: string
  files: SyncReportFileResult[]
}): Promise<void> {
  await syncTextFile({
    ...input,
    path: CHAPTER_TABLE_PATH,
  })
}

async function syncStageTable(input: {
  source: DataSourceProvider
  cache: ArkDataCache
  locale: string
  revision: string
  files: SyncReportFileResult[]
}): Promise<void> {
  await syncTextFile({
    ...input,
    path: STAGE_TABLE_PATH,
  })
}

async function syncTextFile(input: {
  source: DataSourceProvider
  cache: ArkDataCache
  locale: string
  revision: string
  files: SyncReportFileResult[]
  path: string
}): Promise<string> {
  const sourcePath = `${input.locale}/${input.path}`

  const text = await input.source.getText(sourcePath)
  await input.cache.writeText(input.locale, input.revision, input.path, text)

  input.files.push({
    path: sourcePath,
    status: 'downloaded',
    bytes: Buffer.byteLength(text, 'utf8'),
  })

  return text
}

async function syncRequiredAvgStoryTexts(input: {
  source: DataSourceProvider
  cache: ArkDataCache
  locale: string
  revision: string
  files: SyncReportFileResult[]
  storyReviewTableText: string
}): Promise<DataSyncDiagnostics> {
  const collectionResult = collectRequiredAvgStoryTextPaths(input.storyReviewTableText)
  const failedSamples: string[] = []
  const missingFiles: DataSyncMissingFile[] = []
  let syncedCount = 0
  let failedCount = 0

  for (const path of collectionResult.paths) {
    const sourcePath = `${input.locale}/${path}`

    try {
      const text = await input.source.getText(sourcePath)
      await input.cache.writeText(input.locale, input.revision, path, text)
      input.files.push({
        path: sourcePath,
        status: 'downloaded',
        bytes: Buffer.byteLength(text, 'utf8'),
      })
      syncedCount += 1
    } catch (error) {
      const message = getErrorMessage(error)
      failedCount += 1
      failedSamples.push(sourcePath)
      if (isMissingFileError(error, sourcePath)) {
        missingFiles.push({
          path: sourcePath,
          stage: 'sync-required-avg-story-texts',
          message,
        })
      }
      input.files.push({
        path: sourcePath,
        status: 'failed',
        error: message,
      })
    }
  }

  return {
    syncedAvgStoryTextCount: syncedCount,
    failedAvgStoryTextCount: failedCount,
    failedAvgStoryTextSamples: failedSamples.slice(0, 10),
    parseErrors: collectionResult.parseErrors,
    missingFiles,
  }
}

function collectRequiredAvgStoryTextPaths(storyReviewTableText: string): {
  paths: string[]
  parseErrors: DataSyncParseError[]
} {
  const parsed = parseStoryReviewTablePayload(storyReviewTableText)
  if (parsed.payload === undefined) {
    return {
      paths: [],
      parseErrors: parsed.parseErrors,
    }
  }

  const storyPaths = new Set<string>()

  for (const entry of Object.values(parsed.payload.storyReviewTable)) {
    const infoUnlockDatas = readInfoUnlockDatas(entry)

    for (const chapter of infoUnlockDatas) {
      const storyTxt = readStoryTxt(chapter)
      if (!storyTxt) {
        continue
      }

      const normalizedPath = normalizeStoryTextPath(storyTxt)
      if (normalizedPath) {
        storyPaths.add(normalizedPath)
      }
    }
  }

  return {
    paths: [...storyPaths].sort((left, right) => left.localeCompare(right)),
    parseErrors: parsed.parseErrors,
  }
}

function parseStoryReviewTablePayload(text: string): {
  payload?: RawStoryReviewTablePayload
  parseErrors: DataSyncParseError[]
} {
  let payload: unknown

  try {
    payload = JSON.parse(text) as unknown
  } catch (error) {
    return {
      parseErrors: [
        {
          path: STORY_REVIEW_TABLE_PATH,
          stage: 'parse-story-review-table',
          message: `Failed to parse JSON: ${getErrorMessage(error)}`,
        },
      ],
    }
  }

  if (!isRecord(payload)) {
    return {
      parseErrors: [
        {
          path: STORY_REVIEW_TABLE_PATH,
          stage: 'parse-story-review-table',
          message: 'Invalid payload: missing "storyReviewTable" object.',
        },
      ],
    }
  }

  const normalizedTable = resolveStoryReviewTable(payload)
  if (normalizedTable === undefined) {
    return {
      parseErrors: [
        {
          path: STORY_REVIEW_TABLE_PATH,
          stage: 'parse-story-review-table',
          message: 'Invalid payload: missing "storyReviewTable" object.',
        },
      ],
    }
  }

  return {
    payload: {
      storyReviewTable: normalizedTable,
    },
    parseErrors: [],
  }
}

function resolveStoryReviewTable(
  payload: Record<string, unknown>
): RawStoryReviewTablePayload['storyReviewTable'] | undefined {
  if (isRecord(payload.storyReviewTable)) {
    return payload.storyReviewTable as RawStoryReviewTablePayload['storyReviewTable']
  }

  // Upstream format may expose entries directly at the top level.
  if (Object.keys(payload).length > 0) {
    return payload as RawStoryReviewTablePayload['storyReviewTable']
  }

  return undefined
}

function readInfoUnlockDatas(entry: unknown): unknown[] {
  if (!isRecord(entry) || !Array.isArray(entry.infoUnlockDatas)) {
    return []
  }

  return entry.infoUnlockDatas
}

function readStoryTxt(chapter: unknown): string | undefined {
  if (!isRecord(chapter) || typeof chapter.storyTxt !== 'string') {
    return undefined
  }

  const value = chapter.storyTxt.trim()
  return value.length > 0 ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

function isMissingFileError(error: unknown, sourcePath: string): boolean {
  const message = getErrorMessage(error).toLowerCase()
  return (
    message.includes('missing') ||
    message.includes('not found') ||
    message.includes('404') ||
    message.includes(sourcePath.toLowerCase())
  )
}

function mapDiagnosticsToSyncReportDiagnostics(
  diagnostics: DataSyncDiagnostics
): SyncReportDiagnostics {
  return {
    parseErrors: diagnostics.parseErrors.map((item) => ({
      path: item.path,
      stage: item.stage,
      message: item.message,
    })),
    missingFiles: diagnostics.missingFiles.map((item) => ({
      path: item.path,
      stage: item.stage,
      message: item.message,
    })),
  }
}

export function parseDataSyncArgs(argv: readonly string[]): DataSyncCliOptions {
  const parsed = parseArgs(argv)
  const locale = parsed.locale ?? DEFAULT_LOCALE

  if (locale.trim().length === 0) {
    throw new Error('[data:sync] "--locale" must not be empty.')
  }

  return {
    locale,
  }
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const parsed: ParsedArgs = {}

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]

    if (token === '--locale') {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error('[data:sync] Missing value for "--locale".')
      }

      parsed.locale = value
      index += 1
      continue
    }

    if (token.startsWith('--locale=')) {
      parsed.locale = token.slice('--locale='.length)
      continue
    }

    throw new Error(`[data:sync] Unknown argument: "${token}".`)
  }

  return parsed
}

async function main(): Promise<void> {
  const options = parseDataSyncArgs(process.argv.slice(2))
  const result = await runDataSyncWithDependencies(options)

  console.log(
    JSON.stringify(
      {
        commandStatus: 'ok',
        command: 'data:sync',
        ...result,
      },
      null,
      2
    )
  )
}

if (isExecutedAsEntry(import.meta.url, process.argv[1])) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[data:sync] ${message}`)
    process.exitCode = 1
  })
}

function isExecutedAsEntry(moduleUrl: string, argvPath: string | undefined): boolean {
  if (argvPath === undefined) {
    return false
  }

  return moduleUrl === pathToFileURL(resolve(argvPath)).href
}
