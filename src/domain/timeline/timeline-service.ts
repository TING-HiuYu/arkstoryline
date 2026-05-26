import type { StoryAlbum } from '../catalog/story-album'
import type { TimelineItem } from './timeline-item'
import type { TimelineRule } from './timeline-rule'

export interface StoryCatalog {
  albums: StoryAlbum[]
}

export interface TimelineService {
  buildTimeline(catalog: StoryCatalog, rules: TimelineRule[]): TimelineItem[]
}

export function buildTimelineFromCatalog(
  catalog: StoryCatalog,
  rules: TimelineRule[]
): TimelineItem[] {
  const albumById = new Map<string, StoryAlbum>(catalog.albums.map((album) => [album.id, album]))
  const usedAlbumIds = new Set<string>()

  const sortedRules = [...rules].sort(compareTimelineRule)
  const timelineItems: TimelineItem[] = []

  for (const rule of sortedRules) {
    if (usedAlbumIds.has(rule.albumId)) {
      continue
    }

    const album = albumById.get(rule.albumId)

    if (!album) {
      continue
    }

    usedAlbumIds.add(album.id)
    timelineItems.push({
      id: album.id,
      albumId: album.id,
      slug: album.slug,
      title: album.title,
      albumKind: album.albumKind,
      section: rule.section,
      timelineRank: rule.timelineRank,
      gameOrderRank: album.gameOrderRank,
      ...(album.cover ? { cover: album.cover } : {}),
      ...(album.summary ? { summary: album.summary } : {}),
      ...(album.music ? { music: album.music } : {}),
      side: rule.side,
      chapterCount: album.chapters.length,
    })
  }

  return timelineItems
}

function compareTimelineRule(a: TimelineRule, b: TimelineRule): number {
  if (a.timelineRank !== b.timelineRank) {
    return a.timelineRank - b.timelineRank
  }

  return a.albumId.localeCompare(b.albumId)
}

export const defaultTimelineService: TimelineService = {
  buildTimeline(catalog: StoryCatalog, rules: TimelineRule[]): TimelineItem[] {
    return buildTimelineFromCatalog(catalog, rules)
  },
}
