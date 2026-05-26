import type { StoryAlbum } from '../catalog/story-album'
import type {
  MainlineChapterRange,
  RawChapterTable,
  RawStageTable,
  StorylineOrderService,
  StorylineOverride,
} from './storyline-order-service'
import type { TimelineRule } from './timeline-rule'

type SupportedStorySetType = 'MAINLINE' | 'SS' | 'COLLECT' | 'NONE'

type StorylineClassification = Pick<TimelineRule, 'section' | 'side'>

interface ClassifiedStorySet {
  albumId: string
  sortByYear: number
  sortWithinYear: number
  section: TimelineRule['section']
  side?: TimelineRule['side']
}

const STORY_SET_CLASSIFICATION: Record<SupportedStorySetType, StorylineClassification> = {
  MAINLINE: {
    section: 'mainline',
    side: 'left',
  },
  SS: {
    section: 'mainline',
    side: 'right',
  },
  COLLECT: {
    section: 'sideStory',
  },
  NONE: {
    section: 'operatorRecord',
  },
}

export function buildStorylineStorySetClassificationRules(
  stageTable: RawStageTable,
  albums: StoryAlbum[]
): TimelineRule[] {
  const albumById = new Map<string, StoryAlbum>(albums.map((album) => [album.id, album]))
  const classifiedStorySets: ClassifiedStorySet[] = []

  for (const storySet of stageTable.storylineStorySets) {
    const classification = resolveStorylineClassification(storySet.storySetType)

    if (!classification) {
      continue
    }

    const album = albumById.get(storySet.storySetId)

    if (!album) {
      continue
    }

    classifiedStorySets.push({
      albumId: album.id,
      sortByYear: storySet.sortByYear,
      sortWithinYear: storySet.sortWithinYear,
      section: classification.section,
      side: classification.side,
    })
  }

  const mainlineStorySets = classifiedStorySets
    .filter((storySet) => storySet.section === 'mainline')
    .sort(compareStorylineOrder)
  const nonMainTimelineStorySets = classifiedStorySets
    .filter((storySet) => storySet.section !== 'mainline')
    .sort(compareStorylineOrder)

  const rankedMainTimelineRules: TimelineRule[] = mainlineStorySets.map((storySet, index) => ({
    albumId: storySet.albumId,
    timelineRank: index + 1,
    section: storySet.section,
    side: storySet.side,
    reason: 'storyline-story-set',
  }))

  const rankedNonMainTimelineRules: TimelineRule[] = nonMainTimelineStorySets.map(
    (storySet, index) => ({
      albumId: storySet.albumId,
      timelineRank: rankedMainTimelineRules.length + index + 1,
      section: storySet.section,
      side: storySet.side,
      reason: 'storyline-story-set',
    })
  )

  return [...rankedMainTimelineRules, ...rankedNonMainTimelineRules]
}

function compareStorylineOrder(a: ClassifiedStorySet, b: ClassifiedStorySet): number {
  if (a.sortByYear !== b.sortByYear) {
    return a.sortByYear - b.sortByYear
  }

  if (a.sortWithinYear !== b.sortWithinYear) {
    return a.sortWithinYear - b.sortWithinYear
  }

  return a.albumId.localeCompare(b.albumId)
}

function resolveStorylineClassification(storySetType: string): StorylineClassification | undefined {
  return STORY_SET_CLASSIFICATION[storySetType as SupportedStorySetType]
}

function toMainlineChapterRange(
  chapter: RawChapterTable['chapters'][string]
): MainlineChapterRange | undefined {
  const chapterIndex = parseChapterIndex(chapter.chapterIndex)

  if (chapterIndex === undefined) {
    return undefined
  }

  if (!chapter.startZoneId || !chapter.endZoneId) {
    return undefined
  }

  return {
    chapterIndex,
    startZoneId: chapter.startZoneId,
    endZoneId: chapter.endZoneId,
  }
}

function parseChapterIndex(chapterIndex: number | string): number | undefined {
  if (typeof chapterIndex === 'number') {
    return Number.isFinite(chapterIndex) ? chapterIndex : undefined
  }

  const normalized = chapterIndex.trim()

  if (!normalized) {
    return undefined
  }

  const parsedChapterIndex = Number(normalized)

  return Number.isFinite(parsedChapterIndex) ? parsedChapterIndex : undefined
}

function compareMainlineChapterRange(a: MainlineChapterRange, b: MainlineChapterRange): number {
  if (a.chapterIndex !== b.chapterIndex) {
    return a.chapterIndex - b.chapterIndex
  }

  if (a.startZoneId !== b.startZoneId) {
    return a.startZoneId.localeCompare(b.startZoneId)
  }

  return a.endZoneId.localeCompare(b.endZoneId)
}

function compareTimelineRule(a: TimelineRule, b: TimelineRule): number {
  if (a.timelineRank !== b.timelineRank) {
    return a.timelineRank - b.timelineRank
  }

  return a.albumId.localeCompare(b.albumId)
}

function resolveFallbackTimelineRank(
  album: StoryAlbum,
  override: StorylineOverride
): number | undefined {
  const candidate = override.timelineRank ?? album.timelineRank

  return Number.isFinite(candidate) ? candidate : undefined
}

function resolveFallbackSide(
  album: StoryAlbum,
  section: StorylineOverride['section']
): TimelineRule['side'] | undefined {
  if (section !== 'mainline') {
    return undefined
  }

  if (album.side === 'left' || album.side === 'right') {
    return album.side
  }

  if (album.albumKind === 'mainline') {
    return 'left'
  }

  if (album.albumKind === 'intermezzi') {
    return 'right'
  }

  return undefined
}

export const defaultStorylineOrderService: StorylineOrderService = {
  buildStorylineOrder(stageTable: RawStageTable, albums: StoryAlbum[]): TimelineRule[] {
    return buildStorylineStorySetClassificationRules(stageTable, albums)
  },
  buildMainlineChapterRanges(chapterTable: RawChapterTable): MainlineChapterRange[] {
    const ranges = Object.values(chapterTable.chapters)
      .map(toMainlineChapterRange)
      .filter((range): range is MainlineChapterRange => range !== undefined)

    ranges.sort(compareMainlineChapterRange)

    return ranges
  },
  buildFallbackOrder(albums: StoryAlbum[], overrides: StorylineOverride[]): TimelineRule[] {
    const albumById = new Map<string, StoryAlbum>(albums.map((album) => [album.id, album]))
    const fallbackRules: TimelineRule[] = []

    for (const override of overrides) {
      const album = albumById.get(override.albumId)

      if (!album) {
        continue
      }

      const timelineRank = resolveFallbackTimelineRank(album, override)

      if (timelineRank === undefined) {
        continue
      }

      fallbackRules.push({
        albumId: album.id,
        timelineRank,
        section: override.section,
        side: resolveFallbackSide(album, override.section),
        reason: 'manual-override',
      })
    }

    const sortedRules = fallbackRules.sort(compareTimelineRule)
    const seenAlbumIds = new Set<string>()

    return sortedRules.filter((rule) => {
      if (seenAlbumIds.has(rule.albumId)) {
        return false
      }

      seenAlbumIds.add(rule.albumId)
      return true
    })
  },
}
