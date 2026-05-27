import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { buildStaticDataService, listBuiltDataFiles } from './build-static-data-service'
import { LocalAssetSourceProvider } from './asset-source-provider'

const TEST_IMAGE_1X1 = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="#fff"/></svg>'
)

describe('buildStaticDataService', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
    tempDirs.length = 0
  })

  it('builds core static artifacts and records schema/source in manifest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ark-static-build-'))
    tempDirs.push(root)

    const inputDir = join(root, 'input')
    const outputDir = join(root, 'public-data')
    const overridesPath = join(root, 'storyline-overrides.json')

    await writeJson(join(inputDir, 'sync-report.json'), {
      providerId: 'github-raw',
      revision: 'rev-test-001',
    })

    await writeJson(join(inputDir, 'gamedata/excel/story_review_table.json'), {
      storyReviewTable: {
        act_test: {
          albumKind: 'ACTIVITY',
          name: '测试活动',
          startTime: 100,
          infoUnlockDatas: [
            {
              storyCode: 'ST-1',
              storyName: '黑暗时代·上',
              storyInfo: '章节摘要',
              storyTxt: 'gamedata/story/activities/act_test/level_act_test_01_beg.txt',
              avgTag: 'before',
              storySort: 1,
              requiredStages: [{ stageId: 'stage_1' }],
            },
          ],
        },
      },
    })

    await writeJson(join(inputDir, 'gamedata/excel/stage_table.json'), {
      storylineStorySets: {
        test_set: {
          storySetId: 'act_test',
          storySetType: 'SS',
          sortByYear: 2024,
          sortWithinYear: 1,
        },
      },
    })

    await writeJson(overridesPath, {
      version: 1,
      overrides: [],
    })

    await writeText(
      join(inputDir, 'story/activities/act_test/level_act_test_01_beg.txt'),
      '[name="Amiya"]\n博士，欢迎回来。\n\n[Dialog]\n'
    )

    const report = await buildStaticDataService.build({
      locale: 'zh_CN',
      inputDir,
      outputDir,
      generatedAt: new Date('2026-05-10T12:00:00.000Z'),
      timelineRulesInput: {
        overridesFilePath: overridesPath,
      },
    })

    expect(report.schemaVersion).toBe(1)
    expect(report.source).toEqual({
      providerId: 'github-raw',
      commitSha: 'rev-test-001',
    })
    expect(report.diagnostics.missingStorySources).toEqual([])

    const builtFiles = await listBuiltDataFiles(join(outputDir, 'zh_CN'))
    expect(builtFiles).toEqual(
      expect.arrayContaining([
        'manifest.json',
        'catalog.json',
        'timeline.json',
        'search-index.json',
        'albums/act_test.json',
        'chapters/act_test--activities__act_test__level_act_test_01_beg.json',
      ])
    )

    const manifest = await readJson<{
      schemaVersion: number
      locale: string
      source: { providerId: string; commitSha: string }
      files: Record<string, string>
    }>(join(outputDir, 'zh_CN/manifest.json'))

    expect(manifest.schemaVersion).toBe(1)
    expect(manifest.locale).toBe('zh_CN')
    expect(manifest.source).toEqual({
      providerId: 'github-raw',
      commitSha: 'rev-test-001',
    })
    expect(manifest.files).toMatchObject({
      'catalog.json': expect.any(String),
      'timeline.json': expect.any(String),
      'search-index.json': expect.any(String),
      'albums/act_test.json': expect.any(String),
      'chapters/act_test--activities__act_test__level_act_test_01_beg.json': expect.any(String),
    })

    const searchIndex = await readJson<{
      entries: Array<{ kind: string; target: { route: string } }>
    }>(join(outputDir, 'zh_CN/search-index.json'))
    expect(searchIndex.entries.some((entry) => entry.kind === 'album')).toBe(true)
    expect(searchIndex.entries.some((entry) => entry.kind === 'chapter')).toBe(true)
    expect(searchIndex.entries.some((entry) => entry.kind === 'stage')).toBe(true)
    expect(
      searchIndex.entries.every(
        (entry) => entry.target.route === 'album' || entry.target.route === 'chapter'
      )
    ).toBe(true)

    const typedSearchIndex = await readJson<{
      entries: Array<{
        id: string
        kind: 'album' | 'chapter' | 'stage'
        displayTitle: string
        displaySecondary?: string
        match: { aliases: string[]; exactIds: string[] }
      }>
    }>(join(outputDir, 'zh_CN/search-index.json'))
    const chapterEntry = typedSearchIndex.entries.find((entry) => entry.kind === 'chapter')
    const stageEntry = typedSearchIndex.entries.find((entry) => entry.kind === 'stage')

    expect(chapterEntry).toBeDefined()
    expect(chapterEntry?.displayTitle).toBe('ST-1 黑暗时代·上')
    expect(chapterEntry?.displaySecondary).toBe('测试活动')
    expect(chapterEntry?.match.exactIds).toEqual(expect.arrayContaining(['ST-1']))

    expect(stageEntry).toBeDefined()
    expect(stageEntry?.displayTitle).toBe('ST-1 黑暗时代·上')
    expect(stageEntry?.displaySecondary).toContain('stage_1')
    expect(stageEntry?.match.aliases).toEqual(expect.arrayContaining(['stage_1']))
  })

  it('builds operatorRecord from albumKind NONE readable chapters and includes timeline/search outputs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ark-static-build-'))
    tempDirs.push(root)

    const inputDir = join(root, 'input')
    const outputDir = join(root, 'public-data')
    const overridesPath = join(root, 'storyline-overrides.json')

    await writeJson(join(inputDir, 'sync-report.json'), {
      providerId: 'github-raw',
      revision: 'rev-test-002',
    })

    await writeJson(join(inputDir, 'gamedata/excel/story_review_table.json'), {
      storyReviewTable: {
        oprec_test: {
          albumKind: 'NONE',
          name: '干员密录测试',
          startTime: 1,
          infoUnlockDatas: [
            {
              storyCode: 'OPR-1',
              storyName: '测试密录',
              storyInfo: '章节摘要',
              storyTxt: 'gamedata/story/operators/oprec_test/record_01.txt',
              avgTag: 'after',
              storySort: 1,
              requiredStages: [{ stageId: 'stage_opr_1' }],
            },
          ],
        },
      },
    })

    await writeJson(join(inputDir, 'gamedata/excel/stage_table.json'), {
      storylineStorySets: {},
    })

    await writeJson(overridesPath, {
      version: 1,
      overrides: [],
    })

    await writeText(
      join(inputDir, 'story/operators/oprec_test/record_01.txt'),
      '[name="Amiya"]\n这是一条干员密录。\n\n[Dialog]\n'
    )

    await buildStaticDataService.build({
      locale: 'zh_CN',
      inputDir,
      outputDir,
      generatedAt: new Date('2026-05-10T12:30:00.000Z'),
      timelineRulesInput: {
        overridesFilePath: overridesPath,
      },
    })

    const album = await readJson<{
      albumKind: string
      homeSection: string
      gameOrderRank?: number
      chapters: Array<{ id: string }>
    }>(join(outputDir, 'zh_CN/albums/oprec_test.json'))

    const timeline = await readJson<{
      items: Array<{
        albumId: string
        section: string
        gameOrderRank?: number
        albumKind: string
        timelineRank: number
      }>
    }>(join(outputDir, 'zh_CN/timeline.json'))

    const searchIndex = await readJson<{
      entries: Array<{
        id: string
        kind: 'album' | 'chapter' | 'stage'
        type: string
        albumId: string
      }>
    }>(join(outputDir, 'zh_CN/search-index.json'))

    expect(album.albumKind).toBe('operatorRecord')
    expect(album.homeSection).toBe('operatorRecord')
    expect(album.chapters.length).toBe(1)
    expect(timeline.items).toHaveLength(1)
    expect(timeline.items[0]).toMatchObject({
      albumId: 'oprec_test',
      section: 'operatorRecord',
      timelineRank: 1,
      albumKind: 'operatorRecord',
    })
    expect(
      searchIndex.entries.some(
        (entry) => entry.id === 'album:oprec_test' && entry.type === 'operatorRecord'
      )
    ).toBe(true)
    expect(
      searchIndex.entries.some(
        (entry) => entry.kind === 'chapter' && entry.albumId === 'oprec_test'
      )
    ).toBe(true)
  })

  it('skips albumKind NONE albums that have no readable storyTxt chapters', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ark-static-build-'))
    tempDirs.push(root)

    const inputDir = join(root, 'input')
    const outputDir = join(root, 'public-data')
    const overridesPath = join(root, 'storyline-overrides.json')

    await writeJson(join(inputDir, 'sync-report.json'), {
      providerId: 'github-raw',
      revision: 'rev-test-002-none-filter',
    })

    await writeJson(join(inputDir, 'gamedata/excel/story_review_table.json'), {
      storyReviewTable: {
        oprec_readable: {
          albumKind: 'NONE',
          name: '可读密录',
          startTime: 1,
          infoUnlockDatas: [
            {
              storyCode: 'OPR-R-1',
              storyName: '可读章节',
              storyInfo: '章节摘要',
              storyTxt: 'gamedata/story/operators/oprec_readable/record_01.txt',
              avgTag: 'after',
              storySort: 1,
              requiredStages: [{ stageId: 'stage_opr_r_1' }],
            },
          ],
        },
        oprec_empty: {
          albumKind: 'NONE',
          name: '空密录',
          startTime: 2,
          infoUnlockDatas: [
            {
              storyCode: 'OPR-E-1',
              storyName: '空章节',
              storyInfo: '章节摘要',
              storyTxt: '',
              avgTag: 'after',
              storySort: 1,
              requiredStages: [{ stageId: 'stage_opr_e_1' }],
            },
          ],
        },
      },
    })

    await writeJson(join(inputDir, 'gamedata/excel/stage_table.json'), {
      storylineStorySets: {},
    })

    await writeJson(overridesPath, {
      version: 1,
      overrides: [],
    })

    await writeText(
      join(inputDir, 'story/operators/oprec_readable/record_01.txt'),
      '[name="Amiya"]\n可读密录正文。\n\n[Dialog]\n'
    )

    await buildStaticDataService.build({
      locale: 'zh_CN',
      inputDir,
      outputDir,
      generatedAt: new Date('2026-05-10T12:45:00.000Z'),
      timelineRulesInput: {
        overridesFilePath: overridesPath,
      },
    })

    const catalog = await readJson<{
      albums: Array<{ id: string; albumKind: string }>
    }>(join(outputDir, 'zh_CN/catalog.json'))

    const albumIds = catalog.albums.map((album) => album.id)
    expect(albumIds).toContain('oprec_readable')
    expect(albumIds).not.toContain('oprec_empty')
    expect(catalog.albums.find((album) => album.id === 'oprec_readable')?.albumKind).toBe(
      'operatorRecord'
    )
  })

  it('maps upstream storylineStorySets set ids to matching review album ids', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ark-static-build-'))
    tempDirs.push(root)

    const inputDir = join(root, 'input')
    const outputDir = join(root, 'public-data')
    const overridesPath = join(root, 'storyline-overrides.json')

    await writeJson(join(inputDir, 'sync-report.json'), {
      providerId: 'github-raw',
      revision: 'rev-test-003',
    })

    await writeJson(join(inputDir, 'gamedata/excel/story_review_table.json'), {
      main_0: {
        id: 'main_0',
        albumKind: 'MAINLINE',
        name: '黑暗时代·上',
        startTime: 1,
        infoUnlockDatas: [
          {
            storyCode: '0-1',
            storyName: '序章',
            storyInfo: '章节摘要',
            storyTxt: 'gamedata/story/obt/main/level_main_00-01_beg.txt',
            avgTag: 'before',
            storySort: 1,
            requiredStages: [{ stageId: 'main_00-01' }],
          },
        ],
      },
      act9d0: {
        id: 'act9d0',
        albumKind: 'ACTIVITY',
        name: '生于黑夜',
        startTime: 2,
        infoUnlockDatas: [
          {
            storyCode: 'DM-1',
            storyName: '埋藏',
            storyInfo: '章节摘要',
            storyTxt: 'gamedata/story/activities/act9d0/level_act9d0_01_beg.txt',
            avgTag: 'before',
            storySort: 1,
            requiredStages: [{ stageId: 'act9d0_01' }],
          },
        ],
      },
    })

    await writeJson(join(inputDir, 'gamedata/excel/stage_table.json'), {
      storylineStorySets: {
        setId_mainline_0_1: {
          storySetId: 'setId_mainline_0_1',
          storySetType: 'MAINLINE',
          sortByYear: 1,
          sortWithinYear: 1,
          relevantActivityId: null,
          mainlineData: {
            zoneId: 'main_0',
          },
        },
        setId_ssLine_act9d0: {
          storySetId: 'setId_ssLine_act9d0',
          storySetType: 'SS',
          sortByYear: 1,
          sortWithinYear: 14,
          relevantActivityId: 'act9d0',
          mainlineData: null,
        },
      },
    })

    await writeJson(overridesPath, {
      version: 1,
      overrides: [],
    })

    await writeText(
      join(inputDir, 'story/obt/main/level_main_00-01_beg.txt'),
      '[name="Amiya"]\n主线剧情。\n\n[Dialog]\n'
    )
    await writeText(
      join(inputDir, 'story/activities/act9d0/level_act9d0_01_beg.txt'),
      '[name="W"]\n别传剧情。\n\n[Dialog]\n'
    )

    await buildStaticDataService.build({
      locale: 'zh_CN',
      inputDir,
      outputDir,
      generatedAt: new Date('2026-05-10T13:00:00.000Z'),
      timelineRulesInput: {
        overridesFilePath: overridesPath,
      },
    })

    const timeline = await readJson<{
      items: Array<{
        albumId: string
        section: string
        side?: string
        timelineRank: number
        gameOrderRank?: number
      }>
    }>(join(outputDir, 'zh_CN/timeline.json'))

    expect(timeline.items).toEqual([
      expect.objectContaining({
        albumId: 'main_0',
        section: 'mainline',
        side: 'left',
        timelineRank: 1,
        gameOrderRank: 1001,
      }),
      expect.objectContaining({
        albumId: 'act9d0',
        section: 'mainline',
        side: 'right',
        timelineRank: 2,
        gameOrderRank: 1014,
      }),
    ])
  })

  it('keeps mainline special story sets in mainline order when upstream omits zoneId', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ark-static-build-'))
    tempDirs.push(root)

    const inputDir = join(root, 'input')
    const outputDir = join(root, 'public-data')
    const overridesPath = join(root, 'storyline-overrides.json')

    await writeJson(join(inputDir, 'sync-report.json'), {
      providerId: 'github-raw',
      revision: 'rev-test-mainline-special',
    })

    await writeJson(join(inputDir, 'gamedata/excel/story_review_table.json'), {
      storyReviewTable: {
        main_0: {
          albumKind: 'MAINLINE',
          name: '慈悲灯塔',
          startTime: 1,
          infoUnlockDatas: [
            {
              storyCode: '14-1',
              storyName: '她所见的',
              storyTxt: 'gamedata/story/obt/main/level_main_14-01_beg.txt',
              avgTag: 'before',
              storySort: 1,
            },
          ],
        },
        main_1: {
          albumKind: 'MAINLINE',
          name: '离解复合',
          startTime: 2,
          infoUnlockDatas: [
            {
              storyCode: '15-1',
              storyName: '特殊主线',
              storyTxt: 'gamedata/story/obt/main/level_main_15-01_beg.txt',
              avgTag: 'before',
              storySort: 1,
            },
          ],
        },
        act2mainss: {
          albumKind: 'ACTIVITY',
          name: '错误活动映射',
          startTime: 3,
          infoUnlockDatas: [
            {
              storyCode: 'SS-1',
              storyName: '不应成为主线',
              storyTxt: 'gamedata/story/activities/act2mainss/level_act2mainss_01_beg.txt',
              avgTag: 'before',
              storySort: 1,
            },
          ],
        },
      },
    })

    await writeJson(join(inputDir, 'gamedata/excel/stage_table.json'), {
      storylines: {
        mainLine: {
          storylineId: 'mainLine',
          locations: {
            split_3: {
              locationType: 'MAINLINE_SPLIT',
              sortId: 1,
              mainlineSplitData: { subName: 'NEXUS POINT OF FUTURE' },
            },
            special_mainline: {
              locationType: 'STORY_SET',
              sortId: 2,
              relevantStorySetId: 'set_special_mainline',
            },
          },
        },
      },
      storylineStorySets: {
        set_regular_mainline: {
          storySetId: 'set_regular_mainline',
          storySetType: 'MAINLINE',
          sortByYear: 1,
          sortWithinYear: 1,
          mainlineData: {
            zoneId: 'main_0',
          },
        },
        set_special_mainline: {
          storySetId: 'set_special_mainline',
          storySetType: 'MAINLINE',
          sortByYear: 1,
          sortWithinYear: 2,
          relevantActivityId: 'act2mainss',
        },
      },
    })

    await writeJson(overridesPath, {
      version: 1,
      overrides: [],
    })

    await writeText(
      join(inputDir, 'gamedata/story/obt/main/level_main_14-01_beg.txt'),
      '[name="阿米娅"]\n主线正文。\n\n[Dialog]\n'
    )
    await writeText(
      join(inputDir, 'gamedata/story/obt/main/level_main_15-01_beg.txt'),
      '[name="博士"]\n特殊主线正文。\n\n[Dialog]\n'
    )
    await writeText(
      join(inputDir, 'gamedata/story/activities/act2mainss/level_act2mainss_01_beg.txt'),
      '[name="W"]\n活动正文。\n\n[Dialog]\n'
    )

    await buildStaticDataService.build({
      locale: 'zh_CN',
      inputDir,
      outputDir,
      generatedAt: new Date('2026-05-10T13:15:00.000Z'),
      timelineRulesInput: {
        overridesFilePath: overridesPath,
      },
    })

    const catalog = await readJson<{
      albums: Array<{
        id: string
        albumKind: string
        music?: {
          arcTitle?: string
        }
      }>
    }>(join(outputDir, 'zh_CN/catalog.json'))

    const specialMainline = catalog.albums.find((album) => album.id === 'main_1')
    const wrongActivity = catalog.albums.find((album) => album.id === 'act2mainss')

    expect(specialMainline?.albumKind).toBe('mainline')
    expect(specialMainline?.music?.arcTitle).toBe('Ⅲ 裂变')
    expect(wrongActivity?.music).toBeUndefined()
  })

  it('writes lightweight chapter shells without embedding story text', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ark-static-build-'))
    tempDirs.push(root)

    const inputDir = join(root, 'input')
    const outputDir = join(root, 'public-data')
    const overridesPath = join(root, 'storyline-overrides.json')

    await writeJson(join(inputDir, 'sync-report.json'), {
      providerId: 'github-raw',
      revision: 'rev-test-a001-normalization',
    })

    await writeJson(join(inputDir, 'gamedata/excel/story_review_table.json'), {
      storyReviewTable: {
        '1stact': {
          albumKind: 'ACTIVITY',
          name: '一周年活动测试',
          startTime: 100,
          infoUnlockDatas: [
            {
              storyCode: 'A001-1',
              storyName: '相遇',
              storyInfo: '路径归一化测试章节',
              storyTxt: 'activities/a001/level_a001_01_beg',
              avgTag: 'before',
              storySort: 1,
              requiredStages: [{ stageId: 'a001_01' }],
            },
          ],
        },
      },
    })

    await writeJson(join(inputDir, 'gamedata/excel/stage_table.json'), {
      storylineStorySets: {
        a001_set: {
          storySetId: '1stact',
          storySetType: 'SS',
          sortByYear: 2020,
          sortWithinYear: 1,
        },
      },
    })

    await writeJson(overridesPath, {
      version: 1,
      overrides: [],
    })

    await writeText(
      join(inputDir, 'gamedata/story/activities/a001/level_a001_01_beg.txt'),
      '[name="Amiya"]\n测试正文存在。\n\n[Dialog]\n'
    )

    const report = await buildStaticDataService.build({
      locale: 'zh_CN',
      inputDir,
      outputDir,
      generatedAt: new Date('2026-05-10T13:30:00.000Z'),
      timelineRulesInput: {
        overridesFilePath: overridesPath,
      },
    })

    expect(report.diagnostics.missingStorySources).toEqual([])

    const album = await readJson<{
      chapters: Array<{ id: string }>
    }>(join(outputDir, 'zh_CN/albums/1stact.json'))

    expect(album.chapters.length).toBe(1)

    const chapter = await readJson<{
      id: string
      albumId: string
      title: string
      blocks: unknown[]
    }>(join(outputDir, `zh_CN/chapters/${album.chapters[0]!.id}.json`))

    expect(chapter).toMatchObject({
      id: album.chapters[0]!.id,
      albumId: '1stact',
      title: '相遇',
      blocks: [],
    })
  })

  it('keeps chapter text out of the static build even when local AVG files exist', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ark-static-build-'))
    tempDirs.push(root)

    const inputDir = join(root, 'input')
    const outputDir = join(root, 'public-data')
    const overridesPath = join(root, 'storyline-overrides.json')

    await writeJson(join(inputDir, 'sync-report.json'), {
      providerId: 'github-raw',
      revision: 'rev-test-inline-dialogue',
    })

    await writeJson(join(inputDir, 'gamedata/excel/story_review_table.json'), {
      storyReviewTable: {
        main_0: {
          albumKind: 'MAINLINE',
          name: '序章',
          startTime: 1,
          infoUnlockDatas: [
            {
              storyCode: '0-1',
              storyName: '坍塌',
              storyInfo: '测试 inline cue 解析',
              storyTxt: 'gamedata/story/obt/main/level_main_00-01_beg.txt',
              avgTag: 'before',
              storySort: 1,
              requiredStages: [{ stageId: 'main_00-01' }],
            },
          ],
        },
      },
    })

    await writeJson(join(inputDir, 'gamedata/excel/stage_table.json'), {
      storylineStorySets: {
        set_main_0: {
          storySetId: 'main_0',
          storySetType: 'MAINLINE',
          sortByYear: 1,
          sortWithinYear: 1,
          mainlineData: {
            zoneId: 'main_0',
          },
        },
      },
    })

    await writeJson(overridesPath, {
      version: 1,
      overrides: [],
    })

    await writeText(
      join(inputDir, 'gamedata/story/obt/main/level_main_00-01_beg.txt'),
      [
        '[Character(name="char_130_doberm_ex")]',
        '[name="杜宾"]  可恶......',
        '[name="杜宾"]  这里，究竟怎么了？',
        '[Character(name="char_002_amiya_1#5")]',
        '[name="阿米娅"]  博士，醒醒。',
        '[Decision(options="早就该交给我了！;......")]',
      ].join('\n')
    )

    await buildStaticDataService.build({
      locale: 'zh_CN',
      inputDir,
      outputDir,
      generatedAt: new Date('2026-05-10T16:00:00.000Z'),
      timelineRulesInput: {
        overridesFilePath: overridesPath,
      },
    })

    const chapter = await readJson<{
      blocks: Array<{ type: string; speaker?: string; text?: string; options?: string[] }>
      contentSource?: { page: string; url: string }
    }>(join(outputDir, 'zh_CN/chapters/main_0--obt__main__level_main_00-01_beg.json'))

    expect(chapter.blocks).toEqual([])
    expect(chapter.contentSource).toMatchObject({
      page: '0-1_坍塌/BEG',
      url: 'https://prts.wiki/w/0-1_%E5%9D%8D%E5%A1%8C/BEG',
    })
  })

  it('does not block metadata builds when local story text is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ark-static-build-'))
    tempDirs.push(root)

    const inputDir = join(root, 'input')
    const outputDir = join(root, 'public-data')
    const overridesPath = join(root, 'storyline-overrides.json')

    await writeJson(join(inputDir, 'sync-report.json'), {
      providerId: 'github-raw',
      revision: 'rev-test-missing-story',
    })

    await writeJson(join(inputDir, 'gamedata/excel/story_review_table.json'), {
      storyReviewTable: {
        act_missing_story: {
          albumKind: 'ACTIVITY',
          name: '缺失正文测试',
          startTime: 100,
          infoUnlockDatas: [
            {
              storyCode: 'MS-1',
              storyName: '不存在的章节',
              storyInfo: '测试章节摘要',
              storyTxt: 'gamedata/story/activities/act_missing_story/level_missing_01.txt',
              avgTag: 'before',
              storySort: 1,
              requiredStages: [{ stageId: 'missing_01' }],
            },
          ],
        },
      },
    })

    await writeJson(join(inputDir, 'gamedata/excel/stage_table.json'), {
      storylineStorySets: {
        missing_story_set: {
          storySetId: 'act_missing_story',
          storySetType: 'SS',
          sortByYear: 2025,
          sortWithinYear: 1,
        },
      },
    })

    await writeJson(overridesPath, {
      version: 1,
      overrides: [],
    })

    const report = await buildStaticDataService.build({
      locale: 'zh_CN',
      inputDir,
      outputDir,
      generatedAt: new Date('2026-05-10T14:00:00.000Z'),
      timelineRulesInput: {
        overridesFilePath: overridesPath,
      },
    })

    expect(report.diagnostics.missingStorySources).toEqual([])
  })

  it('ignores allowMissingStoryText because runtime pages now provide chapter content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ark-static-build-'))
    tempDirs.push(root)

    const inputDir = join(root, 'input')
    const outputDir = join(root, 'public-data')
    const overridesPath = join(root, 'storyline-overrides.json')

    await writeJson(join(inputDir, 'sync-report.json'), {
      providerId: 'github-raw',
      revision: 'rev-test-allow-missing-story',
    })

    await writeJson(join(inputDir, 'gamedata/excel/story_review_table.json'), {
      storyReviewTable: {
        act_allow_missing_story: {
          albumKind: 'ACTIVITY',
          name: '缺失正文降级测试',
          startTime: 100,
          infoUnlockDatas: [
            {
              storyCode: 'AM-1',
              storyName: '缺失章节',
              storyInfo: '测试章节摘要',
              storyTxt: 'gamedata/story/activities/act_allow_missing_story/level_missing_01.txt',
              avgTag: 'before',
              storySort: 1,
              requiredStages: [{ stageId: 'allow_missing_01' }],
            },
          ],
        },
      },
    })

    await writeJson(join(inputDir, 'gamedata/excel/stage_table.json'), {
      storylineStorySets: {
        allow_missing_story_set: {
          storySetId: 'act_allow_missing_story',
          storySetType: 'SS',
          sortByYear: 2025,
          sortWithinYear: 2,
        },
      },
    })

    await writeJson(overridesPath, {
      version: 1,
      overrides: [],
    })

    const report = await buildStaticDataService.build({
      locale: 'zh_CN',
      inputDir,
      outputDir,
      allowMissingStoryText: true,
      generatedAt: new Date('2026-05-10T14:30:00.000Z'),
      timelineRulesInput: {
        overridesFilePath: overridesPath,
      },
    })

    expect(report.diagnostics.missingStorySources).toEqual([])

    const album = await readJson<{ chapters: Array<{ id: string }> }>(
      join(outputDir, 'zh_CN/albums/act_allow_missing_story.json')
    )

    const chapter = await readJson<{ blocks: unknown[] }>(
      join(outputDir, `zh_CN/chapters/${album.chapters[0]!.id}.json`)
    )

    expect(chapter.blocks).toEqual([])
  })

  it('selects cover by priority kvImageId > storyEntryPicId > backgroundId and writes stable assetPath/placeholder', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ark-static-build-'))
    tempDirs.push(root)

    const inputDir = join(root, 'input')
    const outputDir = join(root, 'public-data')
    const coversSourceDir = join(root, 'cover-source')
    const overridesPath = join(root, 'storyline-overrides.json')

    await writeJson(join(inputDir, 'sync-report.json'), {
      providerId: 'github-raw',
      revision: 'rev-test-cover-priority',
    })

    await writeJson(join(inputDir, 'gamedata/excel/story_review_table.json'), {
      storyReviewTable: {
        album_kv: {
          albumKind: 'ACTIVITY',
          name: 'KV 优先条目',
          storyEntryPicId: 'entry_cover_kv',
          infoUnlockDatas: [
            {
              storyCode: 'KV-1',
              storyName: '章节',
              storyTxt: 'gamedata/story/activities/album_kv/kv_1.txt',
              storySort: 1,
            },
          ],
        },
        album_entry: {
          albumKind: 'ACTIVITY',
          name: 'EntryPic 优先条目',
          storyEntryPicId: 'entry_cover_only',
          infoUnlockDatas: [
            {
              storyCode: 'EN-1',
              storyName: '章节',
              storyTxt: 'gamedata/story/activities/album_entry/en_1.txt',
              storySort: 1,
            },
          ],
        },
        album_background: {
          albumKind: 'ACTIVITY',
          name: '背景图回退条目',
          infoUnlockDatas: [
            {
              storyCode: 'BG-1',
              storyName: '章节',
              storyTxt: 'gamedata/story/activities/album_background/bg_1.txt',
              storySort: 1,
            },
          ],
        },
      },
    })

    await writeJson(join(inputDir, 'gamedata/excel/stage_table.json'), {
      storylineStorySets: {
        set_kv: {
          storySetId: 'album_kv',
          storySetType: 'SS',
          sortByYear: 2024,
          sortWithinYear: 1,
          kvImageId: 'kv_cover_main',
          backgroundId: 'bg_cover_main',
        },
        set_entry: {
          storySetId: 'album_entry',
          storySetType: 'SS',
          sortByYear: 2024,
          sortWithinYear: 2,
          backgroundId: 'bg_cover_entry',
        },
        set_bg: {
          storySetId: 'album_background',
          storySetType: 'SS',
          sortByYear: 2024,
          sortWithinYear: 3,
          backgroundId: 'bg_cover_only',
        },
      },
    })

    await writeJson(overridesPath, {
      version: 1,
      overrides: [],
    })

    await writeText(
      join(inputDir, 'gamedata/story/activities/album_kv/kv_1.txt'),
      '[name="A"]\nKV\n'
    )
    await writeText(
      join(inputDir, 'gamedata/story/activities/album_entry/en_1.txt'),
      '[name="A"]\nENTRY\n'
    )
    await writeText(
      join(inputDir, 'gamedata/story/activities/album_background/bg_1.txt'),
      '[name="A"]\nBG\n'
    )

    await mkdir(coversSourceDir, { recursive: true })
    await writeFile(join(coversSourceDir, 'kv_cover_main.png'), TEST_IMAGE_1X1)
    await writeFile(join(coversSourceDir, 'entry_cover_only.png'), TEST_IMAGE_1X1)

    await buildStaticDataService.build({
      locale: 'zh_CN',
      inputDir,
      outputDir,
      generatedAt: new Date('2026-05-10T16:30:00.000Z'),
      assetSourceProvider: new LocalAssetSourceProvider({
        roots: [coversSourceDir],
        extensions: ['.png'],
      }),
      timelineRulesInput: {
        overridesFilePath: overridesPath,
      },
    })

    const catalog = await readJson<{
      albums: Array<{
        id: string
        cover?: {
          primaryImageId?: string
          source: string
          assetPath?: string
          assetStatus: string
          width?: number
          height?: number
        }
      }>
    }>(join(outputDir, 'zh_CN/catalog.json'))

    const albumKv = catalog.albums.find((album) => album.id === 'album_kv')
    const albumEntry = catalog.albums.find((album) => album.id === 'album_entry')
    const albumBackground = catalog.albums.find((album) => album.id === 'album_background')

    expect(albumKv?.cover?.primaryImageId).toBe('kv_cover_main')
    expect(albumKv?.cover?.source).toBe('stage-kv')
    expect(albumKv?.cover?.assetStatus).toBe('ready')
    expect(albumKv?.cover?.assetPath).toBe('/assets/covers/zh_CN/album_kv-cover.webp')
    expect(albumKv?.cover?.width).toBe(1)
    expect(albumKv?.cover?.height).toBe(1)

    expect(albumEntry?.cover?.primaryImageId).toBe('entry_cover_only')
    expect(albumEntry?.cover?.source).toBe('review-entry-pic')
    expect(albumEntry?.cover?.assetStatus).toBe('ready')
    expect(albumEntry?.cover?.assetPath).toBe('/assets/covers/zh_CN/album_entry-cover.webp')
    expect(albumEntry?.cover?.width).toBe(1)
    expect(albumEntry?.cover?.height).toBe(1)

    expect(albumBackground?.cover?.primaryImageId).toBe('bg_cover_only')
    expect(albumBackground?.cover?.source).toBe('stage-background')
    expect(albumBackground?.cover?.assetStatus).toBe('missing')
    expect(albumBackground?.cover?.assetPath).toBe('/assets/covers/zh_CN/placeholder.svg')

    const copiedKvCover = await readFile(join(root, 'assets/covers/zh_CN/album_kv-cover.webp'))
    expect(copiedKvCover.subarray(0, 4).toString('ascii')).toBe('RIFF')

    const placeholder = await readFile(join(root, 'assets/covers/zh_CN/placeholder.svg'), 'utf8')
    expect(placeholder).toContain('Cover Unavailable')
  })
})

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeText(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

async function writeText(filePath: string, value: string): Promise<void> {
  const directory = filePath.slice(0, filePath.lastIndexOf('/'))
  await mkdir(directory, { recursive: true })
  await writeFile(filePath, value, 'utf8')
}

async function readJson<T>(filePath: string): Promise<T> {
  const text = await readFile(filePath, 'utf8')
  return JSON.parse(text) as T
}
