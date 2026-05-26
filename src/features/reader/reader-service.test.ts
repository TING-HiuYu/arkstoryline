import { describe, expect, it, vi } from 'vitest'
import { ReaderService } from './reader-service'
import type {
  StaticChapterData,
  StaticAlbumData,
  StoryRepository,
} from '../../infrastructure/storage/static-story-repository'

function createRepository(params: {
  album: StaticAlbumData
  chapter: StaticChapterData
}): StoryRepository {
  return {
    getManifest: vi.fn(),
    getCatalog: vi.fn(),
    getTimeline: vi.fn(),
    getOperatorIndex: vi.fn(),
    getOperatorArchive: vi.fn(),
    getOperatorModules: vi.fn(),
    getOperatorConfidential: vi.fn(),
    getTerraHistoricusIndex: vi.fn(),
    getSearchIndex: vi.fn(),
    getKnowledgeRelatedIndex: vi.fn(),
    getAlbum: vi.fn(async () => params.album),
    getChapter: vi.fn(async () => params.chapter),
  } as unknown as StoryRepository
}

describe('ReaderService', () => {
  it('rejects a chapter id that is not listed in the requested album', async () => {
    const service = new ReaderService(
      createRepository({
        album: {
          id: 'album-a',
          title: 'Album A',
          albumKind: 'mainline',
          chapters: [{ id: 'chapter-a', title: 'Chapter A' }],
        },
        chapter: {
          id: 'chapter-b',
          albumId: 'album-b',
          title: 'Chapter B',
          navigation: { previousChapterId: null, nextChapterId: null },
          blocks: [],
          citations: [],
        },
      })
    )

    await expect(service.loadChapter('zh_CN', 'album-a', 'chapter-b')).rejects.toThrow(
      'Chapter chapter-b does not belong to album album-a.'
    )
  })

  it('rejects a chapter payload whose albumId does not match the requested album', async () => {
    const service = new ReaderService(
      createRepository({
        album: {
          id: 'album-a',
          title: 'Album A',
          albumKind: 'mainline',
          chapters: [{ id: 'chapter-a', title: 'Chapter A' }],
        },
        chapter: {
          id: 'chapter-a',
          albumId: 'album-b',
          title: 'Chapter A',
          navigation: { previousChapterId: null, nextChapterId: null },
          blocks: [],
          citations: [],
        },
      })
    )

    await expect(service.loadChapter('zh_CN', 'album-a', 'chapter-a')).rejects.toThrow(
      'Chapter chapter-a belongs to album album-b, not album album-a.'
    )
  })
})
