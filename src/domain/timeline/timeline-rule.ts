import type { HomeSection } from '../catalog/home-section'

export type TimelineRuleReason =
  | 'storyline-story-set'
  | 'chapter-table'
  | 'manual-override'
  | 'operator-record-default'

export interface TimelineRule {
  albumId: string
  timelineRank: number
  section: HomeSection
  side?: 'left' | 'right'
  reason: TimelineRuleReason
}
