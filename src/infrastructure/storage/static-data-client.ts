import type { AppLocale } from '../../app/i18n'
import { STATIC_DATA_BASE_URL } from '../../app/config'

export interface StaticDataManifest {
  schemaVersion: number
  locale: string
  generatedAt: string
  source: {
    providerId: string
    commitSha: string
  }
  files: Record<string, string>
}

export function normalizeStaticDataRelativePath(relativePath: string): string {
  const trimmedPath = relativePath.trim()

  if (!trimmedPath) {
    throw new Error('Static data path must not be empty.')
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmedPath) || trimmedPath.startsWith('//')) {
    throw new Error(`Unsafe static data path: ${relativePath}`)
  }

  const normalizedPath = trimmedPath.replace(/^\/+/, '').replace(/^data\/+/, '')
  const segments = normalizedPath.split('/')

  if (segments.some((segment) => !isSafeStaticPathSegment(segment))) {
    throw new Error(`Unsafe static data path: ${relativePath}`)
  }

  return segments.join('/')
}

export function buildStaticDataPath(locale: AppLocale, relativePath: string): string {
  const normalizedPath = normalizeStaticDataRelativePath(relativePath)
  return `${STATIC_DATA_BASE_URL}/${locale}/${normalizedPath}`
}

export async function loadStaticManifest(
  locale: AppLocale,
  fetchImpl: typeof fetch = fetch
): Promise<StaticDataManifest> {
  const response = await fetchImpl(buildStaticDataPath(locale, 'manifest.json'))

  if (!response.ok) {
    throw new Error(
      `Failed to load static manifest: HTTP ${response.status} ${response.statusText}`
    )
  }

  return (await response.json()) as StaticDataManifest
}

function isSafeStaticPathSegment(segment: string): boolean {
  if (!segment || segment === '.' || segment === '..' || segment.includes('\\')) {
    return false
  }

  let decodedSegment: string
  try {
    decodedSegment = decodeURIComponent(segment)
  } catch {
    return false
  }

  return (
    decodedSegment.length > 0 &&
    decodedSegment !== '.' &&
    decodedSegment !== '..' &&
    !decodedSegment.includes('..') &&
    !decodedSegment.includes('/') &&
    !decodedSegment.includes('\\')
  )
}
