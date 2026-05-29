import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
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
      operatorIndex: {
        generatedAt: '2026-05-10T00:00:00.000Z',
        operators: [{ name: '可露希尔', slug: 'opr-a' }],
      },
      operatorArchiveBySlug: {
        'opr-a': {
          operatorId: 'opr-a',
          name: '可露希尔',
          profile: {
            基础档案: '【代号】可露希尔',
          },
        },
      },
      operatorModulesBySlug: {
        'opr-a': {
          operatorId: 'opr-a',
          modules: [],
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

  it('reports chapter-level export progress before file generation starts', async () => {
    const service = new ExportService(createRepository())
    const progress: Array<{
      completedChapters: number
      totalChapters: number
      phase: 'fetching' | 'generating'
    }> = []

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
      { completedChapters: 1, totalChapters: 2, phase: 'fetching' },
      { completedChapters: 2, totalChapters: 2, phase: 'fetching' },
      { completedChapters: 2, totalChapters: 2, phase: 'generating' },
    ])
  })

  it('keeps operator exports on the main thread even when the worker threshold is reached', async () => {
    const workerFactory = vi.fn(() => {
      throw new Error('worker should not start for operator exports')
    })
    vi.stubGlobal('Worker', class TestWorker {})

    const service = new ExportService(createRepository(), {
      workerThreshold: 1,
      workerFactory: workerFactory as unknown as () => Worker,
    })

    const artifacts = await service.export('txt', {
      locale: 'zh_CN',
      fileMode: 'single',
      items: [{ albumId: 'opr-a', kind: 'operator', chapterIds: ['opr-a:archive'] }],
    })

    expect(workerFactory).not.toHaveBeenCalled()
    expect(new TextDecoder().decode(artifacts[0]?.data)).toContain('可露希尔')

    vi.unstubAllGlobals()
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
