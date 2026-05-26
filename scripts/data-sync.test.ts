import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import type { DataSourceProvider } from '../src/infrastructure/data-source'
import { FileSystemArkDataCache } from './sync'
import { runDataSyncWithDependencies } from './data-sync'

describe('runDataSync', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(
      tempDirs.map(async (dir) => {
        await rm(dir, { recursive: true, force: true })
      })
    )
    tempDirs.length = 0
  })

  it('skips sync when the same revision has already been synced', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ark-sync-'))
    tempDirs.push(root)

    const cache = new FileSystemArkDataCache({ baseDir: root })
    const source = createStubSource('abc1234')
    const now = createFixedNow('2026-05-10T09:00:00.000Z')

    const first = await runDataSyncWithDependencies(
      {
        locale: 'zh_CN',
      },
      {
        cache,
        source,
        now,
      }
    )

    expect(first.status).toBe('success')
    expect(first.reason).toBe('revision-changed-or-first-sync')
    expect(first.diagnostics).toEqual({
      syncedAvgStoryTextCount: 2,
      failedAvgStoryTextCount: 0,
      failedAvgStoryTextSamples: [],
      parseErrors: [],
      missingFiles: [],
    })

    await expect(
      cache.readJson<{
        storyReviewTable: {
          entryA: { infoUnlockDatas: Array<{ storyTxt: string }> }
          entryB: { infoUnlockDatas: Array<{ storyTxt: string }> }
        }
      }>('zh_CN', 'abc1234', 'gamedata/excel/story_review_table.json')
    ).resolves.toMatchObject({
      storyReviewTable: {
        entryA: {
          infoUnlockDatas: [
            { storyTxt: 'obt/main/avg_story_1' },
            { storyTxt: 'obt/main/avg_story_2.txt' },
          ],
        },
        entryB: {
          infoUnlockDatas: [{ storyTxt: '/story/obt/main/avg_story_1' }, { storyTxt: '' }],
        },
      },
    })

    await expect(
      cache.readJson<{ storyReviewMetaTable: { test: true } }>(
        'zh_CN',
        'abc1234',
        'gamedata/excel/story_review_meta_table.json'
      )
    ).resolves.toEqual({
      storyReviewMetaTable: {
        test: true,
      },
    })

    await expect(
      cache.readJson<{ chapterTable: { test: true } }>(
        'zh_CN',
        'abc1234',
        'gamedata/excel/chapter_table.json'
      )
    ).resolves.toEqual({
      chapterTable: {
        test: true,
      },
    })

    await expect(
      cache.readJson<{ stageTable: { test: true } }>(
        'zh_CN',
        'abc1234',
        'gamedata/excel/stage_table.json'
      )
    ).resolves.toEqual({
      stageTable: {
        test: true,
      },
    })

    await expect(
      cache.readText('zh_CN', 'abc1234', 'gamedata/story/obt/main/avg_story_1.txt')
    ).resolves.toBe('story 1')

    await expect(
      cache.readText('zh_CN', 'abc1234', 'gamedata/story/obt/main/avg_story_2.txt')
    ).resolves.toBe('story 2')

    await expect(
      cache.readJson<{ files: Array<{ path: string; status: string }> }>(
        'zh_CN',
        'abc1234',
        'sync-report.json'
      )
    ).resolves.toMatchObject({
      files: [
        {
          path: 'zh_CN/gamedata/excel/story_review_table.json',
          status: 'downloaded',
        },
        {
          path: 'zh_CN/gamedata/excel/story_review_meta_table.json',
          status: 'downloaded',
        },
        {
          path: 'zh_CN/gamedata/excel/chapter_table.json',
          status: 'downloaded',
        },
        {
          path: 'zh_CN/gamedata/excel/stage_table.json',
          status: 'downloaded',
        },
        {
          path: 'zh_CN/gamedata/story/obt/main/avg_story_1.txt',
          status: 'downloaded',
        },
        {
          path: 'zh_CN/gamedata/story/obt/main/avg_story_2.txt',
          status: 'downloaded',
        },
      ],
    })

    const second = await runDataSyncWithDependencies(
      {
        locale: 'zh_CN',
      },
      {
        cache,
        source,
        now,
      }
    )

    expect(second.status).toBe('skipped')
    expect(second.reason).toBe('revision-unchanged')
    expect(second.diagnostics).toEqual({
      syncedAvgStoryTextCount: 0,
      failedAvgStoryTextCount: 0,
      failedAvgStoryTextSamples: [],
      parseErrors: [],
      missingFiles: [],
    })

    await expect(
      cache.readJson<{ status: string; reason?: string }>('zh_CN', 'abc1234', 'sync-report.json')
    ).resolves.toMatchObject({
      status: 'skipped',
      reason: 'revision-unchanged',
    })
  })

  it('records failed AVG story text samples without failing the whole sync', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ark-sync-'))
    tempDirs.push(root)

    const cache = new FileSystemArkDataCache({ baseDir: root })
    const source = createStubSource('def5678', {
      missingPaths: ['zh_CN/gamedata/story/obt/main/avg_story_2.txt'],
    })
    const now = createFixedNow('2026-05-10T10:00:00.000Z')

    const result = await runDataSyncWithDependencies(
      {
        locale: 'zh_CN',
      },
      {
        cache,
        source,
        now,
      }
    )

    expect(result.status).toBe('success')
    expect(result.diagnostics.syncedAvgStoryTextCount).toBe(1)
    expect(result.diagnostics.failedAvgStoryTextCount).toBe(1)
    expect(result.diagnostics.failedAvgStoryTextSamples).toEqual([
      'zh_CN/gamedata/story/obt/main/avg_story_2.txt',
    ])
    expect(result.diagnostics.missingFiles).toEqual([
      {
        path: 'zh_CN/gamedata/story/obt/main/avg_story_2.txt',
        stage: 'sync-required-avg-story-texts',
        message: 'simulated missing path: zh_CN/gamedata/story/obt/main/avg_story_2.txt',
      },
    ])
    expect(result.diagnostics.parseErrors).toEqual([])

    const report = await cache.readJson<{
      totals: { failed: number }
      diagnostics: { parseErrors: unknown[]; missingFiles: Array<{ path: string; stage: string }> }
      files: Array<{ path: string; status: string }>
    }>('zh_CN', 'def5678', 'sync-report.json')

    expect(report.totals.failed).toBe(1)
    expect(report.diagnostics.parseErrors).toEqual([])
    expect(report.diagnostics.missingFiles).toEqual([
      expect.objectContaining({
        path: 'zh_CN/gamedata/story/obt/main/avg_story_2.txt',
        stage: 'sync-required-avg-story-texts',
      }),
    ])
    expect(report.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'zh_CN/gamedata/story/obt/main/avg_story_2.txt',
          status: 'failed',
        }),
      ])
    )
  })

  it('records parse diagnostics when story_review_table is invalid JSON', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ark-sync-'))
    tempDirs.push(root)

    const cache = new FileSystemArkDataCache({ baseDir: root })
    const source = createStubSource('ab19012', {
      invalidStoryReviewTableJson: true,
    })
    const now = createFixedNow('2026-05-10T10:30:00.000Z')

    const result = await runDataSyncWithDependencies(
      {
        locale: 'zh_CN',
      },
      {
        cache,
        source,
        now,
      }
    )

    expect(result.diagnostics.syncedAvgStoryTextCount).toBe(0)
    expect(result.diagnostics.failedAvgStoryTextCount).toBe(0)
    expect(result.diagnostics.failedAvgStoryTextSamples).toEqual([])
    expect(result.diagnostics.missingFiles).toEqual([])
    expect(result.diagnostics.parseErrors).toEqual([
      {
        path: 'gamedata/excel/story_review_table.json',
        stage: 'parse-story-review-table',
        message: expect.stringContaining('Failed to parse JSON:'),
      },
    ])

    await expect(
      cache.readJson<{ diagnostics: { parseErrors: unknown[]; missingFiles: unknown[] } }>(
        'zh_CN',
        'ab19012',
        'sync-report.json'
      )
    ).resolves.toMatchObject({
      diagnostics: {
        missingFiles: [],
        parseErrors: [
          {
            path: 'gamedata/excel/story_review_table.json',
            stage: 'parse-story-review-table',
          },
        ],
      },
    })
  })

  it('re-syncs when existing revision cache only has sync-report without core files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ark-sync-'))
    tempDirs.push(root)

    const cache = new FileSystemArkDataCache({ baseDir: root })
    const source = createStubSource('ca11e001')
    const now = createFixedNow('2026-05-10T11:00:00.000Z')

    await cache.ensureRevisionDir('zh_CN', 'ca11e001')
    await cache.writeJson('zh_CN', 'ca11e001', 'sync-report.json', {
      status: 'success',
      reason: 'revision-unchanged',
    })

    const result = await runDataSyncWithDependencies(
      {
        locale: 'zh_CN',
      },
      {
        cache,
        source,
        now,
      }
    )

    expect(result.status).toBe('success')
    expect(result.reason).toBe('revision-unchanged-cache-incomplete')
    expect(result.diagnostics.syncedAvgStoryTextCount).toBe(2)

    await expect(
      cache.readJson('zh_CN', 'ca11e001', 'gamedata/excel/story_review_table.json')
    ).resolves.toBeTruthy()
    await expect(
      cache.readText('zh_CN', 'ca11e001', 'gamedata/story/obt/main/avg_story_1.txt')
    ).resolves.toBe('story 1')
  })
})

