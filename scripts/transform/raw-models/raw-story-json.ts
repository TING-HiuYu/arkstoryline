import type { RawStoryReviewEntryType } from './raw-story-review-entry'

export type RawStoryJsonStoryListProp = 'name' | 'Dialog' | 'Decision' | 'Predicate' | (string & {})

export interface RawStoryJsonStoryNode {
  id?: string | number
  prop?: RawStoryJsonStoryListProp
  attributes?: Record<string, unknown>
  [field: string]: unknown
}

export interface RawStoryJson {
  lang?: string
  eventid?: string
  eventName?: string
  albumKind?: RawStoryReviewEntryType
  storyCode?: string
  avgTag?: string
  storyName?: string
  storyInfo?: string
  storyList?: readonly RawStoryJsonStoryNode[]
  OPTIONTRACE?: readonly unknown[] | Record<string, unknown>
  [field: string]: unknown
}
