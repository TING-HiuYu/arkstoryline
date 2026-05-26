import type { StoryChapterRef } from '../../src/domain/catalog/story-chapter-ref'
import type { RawInfoUnlockData } from './raw-models/raw-info-unlock-data'
import { buildStableReviewChapterId, normalizeStableAlbumId } from './stable-public-id'

export function mapReviewStoryToChapter(
  albumId: string,
  story: RawInfoUnlockData
): StoryChapterRef {
  const normalizedAlbumId = normalizeStableAlbumId(albumId)
  const storyCode = toTrimmedString(story.storyCode)
  const storyName = toTrimmedString(story.storyName)
  const avgTag = toTrimmedString(story.avgTag)
  const storyTxt = toTrimmedString(story.storyTxt)
  const chapterId = buildStableReviewChapterId({
    albumId: normalizedAlbumId,
    storyTxt,
    storyCode,
    avgTag,
    storyName,
  })

  return {
    id: chapterId,
    albumId: normalizedAlbumId,
    title: storyName ?? storyCode ?? 'Untitled chapter',
    code: storyCode,
    avgTag,
    sort: toSortValue(story.storySort),
    path: `chapters/${chapterId}.json`,
    infoPath: undefined,
    downloadable: Boolean(storyTxt),
  }
}

function toSortValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  return 0
}

function toTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}
