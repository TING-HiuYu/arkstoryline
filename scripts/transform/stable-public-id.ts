import type { RawStoryJsonStoryNode } from './raw-models/raw-story-json'

const STORY_PREFIX_PATTERN = /^(?:gamedata\/story\/|story\/)+/i

export function normalizeStableAlbumId(input: unknown): string {
  return toNonEmptyString(input) ?? 'album-unknown'
}

export function buildStableReviewChapterId(params: {
  albumId: unknown
  storyTxt: unknown
  storyCode: unknown
  avgTag: unknown
  storyName: unknown
}): string {
  const stableAlbumId = normalizeStableAlbumId(params.albumId)
  const storyTxt = toNonEmptyString(params.storyTxt)
  const chapterSlug = storyTxt
    ? toStoryTxtIdSegment(storyTxt)
    : buildFallbackChapterSegment([
        toNonEmptyString(params.storyCode),
        toNonEmptyString(params.avgTag),
        toNonEmptyString(params.storyName),
      ])

  return `${stableAlbumId}--${chapterSlug}`
}

export function buildStableStoryJsonChapterId(params: {
  storyCode: unknown
  avgTag: unknown
  storyName: unknown
  eventId: unknown
}): string {
  const segments = [params.storyCode, params.avgTag, params.storyName, params.eventId]
    .map((value) => toStableIdSegment(value))
    .filter((value): value is string => Boolean(value))

  if (segments.length === 0) {
    return 'storyjson-unknown-chapter'
  }

  return `storyjson-${segments.join('-')}`
}

export function buildStableStoryJsonAlbumId(params: {
  eventId: unknown
  eventName: unknown
  storyCode: unknown
}): string {
  const parts = [params.eventId, params.eventName, params.storyCode]
    .map((value) => toStableIdSegment(value))
    .filter((value): value is string => value !== null)

  if (parts.length === 0) {
    return 'storyjson-album-unknown'
  }

  return `storyjson-album-${parts[0]}`
}

export interface StableNodeIdState {
  readonly collisionsByFingerprint: Map<string, number>
}

export function createStableNodeIdState(): StableNodeIdState {
  return {
    collisionsByFingerprint: new Map<string, number>(),
  }
}

export function buildStableStoryNodeId(
  rawNodeId: string | number | undefined,
  rawNode: RawStoryJsonStoryNode,
  state: StableNodeIdState
): string {
  if (typeof rawNodeId === 'number' && Number.isFinite(rawNodeId)) {
    return `story-node-${rawNodeId}`
  }

  if (typeof rawNodeId === 'string') {
    const trimmedNodeId = rawNodeId.trim()

    if (trimmedNodeId.length > 0) {
      return `story-node-${trimmedNodeId}`
    }
  }

  const fingerprint = hashToBase36(stableStringify(rawNode))
  const seen = state.collisionsByFingerprint.get(fingerprint) ?? 0
  const nextSeen = seen + 1
  state.collisionsByFingerprint.set(fingerprint, nextSeen)

  if (nextSeen === 1) {
    return `story-node-hash-${fingerprint}`
  }

  return `story-node-hash-${fingerprint}-${nextSeen}`
}

function toStoryTxtIdSegment(storyTxt: string): string {
  const normalizedSeparators = storyTxt.replace(/\\/g, '/').replace(/^\/+/, '')
  const withoutPrefix = normalizedSeparators.replace(STORY_PREFIX_PATTERN, '')
  const withoutExtension = withoutPrefix.replace(/\.txt$/i, '')

  const segments = withoutExtension
    .split('/')
    .map((segment) => normalizePathSegment(segment))
    .filter((segment) => segment.length > 0)

  return segments.length > 0 ? segments.join('__') : 'unknown-chapter'
}

function normalizePathSegment(segment: string): string {
  return segment
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildFallbackChapterSegment(values: Array<string | undefined>): string {
  const parts = values
    .filter((value): value is string => Boolean(value))
    .map((value) => toStableIdSegment(value))
    .filter((value): value is string => Boolean(value))

  return parts.length > 0 ? parts.join('-') : 'unknown-chapter'
}

function toStableIdSegment(value: unknown): string | null {
  const text = toNonEmptyString(value)

  if (!text) {
    return null
  }

  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized.length > 0 ? normalized : null
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null'
  }

  if (typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()

  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}

function hashToBase36(value: string): string {
  let hash = 0x811c9dc5

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(36)
}
