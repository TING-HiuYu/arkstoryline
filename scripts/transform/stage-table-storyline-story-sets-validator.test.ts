import { describe, expect, it } from 'vitest'

import { validateStageTableStorylineStorySetsStructure } from './stage-table-storyline-story-sets-validator'

describe('validateStageTableStorylineStorySetsStructure', () => {
  it('passes for sampled storylineStorySets with valid structure', () => {
    const report = validateStageTableStorylineStorySetsStructure(
      {
        storylineStorySets: {
          set_mainline_01: {
            storySetId: 'set_mainline_01',
            storySetType: 'MAINLINE',
            sortByYear: 1,
            sortWithinYear: 1,
            kvImageId: 'kv_mainline_01',
            titleImageId: 'title_mainline_01',
            haveVideoToPlay: true,
            backgroundId: 'bg_mainline',
            gameMusicId: 'music_mainline',
            coreRewardType: 'NONE',
            coreRewardId: null,
            relevantActivityId: null,
            mainlineData: {
              zoneId: 'main_1',
              retroId: null,
              decoImageId: 'deco_mainline',
              desc: 'mainline',
              backgroundId: 'story_bg_mainline',
              tags: ['tag_1'],
            },
            ssData: null,
            collectData: null,
          },
          set_ss_01: {
            storySetId: 'set_ss_01',
            storySetType: 'SS',
            sortByYear: 2,
            sortWithinYear: 3,
            kvImageId: 'kv_ss_01',
            titleImageId: 'title_ss_01',
            haveVideoToPlay: false,
            backgroundId: null,
            gameMusicId: 'music_ss',
            coreRewardType: 'CHAR',
            coreRewardId: 'char_001',
            relevantActivityId: 'act_ss_01',
            mainlineData: null,
            ssData: {
              desc: 'ss',
              backgroundId: 'story_bg_ss',
              tags: ['tag_ss_1'],
              reopenActivityId: null,
              retroActivityId: 'retro_ss_01',
              isRecommended: true,
              recommendHideStageId: null,
              overrideStageList: ['stage_01'],
            },
            collectData: null,
          },
        },
      },
      { sampleSize: 2 }
    )

    expect(report.valid).toBe(true)
    expect(report.issues).toEqual([])
    expect(report.totalStorylineStorySets).toBe(2)
    expect(report.storySetTypeDistribution).toEqual({ MAINLINE: 1, SS: 1 })
    expect(report.coreRewardTypeDistribution).toEqual({ NONE: 1, CHAR: 1 })
  })

  it('reports diagnostics when sampled structure is invalid', () => {
    const report = validateStageTableStorylineStorySetsStructure(
      {
        storylineStorySets: {
          set_invalid: {
            storySetId: 'set_invalid',
            storySetType: 'COLLECT',
            sortByYear: 1,
            sortWithinYear: 2,
            kvImageId: 'kv_invalid',
            titleImageId: 'title_invalid',
            haveVideoToPlay: false,
            backgroundId: null,
            gameMusicId: 'music_invalid',
            coreRewardType: 'NONE',
            coreRewardId: null,
            relevantActivityId: null,
            mainlineData: null,
            ssData: null,
            collectData: null,
          },
        },
      },
      { sampleSize: 1 }
    )

    expect(report.valid).toBe(false)
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'stage_table.storylineStorySets.set_invalid.collectData',
          expected: 'object',
          actual: 'null',
        }),
      ])
    )
  })
})
