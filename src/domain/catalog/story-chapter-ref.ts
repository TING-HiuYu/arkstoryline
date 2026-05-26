import type { ContentSource, RelatedRef } from '../album/album-types'

export interface StoryChapterRef {
  id: string
  albumId: string
  title: string
  code?: string
  avgTag?: string
  sort: number
  path: string
  infoPath?: string
  downloadable: boolean
  contentSource?: ContentSource
  relatedRef?: RelatedRef[]
}
