import type { StoryAlbum } from '../../src/domain/catalog/story-album'
import { defaultStorylineOrderService } from '../../src/domain/timeline/default-storyline-order-service'
import type {
  RawStageTable,
  StorylineOrderService,
} from '../../src/domain/timeline/storyline-order-service'
import type { TimelineRule } from '../../src/domain/timeline/timeline-rule'

import { readStorylineOverrides } from './storyline-overrides'

const MAIN_TIMELINE_ALLOWED_ENTRY_TYPES = new Set<StoryAlbum['albumKind']>([
  'mainline',
  'intermezzi',
])

export interface BuildTimelineRulesInput {
  stageTable: RawStageTable
  albums: StoryAlbum[]
  overridesFilePath?: string
  storylineOrderService?: StorylineOrderService
}

export async function buildTimelineRules(input: BuildTimelineRulesInput): Promise<TimelineRule[]> {
  const storylineOrderService = input.storylineOrderService ?? defaultStorylineOrderService

  const storylineRules = storylineOrderService.buildStorylineOrder(input.stageTable, input.albums)

  const overridesConfig = await readStorylineOverrides(input.overridesFilePath)
  const fallbackRules = storylineOrderService.buildFallbackOrder(
    input.albums,
    overridesConfig.overrides
  )

  const mergedRules = appendFallbackTimelineRules(storylineRules, fallbackRules)
  const albumById = new Map<string, StoryAlbum>(input.albums.map((album) => [album.id, album]))

  const filteredRules = mergedRules.filter((rule) =>
    isMainTimelineEntryTypeAllowed(rule, albumById.get(rule.albumId))
  )
  const withOperatorRecordRules = appendDefaultOperatorRecordRules(filteredRules, input.albums)

  return normalizeMainTimelineRanks(withOperatorRecordRules)
}

function appendDefaultOperatorRecordRules(
  rules: TimelineRule[],
  albums: StoryAlbum[]
): TimelineRule[] {
  const albumIdsInRules = new Set<string>(rules.map((rule) => rule.albumId))
  const maxTimelineRank = rules.reduce((maxRank, rule) => Math.max(maxRank, rule.timelineRank), 0)

  const missingOperatorRecordAlbums = albums
    .filter((album) => album.albumKind === 'operatorRecord')
    .filter((album) => album.chapters.some((chapter) => chapter.downloadable))
    .filter((album) => !albumIdsInRules.has(album.id))
    .sort(compareOperatorRecordAlbum)

  const generatedRules: TimelineRule[] = missingOperatorRecordAlbums.map((album, index) => ({
    albumId: album.id,
    timelineRank: maxTimelineRank + index + 1,
    section: 'operatorRecord',
    reason: 'operator-record-default',
  }))

  return [...rules, ...generatedRules].sort(compareTimelineRule)
}

function compareOperatorRecordAlbum(left: StoryAlbum, right: StoryAlbum): number {
  const leftTitle = left.title.normalize('NFKC')
  const rightTitle = right.title.normalize('NFKC')
  const titleCompare = leftTitle.localeCompare(rightTitle, 'zh-Hans-CN')

  if (titleCompare !== 0) {
    return titleCompare
  }

  const leftChapterSort = left.chapters.reduce(
    (minSort, chapter) => Math.min(minSort, chapter.sort),
    Number.MAX_SAFE_INTEGER
  )
  const rightChapterSort = right.chapters.reduce(
    (minSort, chapter) => Math.min(minSort, chapter.sort),
    Number.MAX_SAFE_INTEGER
  )

  if (leftChapterSort !== rightChapterSort) {
    return leftChapterSort - rightChapterSort
  }

  return left.id.localeCompare(right.id)
}

export function appendFallbackTimelineRules(
  storylineRules: TimelineRule[],
  fallbackRules: TimelineRule[]
): TimelineRule[] {
  const mergedRules = [...storylineRules]
  const albumIdsInStorylineRules = new Set<string>(storylineRules.map((rule) => rule.albumId))

  const sortedFallbackRules = [...fallbackRules].sort(compareTimelineRule)

  for (const fallbackRule of sortedFallbackRules) {
    if (albumIdsInStorylineRules.has(fallbackRule.albumId)) {
      continue
    }

    albumIdsInStorylineRules.add(fallbackRule.albumId)
    mergedRules.push(fallbackRule)
  }

  return mergedRules.sort(compareTimelineRule)
}

function compareTimelineRule(a: TimelineRule, b: TimelineRule): number {
  if (a.timelineRank !== b.timelineRank) {
    return a.timelineRank - b.timelineRank
  }

  return a.albumId.localeCompare(b.albumId)
}

function isMainTimelineEntryTypeAllowed(
  rule: TimelineRule,
  album: StoryAlbum | undefined
): boolean {
  if (rule.section !== 'mainline') {
    return true
  }

  return album !== undefined && MAIN_TIMELINE_ALLOWED_ENTRY_TYPES.has(album.albumKind)
}

function normalizeMainTimelineRanks(rules: TimelineRule[]): TimelineRule[] {
  const sortedMainTimelineRules = rules
    .filter((rule) => rule.section === 'mainline')
    .sort(compareTimelineRule)

  const mainlineRankByAlbumId = new Map<string, number>(
    sortedMainTimelineRules.map((rule, index) => [rule.albumId, index + 1])
  )

  const normalizedRules = rules.map((rule) => {
    if (rule.section !== 'mainline') {
      return rule
    }

    const normalizedRank = mainlineRankByAlbumId.get(rule.albumId)

    if (normalizedRank === undefined) {
      return rule
    }

    return {
      ...rule,
      timelineRank: normalizedRank,
    }
  })

  return normalizedRules.sort(compareTimelineRule)
}
