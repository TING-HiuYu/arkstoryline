export type StoryAlbumCoverSource =
  | 'stage-kv'
  | 'review-entry-pic'
  | 'review-story-pic'
  | 'stage-background'
  | 'none'

export type StoryAlbumCoverAssetStatus = 'ready' | 'missing' | 'disabled'

export interface StoryAlbumCover {
  primaryImageId?: string
  titleImageId?: string
  backgroundImageId?: string
  storyEntryPicId?: string
  storyPicId?: string
  url?: string
  source: StoryAlbumCoverSource
  assetPath?: string
  width?: number
  height?: number
  assetStatus: StoryAlbumCoverAssetStatus
}
