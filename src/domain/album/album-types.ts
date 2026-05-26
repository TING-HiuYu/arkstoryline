import type { StoryAlbumCover } from '../catalog/story-album-cover'

export type AlbumKind = 'mainline' | 'sidestory' | 'archive' | 'operator' | 'terraHistoricus'

export type AlbumGroupKind =
  | 'mainline-phase'
  | 'sidestory-category'
  | 'archive-category'
  | 'operator-initial'
  | 'terra-historicus'

export interface AlbumGroup {
  id: string
  title: string
  order: number
  kind: AlbumGroupKind
}

export type AlbumCardVariant = 'mainline' | 'compact' | 'operator' | 'terraHistoricus'

export interface AlbumCardProfile {
  variant: AlbumCardVariant
  showCover: boolean
  showDescription: boolean
  showProgress: boolean
  showChapterCount: boolean
}

export interface ContentSource {
  provider: string
  url: string
  page?: string
  kind?: string
}

export interface RelatedRef {
  id: string
  targetChapterId: string
  title: string
  albumTitle: string
  chapterCode?: string
  stage?: string
  summary: string
}

export interface StoryChapterRefModel {
  id: string
  albumId: string
  title: string
  code?: string
  avgTag?: string
  sort: number
  path?: string
  infoPath?: string
  downloadable: boolean
  contentSource?: ContentSource
  relatedRef: RelatedRef[]
}

export interface OperatorDocumentSection {
  id: string
  title?: string
  body: string
}

export interface OperatorDocument {
  id: string
  title: string
  contentSource?: ContentSource
  sections: OperatorDocumentSection[]
}

export interface OperatorModule {
  id: string
  title: string
  moduleCode?: string
  contentSource?: ContentSource
  sections: OperatorDocumentSection[]
}

export interface OperatorConfidential {
  id: string
  title: string
  contentSource?: ContentSource
  sections: OperatorDocumentSection[]
}

export interface TerraHistoricusEntry {
  id: string
  title: string
  cover: string
  url: string
  subtitle?: string
}

export interface AlbumData {
  id: string
  slug: string
  title: string
  kind: AlbumKind
  group: AlbumGroup
  cover?: StoryAlbumCover
  summary?: string
  chapters?: StoryChapterRefModel[]
}

export interface AlbumContext {
  albumsById?: Map<string, AlbumBaseLike>
  mainlineOrderIds?: string[]
}

export interface AlbumBaseLike {
  id: string
  title: string
  kind: AlbumKind
  group: AlbumGroup
}
