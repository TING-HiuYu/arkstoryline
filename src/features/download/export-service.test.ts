import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { MemoryStoryRepository } from '../../infrastructure/storage/memory-story-repository'
import { ExportService } from './export-service'

describe('ExportService', () => {
  function createRepository(): MemoryStoryRepository {
    const repository = new MemoryStoryRepository()

    repository.seed('zh_CN', {
      manifest: {
        schemaVersion: 1,
        locale: 'zh_CN',
        generatedAt: '2026-05-10T00:00:00.000Z',
        source: {
          providerId: 'fixture',
          commitSha: 'rev-zip',
        },
        files: {},
      },
      catalog: {
        albums: [
          { id: 'album_a', title: '曲谱A', slug: 'album-a' },
          { id: 'album_b', title: '曲谱B', slug: 'album-b' },
        ],
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
        album_b: {
          id: 'album_b',
          title: '曲谱B',
          albumKind: 'intermezzi',
          chapters: [{ id: 'chapter_2', title: '第二章', code: '2-1' }],
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
            { type: 'narration', id: 'b1', text: 'A内容' },
            {
              type: 'dialogue',
              id: 'b1-nickname',
              speaker: 'Dr.{@nickname}',
              text: '{@nickname}，醒醒。',
            },
          ],
          citations: [],
        },
        chapter_2: {
          id: 'chapter_2',
          albumId: 'album_b',
          title: '第二章',
          code: '2-1',
          navigation: { previousChapterId: null, nextChapterId: null },
          blocks: [{ type: 'narration', id: 'b2', text: 'B内容' }],
          citations: [],
        },
      },
    })

    return repository
  }

  it('exports txt in single-file mode', async () => {
    const service = new ExportService(createRepository())

    const artifacts = await service.export('txt', {
      locale: 'zh_CN',
      fileMode: 'single',
      items: [
        { albumId: 'album_a', chapterIds: ['chapter_1'] },
        { albumId: 'album_b', chapterIds: ['chapter_2'] },
      ],
    })

    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]?.fileName.endsWith('.txt')).toBe(true)
    const text = new TextDecoder().decode(artifacts[0]?.data)
    expect(text).toContain('曲谱A')
    expect(text).toContain('A内容')
    expect(text).toContain('B内容')
  })

  it('uses persisted doctor name in exported text', async () => {
    const service = new ExportService(createRepository())

    const artifacts = await service.export('txt', {
      locale: 'zh_CN',
      fileMode: 'single',
      doctorName: '凯尔希',
      items: [{ albumId: 'album_a', chapterIds: ['chapter_1'] }],
    })

    const text = new TextDecoder().decode(artifacts[0]?.data)
    expect(text).toContain('Dr.凯尔希：凯尔希，醒醒。')
    expect(text).not.toContain('{@nickname}')
  })

  it('exports txt per album and packages into zip', async () => {
    const service = new ExportService(createRepository())

    const artifacts = await service.export('txt', {
      locale: 'zh_CN',
      fileMode: 'perAlbumZip',
      items: [
        { albumId: 'album_a', chapterIds: ['chapter_1'] },
        { albumId: 'album_b', chapterIds: ['chapter_2'] },
      ],
    })

    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]?.mimeType).toBe('application/zip')

    const zip = await JSZip.loadAsync(artifacts[0]!.data)
    const fileNames = Object.keys(zip.files).sort((left, right) => left.localeCompare(right))
    expect(fileNames).toEqual(['曲谱A.txt', '曲谱B.txt'])
  })

  it('reports chapter-level export progress', async () => {
    const service = new ExportService(createRepository())
    const progress: Array<{ completedChapters: number; totalChapters: number }> = []

    await service.export(
      'txt',
      {
        locale: 'zh_CN',
        fileMode: 'single',
        items: [
          { albumId: 'album_a', chapterIds: ['chapter_1'] },
          { albumId: 'album_b', chapterIds: ['chapter_2'] },
        ],
      },
      {
        onProgress: (nextProgress) => progress.push(nextProgress),
      }
    )

    expect(progress).toEqual([
      { completedChapters: 1, totalChapters: 2 },
      { completedChapters: 2, totalChapters: 2 },
    ])
  })

  it('exports epub and writes revision/generation metadata', async () => {
    const service = new ExportService(createRepository())

    const artifacts = await service.export('epub', {
      locale: 'zh_CN',
      fileMode: 'single',
      items: [{ albumId: 'album_a', chapterIds: ['chapter_1'] }],
    })

    const epubZip = await JSZip.loadAsync(artifacts[0]!.data)
    const opf = await epubZip.file('OEBPS/content.opf')!.async('text')

    expect(opf).toContain('sourceRevision=rev-zip')
    expect(opf).toContain('generatedAt=')
  })
})
