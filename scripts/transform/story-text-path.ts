export function normalizeStoryTextPath(storyTxt: string | undefined): string | undefined {
  if (!storyTxt) {
    return undefined
  }

  const trimmed = storyTxt.trim()
  if (trimmed.length === 0) {
    return undefined
  }

  const normalizedSeparators = trimmed.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/')

  const withoutPrefix = normalizedSeparators
    .replace(/^gamedata\/story\//i, '')
    .replace(/^story\//i, '')

  const withoutExtension = withoutPrefix.replace(/\.txt$/i, '')
  const normalizedStem = withoutExtension.replace(/^\/+|\/+$/g, '')
  if (normalizedStem.length === 0) {
    return undefined
  }

  return `gamedata/story/${normalizedStem}.txt`
}

export function resolveStoryTextReadCandidates(storyTxt: string | undefined): string[] {
  const normalizedPath = normalizeStoryTextPath(storyTxt)
  if (!normalizedPath) {
    return []
  }

  const legacyPath = normalizedPath.replace(/^gamedata\//i, '')
  if (legacyPath === normalizedPath) {
    return [normalizedPath]
  }

  return [normalizedPath, legacyPath]
}
