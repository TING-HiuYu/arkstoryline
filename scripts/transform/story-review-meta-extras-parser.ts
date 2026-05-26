import type { OtherStoryRef, OtherStoryType } from '../../src/domain/catalog/other-story-ref'

export interface ParsedOtherStorys {
  byAlbumId: Record<string, OtherStoryRef[]>
}

const EXTRA_KEYS: Array<{ key: string; type: OtherStoryType }> = [
  { key: 'timeline', type: 'timeline' },
  { key: 'log', type: 'log' },
  { key: 'news', type: 'news' },
  { key: 'challengeBook', type: 'challengeBook' },
  { key: 'landmark', type: 'landmark' },
  { key: 'picture', type: 'picture' },
]

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }

  return value as Record<string, unknown>
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function toEntryArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => toRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
  }

  const asRecord = toRecord(value)

  if (!asRecord) {
    return []
  }

  return Object.values(asRecord)
    .map((item) => toRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
}

function pickTitle(entry: Record<string, unknown>): string {
  return (
    toNonEmptyString(entry.title) ??
    toNonEmptyString(entry.name) ??
    toNonEmptyString(entry.caption) ??
    toNonEmptyString(entry.id) ??
    '未命名附加档案'
  )
}

function pickPath(entry: Record<string, unknown>): string | undefined {
  return (
    toNonEmptyString(entry.path) ??
    toNonEmptyString(entry.file) ??
    toNonEmptyString(entry.filePath) ??
    toNonEmptyString(entry.url)
  )
}

function pickImageId(entry: Record<string, unknown>): string | undefined {
  return (
    toNonEmptyString(entry.imageId) ??
    toNonEmptyString(entry.picId) ??
    toNonEmptyString(entry.thumbnailId)
  )
}

function pickMusicId(entry: Record<string, unknown>): string | undefined {
  return toNonEmptyString(entry.musicId) ?? toNonEmptyString(entry.bgmId)
}

export function parseStoryReviewMetaOtherStorys(payload: unknown): ParsedOtherStorys {
  const root = toRecord(payload)
  const table = toRecord(root?.storyReviewMetaTable) ?? toRecord(root?.metaTable) ?? root

  if (!table) {
    return { byAlbumId: {} }
  }

  const byAlbumId: Record<string, OtherStoryRef[]> = {}

  for (const [albumId, rawEntry] of Object.entries(table)) {
    const entry = toRecord(rawEntry)

    if (!entry) {
      continue
    }

    const extras: OtherStoryRef[] = []

    for (const descriptor of EXTRA_KEYS) {
      const entries = toEntryArray(entry[descriptor.key])

      for (let index = 0; index < entries.length; index += 1) {
        const item = entries[index]!

        extras.push({
          id: `${albumId}-${descriptor.key}-${index + 1}`,
          albumId,
          type: descriptor.type,
          title: pickTitle(item),
          path: pickPath(item),
          imageId: pickImageId(item),
          musicId: pickMusicId(item),
          distributeMusic: false,
        })
      }
    }

    if (extras.length > 0) {
      byAlbumId[albumId] = extras
    }
  }

  return { byAlbumId }
}
