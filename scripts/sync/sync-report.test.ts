import { describe, expect, it } from 'vitest'

import { createSyncReport } from './sync-report'

describe('createSyncReport', () => {
  it('builds report totals and duration from file results', () => {
    const report = createSyncReport({
      locale: 'zh_CN',
      providerId: 'github-raw',
      revision: 'rev-123',
      status: 'success',
      startedAt: '2026-05-10T10:00:00.000Z',
      finishedAt: '2026-05-10T10:00:03.500Z',
      files: [
        {
          path: 'gamedata/excel/story_review_table.json',
          status: 'downloaded',
          bytes: 1024,
        },
        {
          path: 'gamedata/excel/stage_table.json',
          status: 'cached',
        },
        {
          path: 'gamedata/story/story_1.txt',
          status: 'failed',
          error: '404',
        },
      ],
      diagnostics: {
        parseErrors: [
          {
            path: 'gamedata/excel/story_review_table.json',
            stage: 'parse-story-review-table',
            message: 'Invalid payload.',
          },
        ],
        missingFiles: [
          {
            path: 'zh_CN/gamedata/story/story_1.txt',
            stage: 'sync-required-avg-story-texts',
            message: '404 not found',
          },
        ],
      },
    })

    expect(report.durationMs).toBe(3500)
    expect(report.totals).toEqual({
      files: 3,
      downloaded: 1,
      cached: 1,
      failed: 1,
    })
    expect(report.diagnostics).toEqual({
      parseErrors: [
        {
          path: 'gamedata/excel/story_review_table.json',
          stage: 'parse-story-review-table',
          message: 'Invalid payload.',
        },
      ],
      missingFiles: [
        {
          path: 'zh_CN/gamedata/story/story_1.txt',
          stage: 'sync-required-avg-story-texts',
          message: '404 not found',
        },
      ],
    })
  })

  it('supports Date input and defaults to empty file list', () => {
    const report = createSyncReport({
      locale: 'zh_CN',
      providerId: 'local-fixture',
      revision: 'rev-456',
      status: 'skipped',
      startedAt: new Date('2026-05-10T11:00:00.000Z'),
      finishedAt: new Date('2026-05-10T11:00:00.000Z'),
    })

    expect(report.files).toEqual([])
    expect(report.totals).toEqual({
      files: 0,
      downloaded: 0,
      cached: 0,
      failed: 0,
    })
    expect(report.diagnostics).toEqual({
      parseErrors: [],
      missingFiles: [],
    })
  })

  it('throws when finishedAt is earlier than startedAt', () => {
    expect(() =>
      createSyncReport({
        locale: 'zh_CN',
        providerId: 'github-raw',
        revision: 'rev-789',
        status: 'failed',
        startedAt: '2026-05-10T12:00:01.000Z',
        finishedAt: '2026-05-10T12:00:00.000Z',
      })
    ).toThrow('finishedAt must be greater than or equal to startedAt')
  })
})
