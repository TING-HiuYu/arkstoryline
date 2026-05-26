import type { HomeSection } from '../../src/domain/catalog/home-section'
import type { StoryAlbumCover } from '../../src/domain/catalog/story-album-cover'
import type { SourceRef } from '../../src/domain/catalog/source-ref'
import type { StoryEntryType, StoryAlbum } from '../../src/domain/catalog/story-album'
import type { RawStoryReviewEntry } from './raw-models/raw-story-review-entry'
import { mapReviewEntryTypeToEntryType } from './review-entry-type-mapper'
import { normalizeStableAlbumId } from './stable-public-id'
import { mapStorylineStorySetTypeToEntryType } from './storyline-story-set-entry-type-mapper'
import { type BuildUrlSlugResult, type UrlSlugFallbackReason, buildUrlSlug } from './url-slug'

export interface AlbumSlugFallbackDiagnostic {
  id: string
  title: string
  slug: string
  source: Exclude<BuildUrlSlugResult['source'], 'title'>
  reason: UrlSlugFallbackReason
}

export interface MapReviewEntryToAlbumOptions {
  slugify?: (input: { id: string; entry: RawStoryReviewEntry; title: string }) => string
  onSlugFallback?: (diagnostic: AlbumSlugFallbackDiagnostic) => void
  resolveEntryType?: (input: {
    id: string
    entry: RawStoryReviewEntry
  }) => StoryEntryType | undefined
  resolveStorylineStorySetType?: (input: {
    id: string
    entry: RawStoryReviewEntry
  }) => string | undefined
  resolveHomeSection?: (input: {
    id: string
    entry: RawStoryReviewEntry
    albumKind: StoryEntryType
  }) => HomeSection | undefined
  resolveTimelineRank?: (input: {
    id: string
    entry: RawStoryReviewEntry
    startTime?: number
  }) => number | undefined
  resolveGameOrderRank?: (input: { id: string; entry: RawStoryReviewEntry }) => number | undefined
  resolveSide?: (input: {
    id: string
    entry: RawStoryReviewEntry
  }) => StoryAlbum['side'] | undefined
  resolveCover?: (input: { id: string; entry: RawStoryReviewEntry }) => StoryAlbumCover | undefined
  source?: Partial<SourceRef>
}

const FALLBACK_TIMELINE_RANK = Number.MAX_SAFE_INTEGER

export function mapReviewEntryToAlbum(
  id: string,
  entry: RawStoryReviewEntry,
  options: MapReviewEntryToAlbumOptions = {}
): StoryAlbum {
  const stableId = normalizeStableAlbumId(id)
  const title = toNonEmptyString(entry.name) ?? stableId
  const startTime = toFiniteNumber(entry.startTime)
  const resolvedStorySetType = options.resolveStorylineStorySetType?.({ id: stableId, entry })
  const albumKind =
    options.resolveEntryType?.({ id: stableId, entry }) ??
    mapStorylineStorySetTypeToEntryType(resolvedStorySetType) ??
    inferEntryTypeFromStableId(stableId) ??
    mapReviewEntryTypeToEntryType(toNonEmptyString(entry.albumKind)) ??
    'sidestory'
  const homeSection =
    options.resolveHomeSection?.({ id: stableId, entry, albumKind }) ??
    defaultHomeSection(albumKind)
  const timelineRank =
    options.resolveTimelineRank?.({ id: stableId, entry, startTime }) ??
    startTime ??
    FALLBACK_TIMELINE_RANK
  const gameOrderRank = options.resolveGameOrderRank?.({ id: stableId, entry })
  const side = options.resolveSide?.({ id: stableId, entry })
  const cover = options.resolveCover?.({ id: stableId, entry })

  return {
    id: stableId,
    slug: createSlug(stableId, title, entry, options),
    title,
    sourceEntryType: toNonEmptyString(entry.albumKind) ?? 'UNKNOWN',
    albumKind,
    homeSection,
    timelineRank,
    gameOrderRank,
    ...(cover ? { cover } : {}),
    startTime,
    side,
    chapters: [],
    source: buildSource(stableId, options.source),
  }
}

function createSlug(
  id: string,
  title: string,
  entry: RawStoryReviewEntry,
  options: MapReviewEntryToAlbumOptions
): string {
  const resolvedByHook = options.slugify?.({ id, entry, title })

  if (resolvedByHook) {
    return resolvedByHook
  }

  const slugResult = buildUrlSlug({
    title,
    stableId: id,
    fallbackSlug: 'album-unknown',
  })

  if (slugResult.source !== 'title' && slugResult.reason) {
    options.onSlugFallback?.({
      id,
      title,
      slug: slugResult.slug,
      source: slugResult.source,
      reason: slugResult.reason,
    })
  }

  return slugResult.slug
}

function buildSource(id: string, source: Partial<SourceRef> | undefined): SourceRef {
  return {
    providerId: source?.providerId ?? 'unknown-provider',
    revision: source?.revision ?? 'unknown-revision',
    path: source?.path ?? `story_review_table.storyReviewTable.${id}`,
  }
}

function defaultHomeSection(albumKind: StoryEntryType): HomeSection {
  if (albumKind === 'intermezzi' || albumKind === 'sidestory' || albumKind === 'sideStory') {
    return 'sideStory'
  }

  if (albumKind === 'operatorRecord') {
    return 'operatorRecord'
  }

  return 'mainline'
}

function inferEntryTypeFromStableId(id: string): StoryEntryType | undefined {
  return id.startsWith('story_') ? 'operatorRecord' : undefined
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
