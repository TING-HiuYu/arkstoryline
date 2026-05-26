import type { OtherStoryRef } from './other-story-ref'
import type { HomeSection } from './home-section'
import type { StoryAlbumCover } from './story-album-cover'
import type { SourceRef } from './source-ref'
import type { StoryChapterRef } from './story-chapter-ref'

export type StoryEntryType =
  | 'mainline'
  | 'intermezzi'
  | 'sidestory'
  | 'sideStory'
  | 'operatorRecord'
  | 'otherStory'

export interface StoryAlbumMusicMetadata {
  movementTitle: string
  arcTitle?: string
  tags: string[]
  recommended: boolean
  sourcePage: string
  anchor?: string
}

export interface StoryAlbumOtherStoryMetadata {
  groupTitle: string
  albumTitle?: string
  sourceSection: string
}

export interface StoryAlbum {
  id: string
  slug: string
  title: string
  sourceEntryType: string
  albumKind: StoryEntryType
  homeSection: HomeSection
  timelineRank: number
  gameOrderRank?: number
  cover?: StoryAlbumCover
  startTime?: number
  releaseDate?: string
  side?: 'left' | 'right'
  summary?: string
  music?: StoryAlbumMusicMetadata
  otherStory?: StoryAlbumOtherStoryMetadata
  chapters: StoryChapterRef[]
  extras?: OtherStoryRef[]
  source: SourceRef
}
