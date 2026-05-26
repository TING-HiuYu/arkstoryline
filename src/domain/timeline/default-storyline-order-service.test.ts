import { describe, expect, it } from 'vitest'

import type { StoryAlbum } from '../catalog/story-album'
import {
  buildStorylineStorySetClassificationRules,
  defaultStorylineOrderService,
} from './default-storyline-order-service'
import type { RawStageTable } from './storyline-order-service'

function createAlbum(
  input: Pick<StoryAlbum, 'id' | 'title' | 'albumKind' | 'homeSection' | 'timelineRank'>
): StoryAlbum {
  return {
    id: input.id,
    slug: input.id,
    title: input.title,
    sourceEntryType: input.albumKind.toUpperCase(),
    albumKind: input.albumKind,
    homeSection: input.homeSection,
    timelineRank: input.timelineRank,
    chapters: [],
    source: {
      providerId: 'test',
      revision: 'test',
      path: `story_review_table.storyReviewTable.${input.id}`,
    },
  }
}

describe('buildStorylineStorySetClassificationRules', () => {
  it('ranks mainline/intermezzi by sort fields before non-mainline sets', () => {
    const stageTable: RawStageTable = {
      storylineStorySets: [
        { storySetId: 'main_a', storySetType: 'MAINLINE', sortByYear: 2099, sortWithinYear: 99 },
        { storySetId: 'ss_a', storySetType: 'SS', sortByYear: 1900, sortWithinYear: 0 },
        { storySetId: 'collect_a', storySetType: 'COLLECT', sortByYear: 2000, sortWithinYear: 1 },
        { storySetId: 'operator_a', storySetType: 'NONE', sortByYear: 1999, sortWithinYear: 9 },
      ],
    }

    const albums: StoryAlbum[] = [
      createAlbum({
        id: 'main_a',
        title: 'Mainline A',
        albumKind: 'mainline',
        homeSection: 'mainline',
        timelineRank: 101,
      }),
      createAlbum({
        id: 'ss_a',
        title: 'Intermezzi A',
        albumKind: 'intermezzi',
        homeSection: 'mainline',
        timelineRank: 102,
      }),
      createAlbum({
        id: 'collect_a',
        title: 'Collection A',
        albumKind: 'sideStory',
        homeSection: 'sideStory',
        timelineRank: 103,
      }),
      createAlbum({
        id: 'operator_a',
        title: 'Operator A',
        albumKind: 'operatorRecord',
        homeSection: 'operatorRecord',
        timelineRank: 104,
      }),
    ]

    expect(buildStorylineStorySetClassificationRules(stageTable, albums)).toEqual([
      {
        albumId: 'ss_a',
        timelineRank: 1,
        section: 'mainline',
        side: 'right',
        reason: 'storyline-story-set',
      },
      {
        albumId: 'main_a',
        timelineRank: 2,
        section: 'mainline',
        side: 'left',
        reason: 'storyline-story-set',
      },
      {
        albumId: 'operator_a',
        timelineRank: 3,
        section: 'operatorRecord',
        reason: 'storyline-story-set',
      },
      {
        albumId: 'collect_a',
        timelineRank: 4,
        section: 'sideStory',
        reason: 'storyline-story-set',
      },
    ])
  })

  it('uses albumId as deterministic tie-breaker when sort fields are equal', () => {
    const stageTable: RawStageTable = {
      storylineStorySets: [
        { storySetId: 'main_b', storySetType: 'MAINLINE', sortByYear: 2024, sortWithinYear: 2 },
        { storySetId: 'main_a', storySetType: 'MAINLINE', sortByYear: 2024, sortWithinYear: 2 },
      ],
    }

    const albums: StoryAlbum[] = [
      createAlbum({
        id: 'main_a',
        title: 'Mainline A',
        albumKind: 'mainline',
        homeSection: 'mainline',
        timelineRank: 100,
      }),
      createAlbum({
        id: 'main_b',
        title: 'Mainline B',
        albumKind: 'mainline',
        homeSection: 'mainline',
        timelineRank: 200,
      }),
    ]

    expect(buildStorylineStorySetClassificationRules(stageTable, albums)).toEqual([
      {
        albumId: 'main_a',
        timelineRank: 1,
        section: 'mainline',
        side: 'left',
        reason: 'storyline-story-set',
      },
      {
        albumId: 'main_b',
        timelineRank: 2,
        section: 'mainline',
        side: 'left',
        reason: 'storyline-story-set',
      },
    ])
  })

  it('ignores unsupported storySetType and unmatched album ids', () => {
    const stageTable: RawStageTable = {
      storylineStorySets: [
        {
          storySetId: 'unknown_type',
          storySetType: 'UNKNOWN',
          sortByYear: 2024,
          sortWithinYear: 1,
        },
        {
          storySetId: 'missing_album',
          storySetType: 'MAINLINE',
          sortByYear: 2024,
          sortWithinYear: 2,
        },
      ],
    }

    const albums: StoryAlbum[] = [
      createAlbum({
        id: 'unknown_type',
        title: 'Unknown Type Album',
        albumKind: 'sidestory',
        homeSection: 'mainline',
        timelineRank: 11,
      }),
    ]

    expect(buildStorylineStorySetClassificationRules(stageTable, albums)).toEqual([])
  })
})

