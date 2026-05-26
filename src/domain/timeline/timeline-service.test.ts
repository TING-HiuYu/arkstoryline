import { describe, expect, expectTypeOf, it } from 'vitest'

import type { StoryAlbum } from '../catalog/story-album'
import {
  buildTimelineFromCatalog,
  defaultTimelineService,
  type StoryCatalog,
  type TimelineService,
} from './timeline-service'
import type { TimelineItem } from './timeline-item'
import type { TimelineRule } from './timeline-rule'

function createAlbum(
  input: Pick<
    StoryAlbum,
    'id' | 'title' | 'slug' | 'albumKind' | 'homeSection' | 'timelineRank'
  > & {
    chapterCount: number
    gameOrderRank?: number
  }
): StoryAlbum {
  return {
    id: input.id,
    slug: input.slug,
    title: input.title,
    sourceEntryType: input.albumKind.toUpperCase(),
    albumKind: input.albumKind,
    homeSection: input.homeSection,
    timelineRank: input.timelineRank,
    gameOrderRank: input.gameOrderRank,
    chapters: Array.from({ length: input.chapterCount }).map((_, index) => ({
      id: `${input.id}_chapter_${index + 1}`,
      albumId: input.id,
      title: `Chapter ${index + 1}`,
      sort: index + 1,
      path: `story/${input.id}/${index + 1}.txt`,
      downloadable: true,
    })),
    source: {
      providerId: 'test',
      revision: 'test',
      path: `story_review_table.storyReviewTable.${input.id}`,
    },
  }
}

describe('timeline-service', () => {
  it('builds timeline items from catalog albums and timeline rules', () => {
    const catalog: StoryCatalog = {
      albums: [
        createAlbum({
          id: 'main_a',
          slug: 'main-a',
          title: 'Mainline A',
          albumKind: 'mainline',
          homeSection: 'mainline',
          timelineRank: 101,
          chapterCount: 3,
          gameOrderRank: 11,
        }),
        createAlbum({
          id: 'ss_a',
          slug: 'ss-a',
          title: 'Intermezzi A',
          albumKind: 'intermezzi',
          homeSection: 'mainline',
          timelineRank: 102,
          chapterCount: 2,
          gameOrderRank: 12,
        }),
      ],
    }

    const rules: TimelineRule[] = [
      {
        albumId: 'ss_a',
        timelineRank: 2,
        section: 'mainline',
        side: 'right',
        reason: 'storyline-story-set',
      },
      {
        albumId: 'main_a',
        timelineRank: 1,
        section: 'mainline',
        side: 'left',
        reason: 'storyline-story-set',
      },
    ]

    expect(buildTimelineFromCatalog(catalog, rules)).toEqual([
      {
        id: 'main_a',
        albumId: 'main_a',
        slug: 'main-a',
        title: 'Mainline A',
        albumKind: 'mainline',
        section: 'mainline',
        timelineRank: 1,
        gameOrderRank: 11,
        side: 'left',
        chapterCount: 3,
      },
      {
        id: 'ss_a',
        albumId: 'ss_a',
        slug: 'ss-a',
        title: 'Intermezzi A',
        albumKind: 'intermezzi',
        section: 'mainline',
        timelineRank: 2,
        gameOrderRank: 12,
        side: 'right',
        chapterCount: 2,
      },
    ])
  })

  it('ignores unknown album ids and keeps first ranked rule when duplicates exist', () => {
    const catalog: StoryCatalog = {
      albums: [
        createAlbum({
          id: 'main_a',
          slug: 'main-a',
          title: 'Mainline A',
          albumKind: 'mainline',
          homeSection: 'mainline',
          timelineRank: 100,
          chapterCount: 1,
        }),
      ],
    }

    const rules: TimelineRule[] = [
      {
        albumId: 'missing',
        timelineRank: 1,
        section: 'sideStory',
        reason: 'manual-override',
      },
      {
        albumId: 'main_a',
        timelineRank: 2,
        section: 'mainline',
        side: 'left',
        reason: 'storyline-story-set',
      },
      {
        albumId: 'main_a',
        timelineRank: 3,
        section: 'sideStory',
        reason: 'manual-override',
      },
    ]

    expect(buildTimelineFromCatalog(catalog, rules)).toEqual([
      {
        id: 'main_a',
        albumId: 'main_a',
        slug: 'main-a',
        title: 'Mainline A',
        albumKind: 'mainline',
        section: 'mainline',
        timelineRank: 2,
        gameOrderRank: undefined,
        side: 'left',
        chapterCount: 1,
      },
    ])
  })

  it('keeps deterministic order when timeline ranks are equal', () => {
    const catalog: StoryCatalog = {
      albums: [
        createAlbum({
          id: 'album_b',
          slug: 'album-b',
          title: 'Album B',
          albumKind: 'sideStory',
          homeSection: 'sideStory',
          timelineRank: 200,
          chapterCount: 1,
        }),
        createAlbum({
          id: 'album_a',
          slug: 'album-a',
          title: 'Album A',
          albumKind: 'sideStory',
          homeSection: 'sideStory',
          timelineRank: 201,
          chapterCount: 1,
        }),
      ],
    }

    const rules: TimelineRule[] = [
      {
        albumId: 'album_b',
        timelineRank: 5,
        section: 'sideStory',
        reason: 'storyline-story-set',
      },
      {
        albumId: 'album_a',
        timelineRank: 5,
        section: 'sideStory',
        reason: 'storyline-story-set',
      },
    ]

    expect(buildTimelineFromCatalog(catalog, rules).map((item) => item.albumId)).toEqual([
      'album_a',
      'album_b',
    ])
  })

  it('exposes stable TimelineService contract', () => {
    const service: TimelineService = defaultTimelineService
    const catalog: StoryCatalog = { albums: [] }
    const rules: TimelineRule[] = []
    const timeline = service.buildTimeline(catalog, rules)

    expect(Array.isArray(timeline)).toBe(true)
    expectTypeOf(timeline).toEqualTypeOf<TimelineItem[]>()
  })
})
