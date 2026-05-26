import type { RawInfoUnlockData } from './raw-info-unlock-data'

export type RawStoryReviewEntryType =
  | 'ACTIVITY'
  | 'MINI_ACTIVITY'
  | 'MAINLINE'
  | 'NONE'
  | (string & {})

export interface RawStoryReviewEntry<
  TInfoUnlockData extends Record<string, unknown> = RawInfoUnlockData,
> {
  albumKind?: RawStoryReviewEntryType
  name?: string
  startTime?: number
  endTime?: number
  infoUnlockDatas?: readonly TInfoUnlockData[]
  [field: string]: unknown
}

export interface RawStoryReviewTablePayload<
  TInfoUnlockData extends Record<string, unknown> = RawInfoUnlockData,
> {
  storyReviewTable: Record<string, RawStoryReviewEntry<TInfoUnlockData>>
}
