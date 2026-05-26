import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { validateStageTableSchemaForBuild } from './data-build'

describe('validateStageTableSchemaForBuild', () => {
  it('throws when storylineStorySets shape is invalid', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ark-schema-'))

    try {
      await mkdir(join(root, 'gamedata/excel'), { recursive: true })
      await writeFile(
        join(root, 'gamedata/excel/stage_table.json'),
        JSON.stringify(
          {
            storylines: {},
            storylineStorySets: {
              bad: {
                storySetId: 'bad',
                storySetType: 'COLLECT',
                sortByYear: 1,
                sortWithinYear: 1,
                kvImageId: 'a',
                titleImageId: 'b',
                haveVideoToPlay: false,
                backgroundId: null,
                gameMusicId: 'm',
                coreRewardType: 'NONE',
                coreRewardId: null,
                relevantActivityId: null,
                mainlineData: null,
                ssData: null,
                collectData: null,
              },
            },
          },
          null,
          2
        ),
        'utf8'
      )

      await expect(validateStageTableSchemaForBuild(root)).rejects.toThrow(
        'stage_table schema validation failed'
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
