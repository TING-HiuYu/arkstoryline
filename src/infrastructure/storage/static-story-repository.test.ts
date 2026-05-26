import { describe, expect, it, vi } from 'vitest'
import { StaticStoryRepository } from './static-story-repository'

describe('StaticStoryRepository', () => {
  it('calls fetch with the global context for browser-native fetch support', async () => {
    const fetchImpl = vi.fn(async function () {
      return Response.json({
        schemaVersion: 1,
        locale: 'zh_CN',
        generatedAt: '2026-05-10T00:00:00.000Z',
        source: {
          providerId: 'fixture',
          commitSha: 'fixture-rev',
        },
        files: {},
      })
    }) as unknown as typeof fetch

    const repository = new StaticStoryRepository(fetchImpl)

    await repository.getManifest('zh_CN')

    expect(vi.mocked(fetchImpl).mock.contexts[0]).toBe(globalThis)
  })

  it('shares successful JSON fetch promises across repository instances', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        schemaVersion: 1,
        locale: 'zh_CN',
        generatedAt: '2026-05-10T00:00:00.000Z',
        source: {
          providerId: 'fixture',
          commitSha: 'fixture-rev',
        },
        files: {},
      })
    ) as unknown as typeof fetch
    const firstRepository = new StaticStoryRepository(fetchImpl)
    const secondRepository = new StaticStoryRepository(fetchImpl)

    await Promise.all([firstRepository.getManifest('zh_CN'), secondRepository.getManifest('zh_CN')])

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('does not cache failed JSON fetches', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('temporary failure', { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({
          schemaVersion: 1,
          locale: 'zh_CN',
          generatedAt: '2026-05-10T00:00:00.000Z',
          source: {
            providerId: 'fixture',
            commitSha: 'fixture-rev',
          },
          files: {},
        })
      ) as unknown as typeof fetch
    const repository = new StaticStoryRepository(fetchImpl)

    await expect(repository.getManifest('zh_CN')).rejects.toThrow(/503/)
    await expect(repository.getManifest('zh_CN')).resolves.toMatchObject({
      source: { commitSha: 'fixture-rev' },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('rejects unsafe album, chapter, and operator path inputs before fetching', async () => {
    const fetchImpl = vi.fn(async () => new Response('not found', { status: 404 }))
    const repository = new StaticStoryRepository(fetchImpl as unknown as typeof fetch)

    await expect(repository.getAlbum('zh_CN', '../secret')).rejects.toThrow(/Unsafe/)
    await expect(repository.getChapter('zh_CN', 'chapter%2Fsecret')).rejects.toThrow(/Unsafe/)
    await expect(repository.getOperatorArchive('operator/secret')).rejects.toThrow(/Unsafe/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns chapter shells without fetching runtime PRTS content', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)

      if (url.endsWith('/data/zh_CN/chapters/main_14-01.json')) {
        return Response.json({
          id: 'main_14-01',
          albumId: 'main_14',
          title: '慈悲灯塔',
          navigation: { previousChapterId: null, nextChapterId: null },
          blocks: [],
          citations: [],
          contentSource: {
            provider: 'prts',
            url: 'https://prts.wiki/w/14-1/BEG',
            page: '14-1/BEG',
            kind: 'scenario-html',
          },
        })
      }

      return new Response('not found', { status: 404 })
    }) as unknown as typeof fetch
    const repository = new StaticStoryRepository(fetchImpl)

    const chapter = await repository.getChapter('zh_CN', 'main_14-01')

    expect(chapter.contentSource?.url).toBe('https://prts.wiki/w/14-1/BEG')
    expect(chapter.blocks).toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
