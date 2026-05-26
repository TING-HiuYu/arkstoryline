import { MainlineAlbum, OperatorAlbum, type AlbumBase } from '../../../domain/album/album'
import type {
  OperatorConfidential,
  OperatorDocument,
  OperatorModule,
  StoryChapterRefModel,
} from '../../../domain/album/album-types'
import type { RuntimeStoryContent, StoryResourceLoader } from './story-resource-loader'

export abstract class ReaderPageInstanceBase<TContent> {
  public loaded = false
  protected cachedContent: TContent | null = null

  public abstract load(): Promise<TContent>

  public get content(): TContent | null {
    return this.cachedContent
  }
}

export class StoryReaderPageInstance extends ReaderPageInstanceBase<RuntimeStoryContent> {
  public readonly album: AlbumBase
  public readonly chapter: StoryChapterRefModel
  private readonly resourceLoader: StoryResourceLoader
  private readonly preloadedChapters = new Map<string, Promise<RuntimeStoryContent>>()

  public constructor(params: {
    album: AlbumBase
    chapter: StoryChapterRefModel
    resourceLoader: StoryResourceLoader
  }) {
    super()
    this.album = params.album
    this.chapter = params.chapter
    this.resourceLoader = params.resourceLoader
  }

  public get previousChapter(): StoryChapterRefModel | null {
    return this.album.getPreviousChapter(this.chapter.id)
  }

  public get nextChapter(): StoryChapterRefModel | null {
    return this.album.getNextChapter(this.chapter.id)
  }

  public get previousAlbum(): AlbumBase | null {
    return this.album instanceof MainlineAlbum ? this.album.getPreviousAlbum() : null
  }

  public get nextAlbum(): AlbumBase | null {
    return this.album instanceof MainlineAlbum ? this.album.getNextAlbum() : null
  }

  public async load(): Promise<RuntimeStoryContent> {
    if (this.loaded && this.cachedContent) {
      return this.cachedContent
    }

    if (!this.chapter.contentSource?.url) {
      throw new Error(`章节 ${this.chapter.id} 缺少 contentSource.url。`)
    }

    this.cachedContent = await this.resourceLoader.load(this.chapter.contentSource.url)
    this.loaded = true

    return this.cachedContent
  }

  public async preloadNextChapter(): Promise<RuntimeStoryContent | null> {
    const nextChapter = this.nextChapter

    if (!nextChapter?.contentSource?.url) {
      return null
    }

    const existing = this.preloadedChapters.get(nextChapter.id)
    if (existing) {
      return existing
    }

    const preload = this.resourceLoader.load(nextChapter.contentSource.url)
    this.preloadedChapters.set(nextChapter.id, preload)
    return preload
  }
}

export interface OperatorReaderContent {
  documents: OperatorDocument[]
  modules: OperatorModule[]
  confidentials: OperatorConfidential[]
}

export class OperatorReaderPageInstance extends ReaderPageInstanceBase<OperatorReaderContent> {
  public readonly album: OperatorAlbum
  public activeSection: 'documents' | 'modules' | 'confidentials'

  public constructor(params: {
    album: OperatorAlbum
    activeSection?: 'documents' | 'modules' | 'confidentials'
  }) {
    super()
    this.album = params.album
    this.activeSection = params.activeSection ?? 'documents'
  }

  public async load(): Promise<OperatorReaderContent> {
    if (this.loaded && this.cachedContent) {
      return this.cachedContent
    }

    this.cachedContent = {
      documents: this.album.documents,
      modules: this.album.modules,
      confidentials: this.album.confidentials,
    }
    this.loaded = true

    return this.cachedContent
  }
}