function createStubSource(
  commitSha: string,
  options: {
    missingPaths?: string[]
    invalidStoryReviewTableJson?: boolean
  } = {}
): DataSourceProvider {
  const missingPaths = new Set(options.missingPaths ?? [])

  return {
    id: 'stub-source',
    label: 'Stub Source',
    async getRevision() {
      return {
        providerId: 'stub-source',
        commitSha,
      }
    },
    async getText(path: string) {
      if (missingPaths.has(path)) {
        throw new Error(`simulated missing path: ${path}`)
      }

      if (path === 'zh_CN/gamedata/excel/story_review_table.json') {
        if (options.invalidStoryReviewTableJson === true) {
          return '{invalid-json'
        }

        return JSON.stringify({
          storyReviewTable: {
            entryA: {
              infoUnlockDatas: [
                {
                  storyTxt: 'obt/main/avg_story_1',
                },
                {
                  storyTxt: 'obt/main/avg_story_2.txt',
                },
              ],
            },
            entryB: {
              infoUnlockDatas: [
                {
                  storyTxt: '/story/obt/main/avg_story_1',
                },
                {
                  storyTxt: '',
                },
              ],
            },
          },
        })
      }

      if (path === 'zh_CN/gamedata/excel/story_review_meta_table.json') {
        return JSON.stringify({
          storyReviewMetaTable: {
            test: true,
          },
        })
      }

      if (path === 'zh_CN/gamedata/excel/chapter_table.json') {
        return JSON.stringify({
          chapterTable: {
            test: true,
          },
        })
      }

      if (path === 'zh_CN/gamedata/excel/stage_table.json') {
        return JSON.stringify({
          stageTable: {
            test: true,
          },
        })
      }

      if (path === 'zh_CN/gamedata/story/obt/main/avg_story_1.txt') {
        return 'story 1'
      }

      if (path === 'zh_CN/gamedata/story/obt/main/avg_story_2.txt') {
        return 'story 2'
      }

      throw new Error(`unexpected path: ${path}`)
    },
    async getJson<T>(path: string): Promise<T> {
      void path
      throw new Error('not implemented in test')
    },
  }
}

function createFixedNow(timestamp: string): () => Date {
  return () => new Date(timestamp)
}
