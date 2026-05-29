import { describe, expect, it } from 'vitest'
import { buildExportDocument } from './build-export-document'
import { MemoryStoryRepository } from '../../infrastructure/storage/memory-story-repository'

describe('buildExportDocument', () => {
  it('builds export document with stable album/chapter order and source revision', async () => {
    const repository = new MemoryStoryRepository()

    repository.seed('zh_CN', {
      manifest: {
        schemaVersion: 1,
        locale: 'zh_CN',
        generatedAt: '2026-05-10T00:00:00.000Z',
        source: {
          providerId: 'fixture',
          commitSha: 'rev-123',
        },
        files: {},
      },
      catalog: {
        albums: [{ id: 'album_a', title: '曲谱A', slug: 'album-a' }],
      },
      timeline: {
        items: [],
      },
      searchIndex: {
        generatedAt: '2026-05-10T00:00:00.000Z',
        locale: 'zh_CN',
        entries: [],
      },
      albumsById: {
        album_a: {
          id: 'album_a',
          title: '曲谱A',
          albumKind: 'mainline',
          chapters: [
            { id: 'chapter_1', title: '第一章', code: '1-1', avgTag: '行动前' },
            { id: 'chapter_2', title: '第二章', code: '1-2', avgTag: '行动后' },
          ],
        },
      },
      chaptersById: {
        chapter_1: {
          id: 'chapter_1',
          albumId: 'album_a',
          title: '第一章',
          code: '1-1',
          avgTag: '行动前',
          navigation: { previousChapterId: null, nextChapterId: 'chapter_2' },
          blocks: [{ type: 'dialogue', id: 'b1', speaker: '阿米娅', text: '你好。' }],
          citations: [],
        },
        chapter_2: {
          id: 'chapter_2',
          albumId: 'album_a',
          title: '第二章',
          code: '1-2',
          avgTag: '行动后',
          navigation: { previousChapterId: 'chapter_1', nextChapterId: null },
          blocks: [{ type: 'narration', id: 'b2', text: '结束。' }],
          citations: [],
        },
      },
    })

    const document = await buildExportDocument(repository, {
      locale: 'zh_CN',
      fileMode: 'single',
      items: [{ albumId: 'album_a', chapterIds: ['chapter_2', 'chapter_1'] }],
    })

    expect(document.sourceRevision).toBe('rev-123')
    expect(document.albums).toHaveLength(1)
    expect(document.chapters.map((chapter) => chapter.chapterId)).toEqual([
      'chapter_1',
      'chapter_2',
    ])
    expect(document.chapters.map((chapter) => chapter.chapterTitle)).toEqual([
      '第一章（前）',
      '第二章（后）',
    ])
    expect(document.chapters[0]?.content).toContain('阿米娅：你好。')
    expect(document.chapters[0]?.txtContent).toContain('阿米娅：你好。')
  })

  it('exports only the first choice branch and formats choice text for txt/pdf/epub pipelines', async () => {
    const repository = new MemoryStoryRepository()

    repository.seed('zh_CN', {
      manifest: {
        schemaVersion: 1,
        locale: 'zh_CN',
        generatedAt: '2026-05-10T00:00:00.000Z',
        source: {
          providerId: 'fixture',
          commitSha: 'rev-choice',
        },
        files: {},
      },
      catalog: {
        albums: [{ id: 'album_a', title: '曲谱A', slug: 'album-a' }],
      },
      timeline: {
        items: [],
      },
      searchIndex: {
        generatedAt: '2026-05-10T00:00:00.000Z',
        locale: 'zh_CN',
        entries: [],
      },
      albumsById: {
        album_a: {
          id: 'album_a',
          title: '曲谱A',
          albumKind: 'mainline',
          chapters: [{ id: 'chapter_1', title: '第一章', code: '1-1' }],
        },
      },
      chaptersById: {
        chapter_1: {
          id: 'chapter_1',
          albumId: 'album_a',
          title: '第一章',
          code: '1-1',
          navigation: { previousChapterId: null, nextChapterId: null },
          blocks: [
            {
              type: 'choice',
              id: 'choice-1',
              options: ['选第一个', '选第二个'],
              values: ['1', '2'],
              branches: [
                {
                  id: 'choice-1-branch-1',
                  predicate: '1',
                  references: ['1'],
                  blocks: [{ type: 'narration', id: 'n1', text: '第一分支正文。' }],
                },
                {
                  id: 'choice-1-branch-2',
                  predicate: '2',
                  references: ['2'],
                  blocks: [{ type: 'narration', id: 'n2', text: '第二分支正文。' }],
                },
              ],
            },
          ],
          citations: [],
        },
      },
    })

    const document = await buildExportDocument(repository, {
      locale: 'zh_CN',
      fileMode: 'single',
      items: [{ albumId: 'album_a', chapterIds: ['chapter_1'] }],
    })

    expect(document.chapters[0]?.txtContent).toContain('我: 选第一个')
    expect(document.chapters[0]?.txtContent).toContain('第一分支正文。')
    expect(document.chapters[0]?.txtContent).not.toContain('第二分支正文。')
    expect(document.chapters[0]?.lines[0]).toEqual({ text: '选第一个', style: 'choiceSelected' })
  })

  it('normalizes chapter-relative image paths for epub packaging', async () => {
    const repository = new MemoryStoryRepository()

    repository.seed('zh_CN', {
      manifest: {
        schemaVersion: 1,
        locale: 'zh_CN',
        generatedAt: '2026-05-10T00:00:00.000Z',
        source: {
          providerId: 'fixture',
          commitSha: 'rev-image',
        },
        files: {},
      },
      catalog: {
        albums: [{ id: 'album_a', title: '曲谱A', slug: 'album-a' }],
      },
      timeline: {
        items: [],
      },
      searchIndex: {
        generatedAt: '2026-05-10T00:00:00.000Z',
        locale: 'zh_CN',
        entries: [],
      },
      albumsById: {
        album_a: {
          id: 'album_a',
          title: '曲谱A',
          albumKind: 'mainline',
          chapters: [{ id: 'chapter_1', title: '第一章', code: '1-1' }],
        },
      },
      chaptersById: {
        chapter_1: {
          id: 'chapter_1',
          albumId: 'album_a',
          title: '第一章',
          code: '1-1',
          navigation: { previousChapterId: null, nextChapterId: null },
          blocks: [
            {
              type: 'backgroundCue',
              id: 'bg-1',
              assetStatus: 'ready',
              localPath: 'assets/chapter_1/background-test.png',
            },
          ],
          citations: [],
        },
      },
    })

    const document = await buildExportDocument(repository, {
      locale: 'zh_CN',
      fileMode: 'single',
      items: [{ albumId: 'album_a', chapterIds: ['chapter_1'] }],
    })

    expect(document.chapters[0]?.images?.[0]?.sourcePath).toBe(
      '/data/zh_CN/chapters/assets/chapter_1/background-test.png'
    )
  })

  it('loads runtime wiki content when static chapter blocks are empty', async () => {
    const repository = new MemoryStoryRepository()

    repository.seed('zh_CN', {
      manifest: {
        schemaVersion: 1,
        locale: 'zh_CN',
        generatedAt: '2026-05-10T00:00:00.000Z',
        source: {
          providerId: 'fixture',
          commitSha: 'rev-runtime',
        },
        files: {},
      },
      catalog: {
        albums: [{ id: 'album_a', title: '曲谱A', slug: 'album-a' }],
      },
      timeline: {
        items: [],
      },
      searchIndex: {
        generatedAt: '2026-05-10T00:00:00.000Z',
        locale: 'zh_CN',
        entries: [],
      },
      albumsById: {
        album_a: {
          id: 'album_a',
          title: '曲谱A',
          albumKind: 'mainline',
          chapters: [{ id: 'chapter_1', title: '第一章', code: '1-1' }],
        },
      },
      chaptersById: {
        chapter_1: {
          id: 'chapter_1',
          albumId: 'album_a',
          title: '第一章',
          code: '1-1',
          navigation: { previousChapterId: null, nextChapterId: null },
          blocks: [],
          contentSource: {
            provider: 'prts-wiki',
            url: 'https://prts.wiki/w/1-1_%E5%AD%A4%E5%B2%9B/BEG',
          },
          citations: [],
        },
      },
    })

    const document = await buildExportDocument(
      repository,
      {
        locale: 'zh_CN',
        fileMode: 'single',
        items: [{ albumId: 'album_a', chapterIds: ['chapter_1'] }],
      },
      {
        runtimeStoryLoader: async (contentUrl) => ({
          page: contentUrl,
          sourceUrl: contentUrl,
          title: '第一章',
          textlog: '',
          resources: {},
          blocks: [
            { type: 'dialogue', id: 'runtime-1', speaker: '阿米娅', text: '博士，醒一醒。' },
            {
              type: 'image',
              id: 'runtime-bg-1',
              sourceId: 'bg_test',
              role: 'background',
              url: 'https://media.prts.wiki/example.png',
            },
          ],
        }),
      }
    )

    expect(document.chapters[0]?.txtContent).toContain('阿米娅：博士，醒一醒。')
    expect(document.chapters[0]?.images?.[0]?.sourcePath).toBe(
      'https://media.prts.wiki/example.png'
    )
  })

  it('exports operator archive, module basics, and confidential records', async () => {
    const repository = new MemoryStoryRepository()

    repository.seed('zh_CN', {
      manifest: {
        schemaVersion: 1,
        locale: 'zh_CN',
        generatedAt: '2026-05-10T00:00:00.000Z',
        source: { providerId: 'fixture', commitSha: 'rev-operator' },
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
        operators: [{ name: '可露希尔', slug: 'opr-a' }],
      },
      operatorArchiveBySlug: {
        'opr-a': {
          operatorId: 'opr-a',
          name: '可露希尔',
          profile: {
            基础档案:
              '【代号】可露希尔\n【职业】老板\n【矿石病感染情况】参照医学检测报告，确认为非感染者。',
          },
        },
      },
      operatorModulesBySlug: {
        'opr-a': {
          operatorId: 'opr-a',
          operatorName: '可露希尔',
          modules: [
            {
              id: 'mod-a',
              slug: 'mod-a',
              name: '给自己的小奖杯',
              type: 'special',
              fields: {
                基础信息: '罗德岛采购中心特别纪念品。',
                其他信息: '不应出现在基础导出里。',
              },
            },
          ],
        },
      },
      operatorConfidentialBySlug: {
        'opr-a': {
          operatorId: 'opr-a',
          operatorName: '可露希尔',
          records: [
            {
              id: 'sec-a',
              slug: 'sec-a',
              title: '购物清单',
              contentSource: {
                provider: 'prts',
                url: 'https://prts.wiki/w/购物清单',
                page: '购物清单',
                kind: 'scenario-html',
              },
            },
          ],
        },
      },
    })

    const progress: Array<{ completedChapters: number; totalChapters: number }> = []
    const document = await buildExportDocument(
      repository,
      {
        locale: 'zh_CN',
        fileMode: 'single',
        doctorName: '博士',
        items: [
          {
            albumId: 'opr-a',
            kind: 'operator',
            chapterIds: ['opr-a:archive', 'opr-a:module:mod-a', 'opr-a:confidential:sec-a'],
          },
        ],
      },
      {
        onChapterExported: (nextProgress) => progress.push(nextProgress),
        runtimeStoryLoader: async (contentUrl) => ({
          page: contentUrl,
          sourceUrl: contentUrl,
          title: '购物清单',
          textlog: '',
          resources: {},
          blocks: [
            {
              type: 'dialogue',
              id: 'confidential-1',
              speaker: '可露希尔',
              text: '博士，采购单已经更新好了。',
            },
          ],
        }),
      }
    )

    expect(document.albums[0]?.albumTitle).toBe('可露希尔')
    expect(document.chapters.map((chapter) => chapter.chapterTitle)).toEqual([
      '档案',
      '模组 · 给自己的小奖杯',
      '秘录 · 购物清单',
    ])
    expect(document.chapters[0]?.txtContent).toContain('代号')
    expect(document.chapters[0]?.txtContent).toContain('可露希尔')
    expect(document.chapters[1]?.txtContent).toContain('罗德岛采购中心特别纪念品。')
    expect(document.chapters[1]?.txtContent).not.toContain('不应出现在基础导出里。')
    expect(document.chapters[2]?.txtContent).toContain('可露希尔：博士，采购单已经更新好了。')
    expect(progress).toEqual([
      { completedChapters: 1, totalChapters: 3 },
      { completedChapters: 2, totalChapters: 3 },
      { completedChapters: 3, totalChapters: 3 },
    ])
  })

  it('loads only the selected operator export buckets', async () => {
    class CountingRepository extends MemoryStoryRepository {
      public calls = { archive: 0, modules: 0, confidential: 0 }

      public override async getOperatorArchive(
        ...args: Parameters<MemoryStoryRepository['getOperatorArchive']>
      ) {
        this.calls.archive += 1
        return super.getOperatorArchive(...args)
      }

      public override async getOperatorModules(
        ...args: Parameters<MemoryStoryRepository['getOperatorModules']>
      ) {
        this.calls.modules += 1
        return super.getOperatorModules(...args)
      }

      public override async getOperatorConfidential(
        ...args: Parameters<MemoryStoryRepository['getOperatorConfidential']>
      ) {
        this.calls.confidential += 1
        return super.getOperatorConfidential(...args)
      }
    }

    const repository = new CountingRepository()

    repository.seed('zh_CN', {
      manifest: {
        schemaVersion: 1,
        locale: 'zh_CN',
        generatedAt: '2026-05-10T00:00:00.000Z',
        source: { providerId: 'fixture', commitSha: 'rev-operator-selective' },
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
        operators: [{ name: '可露希尔', slug: 'opr-a' }],
      },
      operatorArchiveBySlug: {
        'opr-a': {
          operatorId: 'opr-a',
          name: '可露希尔',
          profile: { 基础档案: '【代号】可露希尔' },
        },
      },
      operatorModulesBySlug: {
        'opr-a': {
          operatorId: 'opr-a',
          operatorName: '可露希尔',
          modules: [
            {
              id: 'mod-a',
              slug: 'mod-a',
              name: '给自己的小奖杯',
              type: 'special',
              fields: { 基础信息: '罗德岛采购中心特别纪念品。' },
            },
          ],
        },
      },
      operatorConfidentialBySlug: {
        'opr-a': {
          operatorId: 'opr-a',
          operatorName: '可露希尔',
          records: [],
        },
      },
    })

    const document = await buildExportDocument(repository, {
      locale: 'zh_CN',
      fileMode: 'single',
      items: [{ albumId: 'opr-a', kind: 'operator', chapterIds: ['opr-a:archive'] }],
    })

    expect(document.chapters).toHaveLength(1)
    expect(document.chapters[0]?.chapterTitle).toBe('档案')
    expect(repository.calls).toEqual({ archive: 1, modules: 0, confidential: 0 })
  })

  it('throws when selection asks a album to export an unknown chapter id', async () => {
    const repository = new MemoryStoryRepository()

    repository.seed('zh_CN', {
      manifest: {
        schemaVersion: 1,
        locale: 'zh_CN',
        generatedAt: '2026-05-10T00:00:00.000Z',
        source: { providerId: 'fixture', commitSha: 'rev-invalid' },
        files: {},
      },
      catalog: { albums: [{ id: 'album_a', title: '曲谱A', slug: 'album-a' }] },
      timeline: { items: [] },
      searchIndex: {
        generatedAt: '2026-05-10T00:00:00.000Z',
        locale: 'zh_CN',
        entries: [],
      },
      albumsById: {
        album_a: {
          id: 'album_a',
          title: '曲谱A',
          albumKind: 'mainline',
          chapters: [{ id: 'chapter_1', title: '第一章', code: '1-1' }],
        },
      },
      chaptersById: {
        chapter_1: {
          id: 'chapter_1',
          albumId: 'album_a',
          title: '第一章',
          code: '1-1',
          navigation: { previousChapterId: null, nextChapterId: null },
          blocks: [],
          citations: [],
        },
      },
    })

    await expect(
      buildExportDocument(repository, {
        locale: 'zh_CN',
        fileMode: 'single',
        items: [{ albumId: 'album_a', chapterIds: ['chapter_missing'] }],
      })
    ).rejects.toThrow(/不属于曲谱 album_a.*chapter_missing/)
  })

  it('throws when the loaded chapter belongs to a different album', async () => {
    const repository = new MemoryStoryRepository()

    repository.seed('zh_CN', {
      manifest: {
        schemaVersion: 1,
        locale: 'zh_CN',
        generatedAt: '2026-05-10T00:00:00.000Z',
        source: { providerId: 'fixture', commitSha: 'rev-mismatch' },
        files: {},
      },
      catalog: { albums: [{ id: 'album_a', title: '曲谱A', slug: 'album-a' }] },
      timeline: { items: [] },
      searchIndex: {
        generatedAt: '2026-05-10T00:00:00.000Z',
        locale: 'zh_CN',
        entries: [],
      },
      albumsById: {
        album_a: {
          id: 'album_a',
          title: '曲谱A',
          albumKind: 'mainline',
          chapters: [{ id: 'chapter_1', title: '第一章', code: '1-1' }],
        },
      },
      chaptersById: {
        chapter_1: {
          id: 'chapter_1',
          albumId: 'album_b',
          title: '第一章',
          code: '1-1',
          navigation: { previousChapterId: null, nextChapterId: null },
          blocks: [],
          citations: [],
        },
      },
    })

    await expect(
      buildExportDocument(repository, {
        locale: 'zh_CN',
        fileMode: 'single',
        items: [{ albumId: 'album_a', chapterIds: ['chapter_1'] }],
      })
    ).rejects.toThrow(/章节 chapter_1 属于曲谱 album_b/)
  })
})
