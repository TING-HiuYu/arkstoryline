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
  const contentSource = buildContentSource({ storyCode, storyName, avgTag, storyTxt })

  const chapter: StoryChapterRef = {
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

  if (contentSource) {
    chapter.contentSource = contentSource
  }

  return chapter
}

function buildContentSource(input: {
  storyCode?: string
  storyName?: string
  avgTag?: string
  storyTxt?: string
}): StoryChapterRef['contentSource'] {
  const page = buildContentSourcePage(input)
  if (!page) {
    return undefined
  }

  return {
    provider: 'prts',
    url: `https://prts.wiki/w/${encodeWikiPath(page)}`,
    page,
    kind: 'scenario-html',
  }
}

function buildContentSourcePage(input: {
  storyCode?: string
  storyName?: string
  avgTag?: string
  storyTxt?: string
}): string | undefined {
  const guidePage = buildGuideContentSourcePage(input.storyTxt)
  if (guidePage) {
    return guidePage
  }

  if (!input.storyCode || !input.storyName) {
    return undefined
  }

  const suffix = toScenarioSuffix(input.avgTag)
  if (!suffix) {
    return undefined
  }

  return `${input.storyCode}_${input.storyName}/${suffix}`
}

function buildGuideContentSourcePage(storyTxt: string | undefined): string | undefined {
  const normalizedStoryTxt = storyTxt?.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()

  if (normalizedStoryTxt === 'obt/guide/beg/0_welcome_to_guide') {
    return 'W2G/BEG'
  }

  if (normalizedStoryTxt === 'obt/guide/beg/2_guide_to_home') {
    return 'G2H/END'
  }

  return undefined
}

function toScenarioSuffix(avgTag: string | undefined): 'BEG' | 'END' | 'NBT' | undefined {
  const normalizedAvgTag = avgTag?.trim().toLowerCase()

  if (
    normalizedAvgTag === 'before' ||
    normalizedAvgTag === '行动前' ||
    normalizedAvgTag === 'beg'
  ) {
    return 'BEG'
  }

  if (normalizedAvgTag === 'after' || normalizedAvgTag === '行动后' || normalizedAvgTag === 'end') {
    return 'END'
  }

  if (
    normalizedAvgTag === '幕间' ||
    normalizedAvgTag === 'interlude' ||
    normalizedAvgTag === 'nbt'
  ) {
    return 'NBT'
  }

  return undefined
}

function encodeWikiPath(page: string): string {
  return page
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
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
