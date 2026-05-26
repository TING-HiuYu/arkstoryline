import type { StoryAlbumCover } from '../../domain/catalog/story-album-cover'
import type { StaticAlbumData } from '../../infrastructure/storage/static-story-repository'

export type HomeAlbumSectionKey = 'mainline' | 'sideStory' | 'otherStory'

export interface TimelineCardViewModel {
  albumId: string
  slug: string
  title: string
  cover?: StoryAlbumCover
  albumKind: string
  section: 'mainline' | 'sideStory' | 'otherStory' | 'operatorRecord'
  side?: 'left' | 'right'
  timelineRank: number
  gameOrderRank?: number
  chapterCount: number
  progressPercent: number
  summary?: string
  music?: {
    movementTitle: string
    arcTitle?: string
    tags: string[]
    recommended: boolean
    sourcePage: string
    anchor?: string
  }
  otherStory?: StaticAlbumData['otherStory']
  operator?: {
    archivePath?: string
    modulesPath?: string
    confidentialAlbumId?: string
    confidentialPath?: string
  }
}

export interface OperatorTopologyViewModel {
  id: string
  name: string
  slug: string
  detailPath: string
}

export interface OperatorGroupViewModel {
  key: string
  label: string
  items: OperatorTopologyViewModel[]
}

export interface AlbumCardGroup {
  key: string
  title: string
  items: TimelineCardViewModel[]
}

export function isHomeAlbumSectionKey(section: string): section is HomeAlbumSectionKey {
  return section === 'mainline' || section === 'sideStory' || section === 'otherStory'
}

function normalizeMainlineArcTitle(arcTitle: string): string {
  const normalized = arcTitle.trim()

  if (normalized === 'Act initium 觉醒') {
    return 'init. 觉醒'
  }

  if (normalized === 'Act Ⅰ 幻灭') {
    return 'Ⅰ 幻灭'
  }

  if (normalized === 'Act Ⅱ 残阳') {
    return 'Ⅱ 残阳'
  }

  if (normalized === 'Act Ⅲ 裂变') {
    return 'Ⅲ 裂变'
  }

  return normalized
}

export function resolveMusicClassificationTag(
  albumKind: string,
  music?: TimelineCardViewModel['music']
): string | null {
  if (!music) {
    return null
  }

  if (albumKind === 'mainline' && music.arcTitle) {
    return normalizeMainlineArcTitle(music.arcTitle)
  }

  if (albumKind === 'mainline') {
    return null
  }

  if (music.movementTitle) {
    return music.movementTitle
  }

  if (music.arcTitle) {
    return normalizeMainlineArcTitle(music.arcTitle)
  }

  return null
}

export function getAlbumCardGroupTitle(item: TimelineCardViewModel): string {
  if (item.albumKind === 'otherStory') {
    return item.otherStory?.groupTitle ?? '其他档案'
  }

  const classificationTag = resolveMusicClassificationTag(item.albumKind, item.music)

  if (classificationTag) {
    return classificationTag
  }

  return '其它'
}

export function getCoverAspectRatio(cover: StoryAlbumCover | undefined): string {
  if (cover?.width && cover.height && cover.width > 0 && cover.height > 0) {
    return `${cover.width} / ${cover.height}`
  }

  return '16 / 9'
}

export function resolveCoverImageSource(cover: StoryAlbumCover | undefined): string | null {
  if (cover?.assetStatus === 'ready' && cover.assetPath) {
    return cover.assetPath
  }

  return cover?.url ?? null
}
