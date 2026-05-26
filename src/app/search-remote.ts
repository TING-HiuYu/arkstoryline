import type { AppLocale } from './i18n'

export interface RemoteSearchResult {
  id: string
  title: string
  excerpt?: string
  albumTitle?: string
  album?: number
  secondary?: string
  targetPath?: string
}

export async function fetchRemoteSearchResults(
  endpoint: string,
  locale: AppLocale,
  keyword: string,
  options: { signal?: AbortSignal } = {}
): Promise<RemoteSearchResult[]> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ locale, query: keyword }),
    signal: options.signal,
  })

  if (!response.ok) {
    throw new Error(`Remote search failed: ${response.status}`)
  }

  const payload = (await response.json()) as { results?: RemoteSearchResult[] }
  return Array.isArray(payload.results) ? payload.results.map(sanitizeRemoteSearchResult) : []
}

function sanitizeRemoteSearchResult(result: RemoteSearchResult): RemoteSearchResult {
  return {
    ...result,
    targetPath: sanitizeRemoteSearchTargetPath(result.targetPath),
  }
}

export function sanitizeRemoteSearchTargetPath(targetPath: string | undefined): string | undefined {
  if (!targetPath) {
    return undefined
  }

  const trimmedPath = targetPath.trim()

  if (
    !trimmedPath.startsWith('/') ||
    trimmedPath.startsWith('//') ||
    trimmedPath.includes('\\') ||
    hasControlCharacter(trimmedPath)
  ) {
    return undefined
  }

  try {
    const parsedUrl = new URL(trimmedPath, window.location.origin)

    if (parsedUrl.origin !== window.location.origin) {
      return undefined
    }

    return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`
  } catch {
    return undefined
  }
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)
  })
}
