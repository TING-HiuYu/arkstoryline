import { describe, expect, expectTypeOf, it } from 'vitest'

import type { StoryAlbum } from '../catalog/story-album'
import type {
  MainlineChapterRange,
  RawChapterTable,
  RawStageTable,
  StorylineOrderService,
  StorylineOverride,
} from './storyline-order-service'
import type { TimelineRule } from './timeline-rule'

describe('storyline-order-service', () => {
  it('defines service methods with stable input and output contracts', () => {
    const service: StorylineOrderService = {
      buildStorylineOrder: () => [],
      buildMainlineChapterRanges: () => [],
      buildFallbackOrder: () => [],
    }

    const stageTable: RawStageTable = {
      storylineStorySets: [
        {
          storySetId: 'act-main-0',
          storySetType: 'MAINLINE',
          sortByYear: 2020,
          sortWithinYear: 1,
        },
      ],
    }
    const chapterTable: RawChapterTable = {
      chapters: {
        main_0: {
          chapterIndex: 0,
          startZoneId: 'main_00',
          endZoneId: 'main_01',
        },
      },
    }
    const albums = [{} as StoryAlbum]
    const overrides: StorylineOverride[] = [
      {
        albumId: 'act-main-0',
        section: 'mainline',
        timelineRank: 1,
        gameOrderRank: 1,
        reason: 'manual-fix',
      },
    ]

    const timelineRules = service.buildStorylineOrder(stageTable, albums)
    const ranges = service.buildMainlineChapterRanges(chapterTable)
    const fallbackRules = service.buildFallbackOrder(albums, overrides)

    expect(Array.isArray(timelineRules)).toBe(true)
    expect(Array.isArray(ranges)).toBe(true)
    expect(Array.isArray(fallbackRules)).toBe(true)
    expectTypeOf(timelineRules).toEqualTypeOf<TimelineRule[]>()
    expectTypeOf(ranges).toEqualTypeOf<MainlineChapterRange[]>()
    expectTypeOf(fallbackRules).toEqualTypeOf<TimelineRule[]>()
  })
})
