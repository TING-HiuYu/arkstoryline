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
            { id: 'chapter_1', title: '第一章', code: '1-1' },
            { id: 'chapter_2', title: '第二章', code: '1-2' },
          ],
        },
      },
      chaptersById: {
        chapter_1: {
          id: 'chapter_1',
          albumId: 'album_a',
          title: '第一章',
          code: '1-1',
          navigation: { previousChapterId: null, nextChapterId: 'chapter_2' },
          blocks: [{ type: 'dialogue', id: 'b1', speaker: '阿米娅', text: '你好。' }],
          citations: [],
        },
        chapter_2: {
          id: 'chapter_2',
          albumId: 'album_a',
          title: '第二章',
          code: '1-2',
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
