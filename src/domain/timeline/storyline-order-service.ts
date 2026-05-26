import type { StoryAlbum } from '../catalog/story-album'
import type { TimelineRule } from './timeline-rule'

export interface RawStageTableStorylineStorySet {
  storySetId: string
  storySetType: string
  sortByYear: number
  sortWithinYear: number
}

export interface RawStageTable {
  storylineStorySets: RawStageTableStorylineStorySet[]
}

export interface RawChapterTableChapter {
  chapterIndex: number | string
  startZoneId: string
  endZoneId: string
}

export interface RawChapterTable {
  chapters: Record<string, RawChapterTableChapter>
}

export interface MainlineChapterRange {
  chapterIndex: number
  startZoneId: string
  endZoneId: string
}

export interface StorylineOverride {
  albumId: string
  section: StoryAlbum['homeSection']
  timelineRank?: number
  gameOrderRank?: number
  reason: string
}

export interface StorylineOrderService {
  buildStorylineOrder(stageTable: RawStageTable, albums: StoryAlbum[]): TimelineRule[]
  buildMainlineChapterRanges(chapterTable: RawChapterTable): MainlineChapterRange[]
  buildFallbackOrder(albums: StoryAlbum[], overrides: StorylineOverride[]): TimelineRule[]
}
