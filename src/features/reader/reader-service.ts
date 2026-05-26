import type { AppLocale } from '../../app/i18n'
import { createAlbumFromData } from '../../domain/album/album-factory'
import type {
  StaticChapterData,
  StaticAlbumData,
  StoryRepository,
} from '../../infrastructure/storage/static-story-repository'
import { StoryReaderPageInstance } from './runtime/reader-page-instance'
import { PrtsStoryResourceLoader, type RuntimeStoryContent } from './runtime/story-resource-loader'

export interface ReaderChapterPayload {
  album: StaticAlbumData
  chapter: StaticChapterData
  reader: StoryReaderPageInstance
}

export class ReaderService {
  private readonly repository: StoryRepository

  public constructor(repository: StoryRepository) {
    this.repository = repository
  }

  public async loadChapter(
    locale: AppLocale,
    albumId: string,
    chapterId: string
  ): Promise<ReaderChapterPayload> {
    const [album, chapter] = await Promise.all([
      this.repository.getAlbum(locale, albumId),
      this.repository.getChapter(locale, chapterId),
    ])

    if (!album.chapters.some((albumChapter) => albumChapter.id === chapterId)) {
      throw new Error(`Chapter ${chapterId} does not belong to album ${albumId}.`)
    }

    if (chapter.albumId !== album.id) {
      throw new Error(
        `Chapter ${chapterId} belongs to album ${chapter.albumId}, not album ${album.id}.`
      )
    }

    const reader = createStoryReaderPageInstance(album, chapter)

    const loadedChapter = chapter.contentSource?.url && chapter.blocks.length === 0
      ? adaptRuntimeContentToStaticChapter(chapter, await reader.load())
      : chapter

    return {
      album,
      chapter: loadedChapter,
      reader,
    }
  }
}

function createStoryReaderPageInstance(
  albumData: StaticAlbumData,
  chapter: StaticChapterData
): StoryReaderPageInstance {
  const album = createAlbumFromData(albumData)
  const chapterRef = album.getChapter(chapter.id)

  return new StoryReaderPageInstance({
    album,
    chapter: chapterRef ?? {
      id: chapter.id,
      albumId: chapter.albumId,
      title: chapter.title,
      code: chapter.code,
      avgTag: chapter.avgTag,
      sort: 0,
      downloadable: true,
      contentSource: chapter.contentSource,
      relatedRef: chapter.relatedRef ?? [],
    },
    resourceLoader: new PrtsStoryResourceLoader(),
  })
}

export function adaptRuntimeContentToStaticChapter(
  chapter: StaticChapterData,
  runtimeContent: RuntimeStoryContent
): StaticChapterData {
  return {
    ...chapter,
    blocks: runtimeContent.blocks.map((block): StaticChapterData['blocks'][number] => {
      if (block.type === 'dialogue') {
        return {
          type: 'dialogue',
          id: block.id,
          speaker: block.speaker,
          text: block.text,
        }
      }

      if (block.type === 'narration') {
        return {
          type: 'narration',
          id: block.id,
          text: block.text,
        }
      }

      if (block.type === 'divider') {
        return {
          type: 'sectionBreak',
          id: block.id,
          variant: 'scene',
        }
      }

      if (block.role === 'background') {
        return {
          type: 'backgroundCue',
          id: block.id,
          sourceImageId: block.sourceId,
          assetStatus: block.url ? 'referenced' : 'missing',
          sourceUrl: block.url,
        }
      }

      return {
        type: 'imageCue',
        id: block.id,
        imageId: block.sourceId,
        assetStatus: block.url ? 'referenced' : 'missing',
        sourceUrl: block.url,
      }
    }),
  }
}
