import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { SCRIPT_CONFIG } from '../config'

export interface ArkDataCacheLocation {
  rootDir: string
  localeDir: string
  revisionDir: string
}

export interface ArkDataCache {
  resolveLocation(locale: string, revision: string): ArkDataCacheLocation
  ensureRevisionDir(locale: string, revision: string): Promise<ArkDataCacheLocation>
  writeText(
    locale: string,
    revision: string,
    relativePath: string,
    content: string
  ): Promise<string>
  writeJson<T>(locale: string, revision: string, relativePath: string, value: T): Promise<string>
  readText(locale: string, revision: string, relativePath: string): Promise<string>
  readJson<T>(locale: string, revision: string, relativePath: string): Promise<T>
  exists(locale: string, revision: string, relativePath?: string): Promise<boolean>
}

export interface FileSystemArkDataCacheOptions {
  baseDir?: string
}

const DEFAULT_CACHE_BASE_DIR = resolve(process.cwd(), SCRIPT_CONFIG.arkDataCacheDir)

export class FileSystemArkDataCache implements ArkDataCache {
  private readonly baseDir: string

  public constructor(options: FileSystemArkDataCacheOptions = {}) {
    this.baseDir = resolve(options.baseDir ?? DEFAULT_CACHE_BASE_DIR)
  }

  public resolveLocation(locale: string, revision: string): ArkDataCacheLocation {
    const normalizedLocale = normalizePathSegment(locale, 'locale')
    const normalizedRevision = normalizePathSegment(revision, 'revision')
    const rootDir = this.baseDir
    const localeDir = join(rootDir, normalizedLocale)
    const revisionDir = join(localeDir, normalizedRevision)

    return {
      rootDir,
      localeDir,
      revisionDir,
    }
  }

  public async ensureRevisionDir(locale: string, revision: string): Promise<ArkDataCacheLocation> {
    const location = this.resolveLocation(locale, revision)
    await mkdir(location.revisionDir, { recursive: true })
    return location
  }

  public async writeText(
    locale: string,
    revision: string,
    relativePath: string,
    content: string
  ): Promise<string> {
    const filePath = this.resolveEntryPath(locale, revision, relativePath)
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, content, 'utf8')
    return filePath
  }

  public async writeJson<T>(
    locale: string,
    revision: string,
    relativePath: string,
    value: T
  ): Promise<string> {
    const serialized = JSON.stringify(value, null, 2)
    return this.writeText(locale, revision, relativePath, `${serialized}\n`)
  }

  public async readText(locale: string, revision: string, relativePath: string): Promise<string> {
    const filePath = this.resolveEntryPath(locale, revision, relativePath)
    return readFile(filePath, 'utf8')
  }

  public async readJson<T>(locale: string, revision: string, relativePath: string): Promise<T> {
    const text = await this.readText(locale, revision, relativePath)

    try {
      return JSON.parse(text) as T
    } catch (error) {
      throw new Error(
        `[FileSystemArkDataCache] Failed to parse JSON at "${relativePath}": ${getErrorMessage(error)}`,
        { cause: error }
      )
    }
  }

  public async exists(locale: string, revision: string, relativePath?: string): Promise<boolean> {
    const targetPath =
      relativePath === undefined
        ? this.resolveLocation(locale, revision).revisionDir
        : this.resolveEntryPath(locale, revision, relativePath)

    try {
      await stat(targetPath)
      return true
    } catch {
      return false
    }
  }

  private resolveEntryPath(locale: string, revision: string, relativePath: string): string {
    const location = this.resolveLocation(locale, revision)
    const normalizedRelativePath = normalizeRelativePath(relativePath)
    return join(location.revisionDir, normalizedRelativePath)
  }
}

function normalizePathSegment(value: string, field: 'locale' | 'revision'): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`[FileSystemArkDataCache] ${field} must not be empty.`)
  }

  if (normalized.includes('/') || normalized.includes('\\')) {
    throw new Error(
      `[FileSystemArkDataCache] ${field} must not contain path separators: "${value}"`
    )
  }

  if (normalized === '.' || normalized === '..') {
    throw new Error(`[FileSystemArkDataCache] ${field} must not be "." or "..": "${value}"`)
  }

  return normalized
}

function normalizeRelativePath(relativePath: string): string {
  const normalized = relativePath.trim().replace(/\\/g, '/').replace(/^\/+/, '')
  if (normalized.length === 0) {
    throw new Error('[FileSystemArkDataCache] relativePath must not be empty.')
  }

  if (normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(
      `[FileSystemArkDataCache] relativePath must stay within revision directory: "${relativePath}"`
    )
  }

  if (normalized === '..') {
    throw new Error(
      `[FileSystemArkDataCache] relativePath must stay within revision directory: "${relativePath}"`
    )
  }

  return normalized
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
