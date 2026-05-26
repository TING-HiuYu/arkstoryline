import { describe, expect, it } from 'vitest'

import { validateStageTableStorylinesStructure } from './stage-table-storylines-validator'

describe('validateStageTableStorylinesStructure', () => {
  it('passes for sampled storylines with valid structure', () => {
    const report = validateStageTableStorylinesStructure(
      {
        storylines: {
          mainLine: {
            storylineId: 'mainLine',
            storylineType: 'CONTINUE',
            sortId: 0,
            storylineName: '为了明日',
            storylineIconId: null,
            storylineLogoId: 'storyline_Ms',
            backgroundId: 'bg_mainLine_0',
            hasVideoToPlay: true,
            startTs: 0,
            locations: {
              mainline_0_1: {
                locationId: 'mainline_0_1',
                locationType: 'STORY_SET',
                sortId: 10,
                startTime: 0,
                presentStageId: null,
                unlockStageId: null,
                relevantStorySetId: 'setId_mainline_0_1',
                mainlineSplitData: null,
              },
            },
          },
        },
      },
      {
        sampleSize: 1,
        locationSampleSize: 1,
      }
    )

    expect(report.valid).toBe(true)
    expect(report.issues).toEqual([])
    expect(report.totalStorylines).toBe(1)
    expect(report.storylineTypeDistribution).toEqual({ CONTINUE: 1 })
    expect(report.locationTypeDistribution).toEqual({ STORY_SET: 1 })
  })

  it('reports diagnostics when sampled structure is invalid', () => {
    const report = validateStageTableStorylinesStructure(
      {
        storylines: {
          brokenLine: {
            storylineId: 'brokenLine',
            storylineType: 'CONTINUE',
            sortId: 1,
            storylineName: 'Broken',
            storylineIconId: null,
            storylineLogoId: null,
            backgroundId: null,
            hasVideoToPlay: true,
            startTs: 0,
            locations: [
              {
                locationId: 'not-allowed-array',
              },
            ],
          },
        },
      },
      {
        sampleSize: 1,
      }
    )

    expect(report.valid).toBe(false)
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'stage_table.storylines.brokenLine.locations',
          expected: 'object',
          actual: 'array',
        }),
      ])
    )
  })
})
