const TRUSTED_MEDIA_HOSTS = new Set(['prts.wiki', 'media.prts.wiki', 'ak.hycdn.cn'])

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)
  })
}

function pathSegmentsIncludeTraversal(pathname: string): boolean {
  return pathname
    .split('/')
    .filter(Boolean)
    .some((segment) => {
      try {
        return segment === '..' || decodeURIComponent(segment) === '..'
      } catch {
        return true
      }
    })
}

function hasUnsafePathTraversal(pathname: string): boolean {
  const rawPathname = pathname.split(/[?#]/, 1)[0] ?? ''

  return pathSegmentsIncludeTraversal(rawPathname)
}

export function normalizeTrustedMediaUrl(value: string): string | undefined {
  const trimmed = value.trim()

  if (
    trimmed.length === 0 ||
    trimmed.startsWith('//') ||
    trimmed.includes('\\') ||
    hasControlCharacter(trimmed)
  ) {
    return undefined
  }

  try {
    const url = new URL(trimmed)

    if (
      url.protocol !== 'https:' ||
      !TRUSTED_MEDIA_HOSTS.has(url.hostname.toLowerCase()) ||
      hasUnsafePathTraversal(trimmed)
    ) {
      return undefined
    }

    return url.toString()
  } catch {
    // Plain relative paths are handled below.
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return undefined
  }

  try {
    const relativeUrl = new URL(trimmed, 'https://arkstoryline.local/')

    if (
      relativeUrl.origin !== 'https://arkstoryline.local' ||
      hasUnsafePathTraversal(trimmed) ||
      hasUnsafePathTraversal(relativeUrl.pathname)
    ) {
      return undefined
    }

    return `${relativeUrl.pathname}${relativeUrl.search}${relativeUrl.hash}`
  } catch {
    return undefined
  }
}
