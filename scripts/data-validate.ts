import { readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { SCRIPT_CONFIG } from './config'

interface DataValidateCliOptions {
  locale: string
  dataDir: string
}

interface ParsedArgs {
  locale?: string
  dataDir?: string
}

interface ValidationIssue {
  path: string
  message: string
}

interface BuildManifest {
  schemaVersion: number
  locale: string
  generatedAt: string
  source: {
    providerId: string
    commitSha: string
  }
  files: Record<string, string>
}

const DEFAULT_LOCALE = SCRIPT_CONFIG.locale
const DEFAULT_DATA_DIR = SCRIPT_CONFIG.dataDir

const REQUIRED_ROOT_FILES = ['manifest.json', 'catalog.json', 'timeline.json', 'search-index.json']

export async function runDataValidate(options: DataValidateCliOptions): Promise<{
  commandStatus: 'ok' | 'failed'
  command: 'data:validate'
  locale: string
  dataDir: string
  valid: boolean
  issues: ValidationIssue[]
}> {
  const localeDir = resolve(options.dataDir, options.locale)
  const issues: ValidationIssue[] = []

  for (const relativePath of REQUIRED_ROOT_FILES) {
    await ensureFileExists(localeDir, relativePath, issues)
  }

  const manifest = await readManifest(localeDir, issues)

  if (manifest) {
    validateManifestShape(manifest, issues)

    for (const [relativePath] of Object.entries(manifest.files)) {
      await ensureFileExists(localeDir, relativePath, issues)
    }
  }

  await ensureDirectoryHasJsonFiles(localeDir, 'albums', issues)
  await ensureDirectoryHasJsonFiles(localeDir, 'chapters', issues)

  return {
    commandStatus: issues.length === 0 ? 'ok' : 'failed',
    command: 'data:validate',
    locale: options.locale,
    dataDir: localeDir,
    valid: issues.length === 0,
    issues,
  }
}

async function readManifest(
  localeDir: string,
  issues: ValidationIssue[]
): Promise<BuildManifest | null> {
  const manifestPath = join(localeDir, 'manifest.json')

  try {
    const text = await readFile(manifestPath, 'utf8')
    return JSON.parse(text) as BuildManifest
  } catch (error) {
    issues.push({
      path: manifestPath,
      message: `Failed to read manifest.json: ${error instanceof Error ? error.message : String(error)}`,
    })
    return null
  }
}

function validateManifestShape(manifest: BuildManifest, issues: ValidationIssue[]): void {
  if (!Number.isInteger(manifest.schemaVersion) || manifest.schemaVersion <= 0) {
    issues.push({
      path: 'manifest.schemaVersion',
      message: 'schemaVersion must be a positive integer.',
    })
  }

  if (typeof manifest.locale !== 'string' || manifest.locale.trim().length === 0) {
    issues.push({
      path: 'manifest.locale',
      message: 'locale must be a non-empty string.',
    })
  }

  if (
    typeof manifest.source?.providerId !== 'string' ||
    manifest.source.providerId.trim().length === 0
  ) {
    issues.push({
      path: 'manifest.source.providerId',
      message: 'source.providerId must be a non-empty string.',
    })
  }

  if (
    typeof manifest.source?.commitSha !== 'string' ||
    manifest.source.commitSha.trim().length === 0
  ) {
    issues.push({
      path: 'manifest.source.commitSha',
      message: 'source.commitSha must be a non-empty string.',
    })
  }

  if (!manifest.files || typeof manifest.files !== 'object') {
    issues.push({
      path: 'manifest.files',
      message: 'files must be an object map of file checksums.',
    })
  }
}

async function ensureFileExists(
  localeDir: string,
  relativePath: string,
  issues: ValidationIssue[]
): Promise<void> {
  const fullPath = join(localeDir, relativePath)

  try {
    const metadata = await stat(fullPath)
    if (!metadata.isFile()) {
      issues.push({
        path: fullPath,
        message: 'Expected a file but found a non-file entry.',
      })
    }
  } catch {
    issues.push({
      path: fullPath,
      message: 'File does not exist.',
    })
  }
}

async function ensureDirectoryHasJsonFiles(
  localeDir: string,
  relativePath: 'albums' | 'chapters',
  issues: ValidationIssue[]
): Promise<void> {
  const fullPath = join(localeDir, relativePath)

  try {
    const entries = await readdir(fullPath, { withFileTypes: true })
    const jsonFileCount = entries.filter(
      (entry) => entry.isFile() && entry.name.endsWith('.json')
    ).length

    if (jsonFileCount === 0) {
      issues.push({
        path: fullPath,
        message: `Directory "${relativePath}" must contain at least one .json file.`,
      })
    }
  } catch {
    issues.push({
      path: fullPath,
      message: 'Directory does not exist.',
    })
  }
}

export function parseDataValidateArgs(argv: readonly string[]): DataValidateCliOptions {
  const parsed = parseArgs(argv)

  return {
    locale: parsed.locale ?? DEFAULT_LOCALE,
    dataDir: parsed.dataDir ?? DEFAULT_DATA_DIR,
  }
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const parsed: ParsedArgs = {}

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]

    if (token === '--locale') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('[data:validate] Missing value for "--locale".')
      }

      parsed.locale = value
      index += 1
      continue
    }

    if (token.startsWith('--locale=')) {
      parsed.locale = token.slice('--locale='.length)
      continue
    }

    if (token === '--data-dir') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('[data:validate] Missing value for "--data-dir".')
      }

      parsed.dataDir = value
      index += 1
      continue
    }

    if (token.startsWith('--data-dir=')) {
      parsed.dataDir = token.slice('--data-dir='.length)
      continue
    }

    throw new Error(`[data:validate] Unknown argument: "${token}".`)
  }

  return parsed
}

async function main(): Promise<void> {
  const options = parseDataValidateArgs(process.argv.slice(2))
  const report = await runDataValidate(options)
  console.log(JSON.stringify(report, null, 2))

  if (!report.valid) {
    process.exitCode = 1
  }
}

if (isExecutedAsEntry(import.meta.url, process.argv[1])) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[data:validate] ${message}`)
    process.exitCode = 1
  })
}

function isExecutedAsEntry(moduleUrl: string, argvPath: string | undefined): boolean {
  if (argvPath === undefined) {
    return false
  }

  return moduleUrl === pathToFileURL(resolve(argvPath)).href
}
