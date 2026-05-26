import { describe, expect, it, vi } from 'vitest'
import { MemoryStoryRepository } from '../../infrastructure/storage/memory-story-repository'
import { SearchService } from './search-service'

describe('SearchService', () => {
  it('supports strict query and route mapping for album/chapter/stage results', async () => {
    const repository = new MemoryStoryRepository()
    repository.seed('zh_CN', {
      manifest: {
        schemaVersion: 1,
        locale: 'zh_CN',
        generatedAt: '2026-05-10T00:00:00.000Z',
        source: { providerId: 'fixture', commitSha: 'rev-search' },
        files: {},
      },
      catalog: { albums: [] },
      timeline: { items: [] },
      searchIndex: {
        generatedAt: '2026-05-10T00:00:00.000Z',
        locale: 'zh_CN',
        entries: [
          {
            id: 'album:s1',
            kind: 'album',
            displayTitle: '黑暗时代',
            displaySecondary: 's1',
            albumId: 's1',
            albumTitle: '黑暗时代',
            type: 'intermezzi',
            match: {
              title: '黑暗时代',
              albumTitle: '黑暗时代',
              aliases: ['黑暗时代'],
              tokens: ['黑暗时代'],
              exactIds: ['s1'],
            },
            target: { route: 'album', albumId: 's1' },
          },
          {
            id: 'chapter:c1',
            kind: 'chapter',
            displayTitle: 'ST-1 黑暗时代·上',
            displaySecondary: '黑暗时代',
            albumId: 's1',
            albumTitle: '黑暗时代',
            chapterId: 'c1',
            chapterTitle: '黑暗时代·上',
            stageCode: 'ST-1',
            type: 'intermezzi',
            match: {
              title: 'ST-1 黑暗时代·上',
              albumTitle: '黑暗时代',
              chapterTitle: '黑暗时代·上',
              stageCode: 'ST-1',
              aliases: ['黑暗时代 上', 'ST-1', 'c1'],
              tokens: ['黑暗时代', 'ST', '1', 'c1'],
              exactIds: ['c1', 'ST-1'],
            },
            target: { route: 'chapter', albumId: 's1', chapterId: 'c1' },
          },
          {
            id: 'stage:c1:main_01-07',
            kind: 'stage',
            displayTitle: '1-7 黑暗时代·上',
            displaySecondary: '黑暗时代 · main_01-07',
            albumId: 's1',
            albumTitle: '黑暗时代',
            chapterId: 'c1',
            chapterTitle: '黑暗时代·上',
            stageId: 'main_01-07',
            stageCode: '1-7',
            type: 'intermezzi',
            match: {
              title: '1-7 黑暗时代·上',
              albumTitle: '黑暗时代',
              chapterTitle: '黑暗时代·上',
              stageId: 'main_01-07',
              stageCode: '1-7',
              aliases: ['main_01-07', '1-7'],
              tokens: ['main_01-07', '1-7'],
              exactIds: ['main_01-07', 'c1', '1-7'],
            },
            target: { route: 'chapter', albumId: 's1', chapterId: 'c1' },
          },
        ],
      },
      albumsById: {},
      chaptersById: {},
    })

    const service = new SearchService(repository)

    const resultsByName = await service.search('zh_CN', '黑暗时代')
    expect(resultsByName.length).toBeGreaterThan(0)
    expect(resultsByName.some((item) => item.targetPath === '/zh_CN/albums/s1')).toBe(true)
    expect(resultsByName.some((item) => item.targetPath === '/zh_CN/read/s1/c1')).toBe(true)

    const resultsByStageCode = await service.search('zh_CN', 'ST-1')
    expect(resultsByStageCode.some((item) => item.kind === 'chapter')).toBe(true)
    expect(await service.search('zh_CN', 'main_01-07')).toHaveLength(0)
    expect(await service.search('zh_CN', '110')).toHaveLength(0)
    expect(await service.search('zh_CN', '12345')).toHaveLength(0)

    const filtered = await service.search('zh_CN', '黑暗时代', { type: 'intermezzi' })
    expect(filtered.length).toBeGreaterThan(0)

    const residual = await service.search('zh_CN', '黑暗时代上')
    expect(residual).toHaveLength(0)
  })

  it('does not return residual fuzzy matches for partial short queries', async () => {
    const repository = new MemoryStoryRepository()
    repository.seed('zh_CN', {
      manifest: {
        schemaVersion: 1,
        locale: 'zh_CN',
        generatedAt: '2026-05-10T00:00:00.000Z',
        source: { providerId: 'fixture', commitSha: 'rev-search-2' },
        files: {},
      },
      catalog: { albums: [] },
      timeline: { items: [] },
      searchIndex: {
        generatedAt: '2026-05-10T00:00:00.000Z',
        locale: 'zh_CN',
        entries: [
          {
            id: 'album:s2',
            kind: 'album',
            displayTitle: '风暴前夜',
            displaySecondary: 's2',
            albumId: 's2',
            albumTitle: '风暴前夜',
            type: 'mainline',
            match: {
              title: '风暴前夜',
              albumTitle: '风暴前夜',
              aliases: ['前夜 风暴'],
              tokens: ['前夜', '风暴'],
              exactIds: ['s2'],
            },
            target: { route: 'album', albumId: 's2' },
          },
        ],
      },
      albumsById: {},
      chaptersById: {},
    })

    const service = new SearchService(repository)

    expect((await service.search('zh_CN', '风暴前')).length).toBeGreaterThan(0)
    expect(await service.search('zh_CN', '黑夜')).toHaveLength(0)
  })

  it('uses readable display title and excludes internal id routing matches', async () => {
    const repository = new MemoryStoryRepository()
    repository.seed('zh_CN', {
      manifest: {
        schemaVersion: 1,
        locale: 'zh_CN',
        generatedAt: '2026-05-10T00:00:00.000Z',
        source: { providerId: 'fixture', commitSha: 'rev-search-3' },
        files: {},
      },
      catalog: { albums: [] },
      timeline: { items: [] },
      searchIndex: {
        generatedAt: '2026-05-10T00:00:00.000Z',
        locale: 'zh_CN',
        entries: [
          {
            id: 'chapter:act9d0_01',
            kind: 'chapter',
            displayTitle: 'OF-ST1 生于黑夜',
            displaySecondary: '生于黑夜',
            albumId: 'act9d0',
            albumTitle: '生于黑夜',
            chapterId: 'act9d0_01',
            chapterTitle: '生于黑夜',
            stageCode: 'OF-ST1',
            type: 'intermezzi',
            match: {
              title: 'OF-ST1 生于黑夜',
              albumTitle: '生于黑夜',
              chapterTitle: '生于黑夜',
              stageCode: 'OF-ST1',
              aliases: ['生于黑夜', 'OF-ST1', 'act9d0_01'],
              tokens: ['生于黑夜', 'OF-ST1', 'act9d0_01'],
              exactIds: ['act9d0_01', 'OF-ST1'],
            },
            target: { route: 'chapter', albumId: 'act9d0', chapterId: 'act9d0_01' },
          },
          {
            id: 'stage:act9d0_01:act9d0_01',
            kind: 'stage',
            displayTitle: 'OF-ST1 生于黑夜',
            displaySecondary: '生于黑夜 · act9d0_01',
            albumId: 'act9d0',
            albumTitle: '生于黑夜',
            chapterId: 'act9d0_01',
            chapterTitle: '生于黑夜',
            stageId: 'act9d0_01',
            stageCode: 'OF-ST1',
            type: 'intermezzi',
            match: {
              title: 'OF-ST1 生于黑夜',
              albumTitle: '生于黑夜',
              chapterTitle: '生于黑夜',
              stageId: 'act9d0_01',
              stageCode: 'OF-ST1',
              aliases: ['生于黑夜', 'OF-ST1', 'act9d0_01'],
              tokens: ['生于黑夜', 'OF-ST1', 'act9d0_01'],
              exactIds: ['act9d0_01', 'OF-ST1'],
            },
            target: { route: 'chapter', albumId: 'act9d0', chapterId: 'act9d0_01' },
          },
        ],
      },
      albumsById: {},
      chaptersById: {},
    })

    const service = new SearchService(repository)
    const readableResults = await service.search('zh_CN', '生于黑夜')
    expect(readableResults.length).toBeGreaterThan(0)
    expect(readableResults.some((item) => item.title === 'act9d0_01')).toBe(false)
    expect(readableResults.some((item) => item.title === 'OF-ST1 生于黑夜')).toBe(true)

    const byVisibleCode = await service.search('zh_CN', 'OF-ST1')
    expect(byVisibleCode.some((item) => item.targetPath === '/zh_CN/read/act9d0/act9d0_01')).toBe(
      true
    )

    expect(await service.search('zh_CN', 'act9d0_01')).toHaveLength(0)
  })

  it('indexes operator names without fetching all operator detail payloads', async () => {
    const repository = new MemoryStoryRepository()
    repository.seed('zh_CN', {
      manifest: {
        schemaVersion: 1,
        locale: 'zh_CN',
        generatedAt: '2026-05-10T00:00:00.000Z',
        source: { providerId: 'fixture', commitSha: 'rev-search-operator' },
        files: {},
      },
      catalog: { albums: [] },
      timeline: { items: [] },
      searchIndex: {
        generatedAt: '2026-05-10T00:00:00.000Z',
        locale: 'zh_CN',
        entries: [],
      },
      albumsById: {},
      chaptersById: {},
      operatorIndex: {
        generatedAt: '2026-05-10T00:00:00.000Z',
        operators: [
          {
            name: '可露希尔',
            slug: 'operator-closure',
            page: '可露希尔',
            profession: '辅助',
            faction: '罗德岛',
          },
          {
            name: '电弧',
            slug: 'operator-dianhu',
            page: '电弧',
            profession: '术师',
            faction: '罗德岛',
          },
          {
            name: '逻各斯',
            slug: 'operator-logos',
            page: '逻各斯',
            profession: '术师',
            faction: '巴别塔',
          },
        ],
      },
      operatorModulesBySlug: {
        'operator-closure': {
          operatorId: 'operator-closure',
          operatorName: '可露希尔',
          modules: [
            {
              id: 'module-a',
              slug: 'module-a',
              name: '给自己的小奖杯',
              type: '模组',
              fields: { 名称: '给自己的小奖杯' },
            },
          ],
        },
      },
      operatorConfidentialBySlug: {
        'operator-closure': {
          operatorId: 'operator-closure',
          operatorName: '可露希尔',
          records: [
            {
              id: 'record-a',
              slug: 'record-a',
              title: '购物清单',
            },
          ],
        },
      },
    })

    const getOperatorModulesSpy = vi.spyOn(repository, 'getOperatorModules')
    const getOperatorConfidentialSpy = vi.spyOn(repository, 'getOperatorConfidential')
    const service = new SearchService(repository)

    const operatorResults = await service.search('zh_CN', '可露希尔')
    expect(operatorResults).toHaveLength(1)
    expect(operatorResults[0]).toMatchObject({
      kind: 'operator',
      targetPath: '/zh_CN/operators/operator-closure',
    })

    const initialResults = await service.search('zh_CN', 'dh')
    expect(initialResults[0]).toMatchObject({
      kind: 'operator',
      title: '电弧',
      targetPath: '/zh_CN/operators/operator-dianhu',
    })

    const pinyinEquivalentResults = await service.search('zh_CN', '罗各斯')
    expect(pinyinEquivalentResults[0]).toMatchObject({
      kind: 'operator',
      title: '逻各斯',
      targetPath: '/zh_CN/operators/operator-logos',
    })

    expect(await service.search('zh_CN', '给自己的小奖杯')).toHaveLength(0)
    expect(await service.search('zh_CN', '购物清单')).toHaveLength(0)
    expect(getOperatorModulesSpy).not.toHaveBeenCalled()
    expect(getOperatorConfidentialSpy).not.toHaveBeenCalled()
  })
})
