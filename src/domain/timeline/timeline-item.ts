import type { HomeSection } from '../catalog/home-section'
import type {
  StoryEntryType,
  StoryAlbumOtherStoryMetadata,
  StoryAlbumMusicMetadata,
} from '../catalog/story-album'
import type { StoryAlbumCover } from '../catalog/story-album-cover'

export interface TimelineItem {
  id: string
  albumId: string
  slug: string
  title: string
  albumKind: StoryEntryType
  section: HomeSection
  timelineRank: number
  gameOrderRank?: number
  cover?: StoryAlbumCover
  summary?: string
  music?: StoryAlbumMusicMetadata
  otherStory?: StoryAlbumOtherStoryMetadata
  side?: 'left' | 'right'
  chapterCount: number
  operator?: {
    archivePath?: string
    modulesPath?: string
    confidentialAlbumId?: string
    confidentialPath?: string
  }
}