describe('defaultStorylineOrderService.buildMainlineChapterRanges', () => {
  it('builds sorted chapter ranges from chapter_table entries', () => {
    const ranges = defaultStorylineOrderService.buildMainlineChapterRanges({
      chapters: {
        chapter_b: {
          chapterIndex: '10',
          startZoneId: 'main_10a',
          endZoneId: 'main_10z',
        },
        chapter_a: {
          chapterIndex: 2,
          startZoneId: 'main_02a',
          endZoneId: 'main_02z',
        },
      },
    })

    expect(ranges).toEqual([
      {
        chapterIndex: 2,
        startZoneId: 'main_02a',
        endZoneId: 'main_02z',
      },
      {
        chapterIndex: 10,
        startZoneId: 'main_10a',
        endZoneId: 'main_10z',
      },
    ])
  })

  it('ignores invalid chapter entries and keeps deterministic order for ties', () => {
    const ranges = defaultStorylineOrderService.buildMainlineChapterRanges({
      chapters: {
        invalid_empty_zone: {
          chapterIndex: 3,
          startZoneId: '',
          endZoneId: 'main_03z',
        },
        invalid_nan: {
          chapterIndex: 'N/A',
          startZoneId: 'main_03a',
          endZoneId: 'main_03z',
        },
        tie_b: {
          chapterIndex: 4,
          startZoneId: 'main_04b',
          endZoneId: 'main_04z',
        },
        tie_a: {
          chapterIndex: 4,
          startZoneId: 'main_04a',
          endZoneId: 'main_04z',
        },
      },
    })

    expect(ranges).toEqual([
      {
        chapterIndex: 4,
        startZoneId: 'main_04a',
        endZoneId: 'main_04z',
      },
      {
        chapterIndex: 4,
        startZoneId: 'main_04b',
        endZoneId: 'main_04z',
      },
    ])
  })
})

describe('defaultStorylineOrderService.buildFallbackOrder', () => {
  it('builds fallback manual override rules from known albums', () => {
    const albums: StoryAlbum[] = [
      createAlbum({
        id: 'main_a',
        title: 'Mainline A',
        albumKind: 'mainline',
        homeSection: 'mainline',
        timelineRank: 100,
      }),
      createAlbum({
        id: 'ss_a',
        title: 'Intermezzi A',
        albumKind: 'intermezzi',
        homeSection: 'mainline',
        timelineRank: 200,
      }),
      createAlbum({
        id: 'collect_a',
        title: 'Collection A',
        albumKind: 'sideStory',
        homeSection: 'sideStory',
        timelineRank: 300,
      }),
    ]

    const rules = defaultStorylineOrderService.buildFallbackOrder(albums, [
      {
        albumId: 'missing_album',
        section: 'mainline',
        timelineRank: 1,
        reason: 'manual-fix',
      },
      {
        albumId: 'ss_a',
        section: 'mainline',
        timelineRank: 2,
        reason: 'manual-fix',
      },
      {
        albumId: 'main_a',
        section: 'mainline',
        reason: 'manual-fix',
      },
      {
        albumId: 'collect_a',
        section: 'sideStory',
        reason: 'manual-fix',
      },
    ])

    expect(rules).toEqual([
      {
        albumId: 'ss_a',
        timelineRank: 2,
        section: 'mainline',
        side: 'right',
        reason: 'manual-override',
      },
      {
        albumId: 'main_a',
        timelineRank: 100,
        section: 'mainline',
        side: 'left',
        reason: 'manual-override',
      },
      {
        albumId: 'collect_a',
        timelineRank: 300,
        section: 'sideStory',
        reason: 'manual-override',
      },
    ])
  })

  it('keeps the first ranked rule when duplicate overrides target the same album', () => {
    const albums: StoryAlbum[] = [
      createAlbum({
        id: 'main_a',
        title: 'Mainline A',
        albumKind: 'mainline',
        homeSection: 'mainline',
        timelineRank: 50,
      }),
    ]

    const rules = defaultStorylineOrderService.buildFallbackOrder(albums, [
      {
        albumId: 'main_a',
        section: 'mainline',
        timelineRank: 10,
        reason: 'manual-fix-low-priority',
      },
      {
        albumId: 'main_a',
        section: 'mainline',
        timelineRank: 1,
        reason: 'manual-fix-high-priority',
      },
    ])

    expect(rules).toEqual([
      {
        albumId: 'main_a',
        timelineRank: 1,
        section: 'mainline',
        side: 'left',
        reason: 'manual-override',
      },
    ])
  })
})
