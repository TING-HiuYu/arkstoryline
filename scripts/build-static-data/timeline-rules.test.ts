import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import type { StoryAlbum } from '../../src/domain/catalog/story-album'
import type { StorylineOrderService } from '../../src/domain/timeline/storyline-order-service'
import { buildTimelineRules } from './timeline-rules'

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

describe('buildTimelineRules', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
    tempDirs.length = 0
  })

  it('keeps only mainline/intermezzi rules in mainline section', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ark-timeline-rules-'))
    tempDirs.push(root)

    const overridesFilePath = join(root, 'storyline-overrides.json')
    await writeFile(overridesFilePath, JSON.stringify({ version: 1, overrides: [] }), 'utf8')

    const albums: StoryAlbum[] = [
      createAlbum({
        id: 'main_a',
        title: 'Mainline A',
        albumKind: 'mainline',
        homeSection: 'mainline',
        timelineRank: 1,
      }),
      createAlbum({
        id: 'ss_a',
        title: 'Intermezzi A',
        albumKind: 'intermezzi',
        homeSection: 'mainline',
        timelineRank: 2,
      }),
      createAlbum({
        id: 'collect_a',
        title: 'Collection A',
        albumKind: 'sideStory',
        homeSection: 'sideStory',
        timelineRank: 3,
      }),
      createAlbum({
        id: 'operator_a',
        title: 'Operator A',
        albumKind: 'operatorRecord',
        homeSection: 'operatorRecord',
        timelineRank: 4,
      }),
    ]

    const storylineOrderService: StorylineOrderService = {
      buildStorylineOrder() {
        return [
          {
            albumId: 'main_a',
            timelineRank: 1,
            section: 'mainline',
            side: 'left',
            reason: 'storyline-story-set',
          },
          {
            albumId: 'collect_a',
            timelineRank: 2,
            section: 'mainline',
            reason: 'manual-override',
          },
        ]
      },
      buildMainlineChapterRanges() {
        return []
      },
      buildFallbackOrder() {
        return [
          {
            albumId: 'ss_a',
            timelineRank: 3,
            section: 'mainline',
            side: 'right',
            reason: 'manual-override',
          },
          {
            albumId: 'operator_a',
            timelineRank: 4,
            section: 'mainline',
            reason: 'manual-override',
          },
          {
            albumId: 'collect_a',
            timelineRank: 5,
            section: 'sideStory',
            reason: 'manual-override',
          },
        ]
      },
    }

    await expect(
      buildTimelineRules({
        stageTable: {
          storylineStorySets: [],
        },
        albums,
        overridesFilePath,
        storylineOrderService,
      })
    ).resolves.toEqual([
      {
        albumId: 'main_a',
        timelineRank: 1,
        section: 'mainline',
        side: 'left',
        reason: 'storyline-story-set',
      },
      {
        albumId: 'ss_a',
        timelineRank: 2,
        section: 'mainline',
        side: 'right',
        reason: 'manual-override',
      },
    ])
  })

  it('re-ranks mainline rules without sideStory participation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ark-timeline-rules-'))
    tempDirs.push(root)

    const overridesFilePath = join(root, 'storyline-overrides.json')
    await writeFile(overridesFilePath, JSON.stringify({ version: 1, overrides: [] }), 'utf8')

    const albums: StoryAlbum[] = [
      createAlbum({
        id: 'main_a',
        title: 'Mainline A',
        albumKind: 'mainline',
        homeSection: 'mainline',
        timelineRank: 1,
      }),
      createAlbum({
        id: 'ss_a',
        title: 'Intermezzi A',
        albumKind: 'intermezzi',
        homeSection: 'mainline',
        timelineRank: 2,
      }),
      createAlbum({
        id: 'collect_a',
        title: 'Collection A',
        albumKind: 'sideStory',
        homeSection: 'sideStory',
        timelineRank: 3,
      }),
    ]

    const storylineOrderService: StorylineOrderService = {
      buildStorylineOrder() {
        return [
          {
            albumId: 'collect_a',
            timelineRank: 1,
            section: 'sideStory',
            reason: 'storyline-story-set',
          },
          {
            albumId: 'main_a',
            timelineRank: 5,
            section: 'mainline',
            side: 'left',
            reason: 'storyline-story-set',
          },
          {
            albumId: 'ss_a',
            timelineRank: 8,
            section: 'mainline',
            side: 'right',
            reason: 'storyline-story-set',
          },
        ]
      },
      buildMainlineChapterRanges() {
        return []
      },
      buildFallbackOrder() {
        return []
      },
    }

    await expect(
      buildTimelineRules({
        stageTable: {
          storylineStorySets: [],
        },
        albums,
        overridesFilePath,
        storylineOrderService,
      })
    ).resolves.toEqual([
      {
        albumId: 'collect_a',
        timelineRank: 1,
        section: 'sideStory',
        reason: 'storyline-story-set',
      },
      {
        albumId: 'main_a',
        timelineRank: 1,
        section: 'mainline',
        side: 'left',
        reason: 'storyline-story-set',
      },
      {
        albumId: 'ss_a',
        timelineRank: 2,
        section: 'mainline',
        side: 'right',
        reason: 'storyline-story-set',
      },
    ])
  })

  it('re-ranks mainline rules without operatorRecord participation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ark-timeline-rules-'))
    tempDirs.push(root)

    const overridesFilePath = join(root, 'storyline-overrides.json')
    await writeFile(overridesFilePath, JSON.stringify({ version: 1, overrides: [] }), 'utf8')

    const albums: StoryAlbum[] = [
      createAlbum({
        id: 'main_a',
        title: 'Mainline A',
        albumKind: 'mainline',
        homeSection: 'mainline',
        timelineRank: 1,
      }),
      createAlbum({
        id: 'ss_a',
        title: 'Intermezzi A',
        albumKind: 'intermezzi',
        homeSection: 'mainline',
        timelineRank: 2,
      }),
      createAlbum({
        id: 'operator_a',
        title: 'Operator A',
        albumKind: 'operatorRecord',
        homeSection: 'operatorRecord',
        timelineRank: 3,
      }),
    ]

    const storylineOrderService: StorylineOrderService = {
      buildStorylineOrder() {
        return [
          {
            albumId: 'main_a',
            timelineRank: 5,
            section: 'mainline',
            side: 'left',
            reason: 'storyline-story-set',
          },
          {
            albumId: 'operator_a',
            timelineRank: 6,
            section: 'mainline',
            reason: 'manual-override',
          },
          {
            albumId: 'ss_a',
            timelineRank: 8,
            section: 'mainline',
            side: 'right',
            reason: 'storyline-story-set',
          },
        ]
      },
      buildMainlineChapterRanges() {
        return []
      },
      buildFallbackOrder() {
        return [
          {
            albumId: 'operator_a',
            timelineRank: 12,
            section: 'operatorRecord',
            reason: 'manual-override',
          },
        ]
      },
    }

    await expect(
      buildTimelineRules({
        stageTable: {
          storylineStorySets: [],
        },
        albums,
        overridesFilePath,
        storylineOrderService,
      })
    ).resolves.toEqual([
      {
        albumId: 'main_a',
        timelineRank: 1,
        section: 'mainline',
        side: 'left',
        reason: 'storyline-story-set',
      },
      {
        albumId: 'ss_a',
        timelineRank: 2,
        section: 'mainline',
        side: 'right',
        reason: 'storyline-story-set',
      },
    ])
  })

  it('generates default operatorRecord rules for readable records missing in stage and overrides', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ark-timeline-rules-'))
    tempDirs.push(root)

    const overridesFilePath = join(root, 'storyline-overrides.json')
    await writeFile(overridesFilePath, JSON.stringify({ version: 1, overrides: [] }), 'utf8')

    const albums: StoryAlbum[] = [
      createAlbum({
        id: 'main_a',
        title: 'Mainline A',
        albumKind: 'mainline',
        homeSection: 'mainline',
        timelineRank: 1,
      }),
      {
        ...createAlbum({
          id: 'char_medic_record_02',
          title: '阿-医疗-记录2',
          albumKind: 'operatorRecord',
          homeSection: 'operatorRecord',
          timelineRank: 10,
        }),
        chapters: [
          {
            id: 'char_medic_record_02--c1',
            albumId: 'char_medic_record_02',
            title: '记录 2',
            sort: 2,
            path: 'chapters/char_medic_record_02--c1.json',
            downloadable: true,
          },
        ],
      },
      {
        ...createAlbum({
          id: 'char_medic_record_01',
          title: '阿-医疗-记录1',
          albumKind: 'operatorRecord',
          homeSection: 'operatorRecord',
          timelineRank: 11,
        }),
        chapters: [
          {
            id: 'char_medic_record_01--c1',
            albumId: 'char_medic_record_01',
            title: '记录 1',
            sort: 1,
            path: 'chapters/char_medic_record_01--c1.json',
            downloadable: true,
          },
        ],
      },
      {
        ...createAlbum({
          id: 'char_empty_record',
          title: '空记录',
          albumKind: 'operatorRecord',
          homeSection: 'operatorRecord',
          timelineRank: 12,
        }),
        chapters: [
          {
            id: 'char_empty_record--c1',
            albumId: 'char_empty_record',
            title: '无正文',
            sort: 1,
            path: 'chapters/char_empty_record--c1.json',
            downloadable: false,
          },
        ],
      },
    ]

    const storylineOrderService: StorylineOrderService = {
      buildStorylineOrder() {
        return [
          {
            albumId: 'main_a',
            timelineRank: 1,
            section: 'mainline',
            side: 'left',
            reason: 'storyline-story-set',
          },
        ]
      },
      buildMainlineChapterRanges() {
        return []
      },
      buildFallbackOrder() {
        return []
      },
    }

    await expect(
      buildTimelineRules({
        stageTable: {
          storylineStorySets: [],
        },
        albums,
        overridesFilePath,
        storylineOrderService,
      })
    ).resolves.toEqual([
      {
        albumId: 'main_a',
        timelineRank: 1,
        section: 'mainline',
        side: 'left',
        reason: 'storyline-story-set',
      },
      {
        albumId: 'char_medic_record_01',
        timelineRank: 2,
        section: 'operatorRecord',
        reason: 'operator-record-default',
      },
      {
        albumId: 'char_medic_record_02',
        timelineRank: 3,
        section: 'operatorRecord',
        reason: 'operator-record-default',
      },
    ])
  })

  it('keeps deterministic order when multiple rules share the same timelineRank', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ark-timeline-rules-'))
    tempDirs.push(root)

    const overridesFilePath = join(root, 'storyline-overrides.json')
    await writeFile(overridesFilePath, JSON.stringify({ version: 1, overrides: [] }), 'utf8')

    const albums: StoryAlbum[] = [
      createAlbum({
        id: 'main_a',
        title: 'Mainline A',
        albumKind: 'mainline',
        homeSection: 'mainline',
        timelineRank: 1,
      }),
      createAlbum({
        id: 'main_c',
        title: 'Mainline C',
        albumKind: 'mainline',
        homeSection: 'mainline',
        timelineRank: 2,
      }),
      createAlbum({
        id: 'ss_b',
        title: 'Intermezzi B',
        albumKind: 'intermezzi',
        homeSection: 'mainline',
        timelineRank: 3,
      }),
    ]

    function createStorylineOrderService(albumIdsInOrder: string[]): StorylineOrderService {
      return {
        buildStorylineOrder() {
          return albumIdsInOrder.map((albumId) => ({
            albumId,
            timelineRank: 10,
            section: 'mainline',
            side: albumId.startsWith('ss_') ? 'right' : 'left',
            reason: 'storyline-story-set' as const,
          }))
        },
        buildMainlineChapterRanges() {
          return []
        },
        buildFallbackOrder() {
          return []
        },
      }
    }

    const firstRun = await buildTimelineRules({
      stageTable: {
        storylineStorySets: [],
      },
      albums,
      overridesFilePath,
      storylineOrderService: createStorylineOrderService(['ss_b', 'main_c', 'main_a']),
    })

    const secondRun = await buildTimelineRules({
      stageTable: {
        storylineStorySets: [],
      },
      albums,
      overridesFilePath,
      storylineOrderService: createStorylineOrderService(['main_a', 'ss_b', 'main_c']),
    })

    const expected = [
      {
        albumId: 'main_a',
        timelineRank: 1,
        section: 'mainline',
        side: 'left',
        reason: 'storyline-story-set',
      },
      {
        albumId: 'main_c',
        timelineRank: 2,
        section: 'mainline',
        side: 'left',
        reason: 'storyline-story-set',
      },
      {
        albumId: 'ss_b',
        timelineRank: 3,
        section: 'mainline',
        side: 'right',
        reason: 'storyline-story-set',
      },
    ]

    expect(firstRun).toEqual(expected)
    expect(secondRun).toEqual(expected)
  })
})
