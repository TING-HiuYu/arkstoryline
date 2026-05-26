import type { AppLocale } from '../../app/i18n'
import type { ContentSource, RelatedRef } from '../../domain/album/album-types'
import type {
  StoryAlbumOtherStoryMetadata,
  StoryAlbumMusicMetadata,
} from '../../domain/catalog/story-album'
import type { StoryAlbumCover } from '../../domain/catalog/story-album-cover'
import type { TimelineItem } from '../../domain/timeline/timeline-item'
import {
  buildStaticDataPath,
  normalizeStaticDataRelativePath,
  type StaticDataManifest,
} from './static-data-client'

const jsonPromiseCacheByFetch = new WeakMap<typeof fetch, Map<string, Promise<unknown>>>()

export interface StaticCatalogData {
  albums: Array<{
    id: string
    title: string
    slug: string
    albumKind?: string
    homeSection?: string
    cover?: StoryAlbumCover
    summary?: string
    music?: StoryAlbumMusicMetadata
    otherStory?: StoryAlbumOtherStoryMetadata
  }>
}

export interface StaticTimelineData {
  items: TimelineItem[]
}

export interface StaticOperatorIndexData {
  generatedAt: string
  operators: Array<{
    name: string
    slug: string
    page?: string
    profession?: string
    rarity?: string
    faction?: string
  }>
}

export interface StaticOperatorConfidentialData {
  generatedAt?: string
  operatorId: string
  operatorName: string
  records: Array<{
    id: string
    slug: string
    title: string
    page?: string
    contentSource?: ContentSource
    fields?: Record<string, string>
  }>
}

export interface StaticOperatorArchiveData {
  generatedAt?: string
  operatorId: string
  name?: string
  profile: Record<string, string>
  metadata?: Record<string, unknown>
}

export interface StaticOperatorModuleData {
  id: string
  slug: string
  name: string
  type: string
  fields: Record<string, string>
}

export interface StaticOperatorModulesData {
  generatedAt?: string
  operatorId: string
  operatorName?: string
  modules: StaticOperatorModuleData[]
}

export interface StaticTerraHistoricusIndexData {
  schemaVersion: number
  generatedAt: string
  source?: {
    providerId?: string
    url?: string
  }
  comics: StaticTerraHistoricusComicData[]
}

export interface StaticTerraHistoricusComicData {
  cid: string
  kind: 'terraHistoricusComic' | string
  title: string
  subtitle?: string
  cover: string
  coverPath?: string
  url: string
  authors?: string[]
}

export interface StaticChapterVisualDiagnostics {
  cueCount: number
  readyCount: number
  disabledCount: number
  missingCount: number
  referencedCount: number
  unmatchedCount: number
}

export interface StoryRepository {
  getManifest(locale: AppLocale): Promise<StaticDataManifest>
  getCatalog(locale: AppLocale): Promise<StaticCatalogData>
  getTimeline(locale: AppLocale): Promise<StaticTimelineData>
  getOperatorIndex(): Promise<StaticOperatorIndexData>
  getOperatorArchive(
    operatorSlug: string,
    operatorName?: string
  ): Promise<StaticOperatorArchiveData>
  getOperatorModules(
    operatorSlug: string,
    operatorName?: string
  ): Promise<StaticOperatorModulesData>
  getOperatorConfidential(
    operatorSlug: string,
    operatorName?: string
  ): Promise<StaticOperatorConfidentialData>
  getTerraHistoricusIndex(): Promise<StaticTerraHistoricusIndexData>
  getSearchIndex(locale: AppLocale): Promise<StaticSearchIndexData>
  getKnowledgeRelatedIndex(locale: AppLocale): Promise<StaticKnowledgeRelatedIndexData>
  getAlbum(locale: AppLocale, albumId: string): Promise<StaticAlbumData>
  getChapter(locale: AppLocale, chapterId: string): Promise<StaticChapterData>
}

export interface StaticSearchIndexData {
  generatedAt: string
  locale: string
  entries: Array<{
    id: string
    kind: 'album' | 'chapter' | 'stage'
    displayTitle: string
    displaySecondary?: string
    albumId: string
    albumTitle: string
    chapterId?: string
    chapterTitle?: string
    stageId?: string
    stageCode?: string
    type: string
    match: {
      title: string
      albumTitle: string
      chapterTitle?: string
      stageId?: string
      stageCode?: string
      aliases: string[]
      tokens: string[]
      exactIds: string[]
    }
    target: {
      route: 'album' | 'chapter'
      albumId: string
      chapterId?: string
    }
  }>
}

export interface StaticKnowledgeRelatedIndexData {
  schemaVersion: number
  generatedAt: string
  model?: {
    name?: string
    maxItems?: number
  }
  items: Record<string, StaticKnowledgeRelatedItem[]>
}

export interface StaticKnowledgeRelatedItem {
  id: string
  targetId: string
  targetType: 'album' | 'chapter' | 'operator' | string
  targetTitle?: string
  targetAlbumId?: string
  targetAlbumType?: string
  relationType: string
  recommendation: number
  reason: string
  relationEntities?: string[]
  relationEvents?: string[]
  evidence?: Array<{
    contentId: string
    blockId?: string
    excerpt?: string
  }>
}

export interface StaticAlbumData {
  id: string
  title: string
  albumKind: string
  cover?: StoryAlbumCover
  summary?: string
  music?: StoryAlbumMusicMetadata
  otherStory?: StoryAlbumOtherStoryMetadata
  extras?: Array<{
    id: string
    albumId: string
    type: 'timeline' | 'log' | 'news' | 'picture' | 'challengeBook' | 'landmark'
    title: string
    path?: string
    imageId?: string
    musicId?: string
    distributeMusic: boolean
  }>
  chapters: Array<{
    id: string
    title: string
    code?: string
    avgTag?: string
    contentSource?: ContentSource
    relatedRef?: RelatedRef[]
  }>
}

export interface StaticChapterData {
  id: string
  albumId: string
  title: string
  subtitle?: string
  code?: string
  avgTag?: string
  navigation: {
    previousChapterId: string | null
    nextChapterId: string | null
  }
  blocks: Array<
    | { type: 'dialogue'; id: string; speaker: string; text: string }
    | { type: 'narration'; id: string; text: string }
    | {
        type: 'choice'
        id: string
        options: string[]
        values?: string[]
        branches?: Array<{
          id: string
          predicate?: string
          references?: string[]
          blocks: StaticChapterData['blocks']
        }>
      }
    | { type: 'sectionBreak'; id: string; variant: string }
    | { type: 'unknownCue'; id: string; prop: string; attributes: Record<string, unknown> }
    | {
        type: 'imageCue'
        id: string
        imageId?: string
        assetId?: string
        assetStatus?: string
        localPath?: string
        sourceUrl?: string
      }
    | {
        type: 'backgroundCue'
        id: string
        assetId?: string
        sourceImageId?: string
        assetStatus?: string
        localPath?: string
        sourceUrl?: string
      }
  >
  contentSource?: ContentSource
  relatedRef?: RelatedRef[]
  sourceContentId?: string
  citations: Array<{ id: string; blockId: string; marker: number }>
  buildDiagnostics?: Array<{
    code: 'missing-story-text'
    message: string
    storyTxt?: string
    sourcePath?: string
  }>
  visualDiagnostics?: StaticChapterVisualDiagnostics
}

export class StaticStoryRepository implements StoryRepository {
  private readonly fetchImpl: typeof fetch
  private readonly cacheFetchImpl: typeof fetch

  public constructor(fetchImpl: typeof fetch = fetch) {
    this.cacheFetchImpl = fetchImpl
    this.fetchImpl = fetchImpl.bind(globalThis)
  }

  public async getManifest(locale: AppLocale): Promise<StaticDataManifest> {
    return this.readJson(locale, 'manifest.json')
  }

  public async getCatalog(locale: AppLocale): Promise<StaticCatalogData> {
    return this.readJson<StaticCatalogData>(locale, 'catalog.json')
  }

  public async getTimeline(locale: AppLocale): Promise<StaticTimelineData> {
    return this.readJson<StaticTimelineData>(locale, 'timeline.json')
  }

  public async getOperatorIndex(): Promise<StaticOperatorIndexData> {
    return this.readRootJson('operator/index.json')
  }

  public async getOperatorArchive(
    operatorSlug: string,
    operatorName = operatorSlug
  ): Promise<StaticOperatorArchiveData> {
    const safeOperatorSlug = assertSafeStaticPathSegment(operatorSlug, 'operatorSlug')
    const data = await this.tryReadRootJson<StaticOperatorArchiveData>(
      `operator/${safeOperatorSlug}/archive.json`
    )

    return (
      data ?? {
        operatorId: safeOperatorSlug,
        name: operatorName,
        profile: {},
        metadata: {},
      }
    )
  }

  public async getOperatorModules(
    operatorSlug: string,
    operatorName = operatorSlug
  ): Promise<StaticOperatorModulesData> {
    const safeOperatorSlug = assertSafeStaticPathSegment(operatorSlug, 'operatorSlug')
    const data = await this.tryReadRootJson<StaticOperatorModulesData>(
      `operator/${safeOperatorSlug}/modules.json`
    )

    return (
      data ?? {
        operatorId: safeOperatorSlug,
        operatorName,
        modules: [],
      }
    )
  }

  public async getOperatorConfidential(
    operatorSlug: string,
    operatorName = operatorSlug
  ): Promise<StaticOperatorConfidentialData> {
    const safeOperatorSlug = assertSafeStaticPathSegment(operatorSlug, 'operatorSlug')
    const data = await this.tryReadRootJson<StaticOperatorConfidentialData>(
      `operator/${safeOperatorSlug}/confidential.json`
    )

    return (
      data ?? {
        operatorId: safeOperatorSlug,
        operatorName,
        records: [],
      }
    )
  }

  public async getTerraHistoricusIndex(): Promise<StaticTerraHistoricusIndexData> {
    return (
      (await this.tryReadRootJson<StaticTerraHistoricusIndexData>(
        'terra-historicus/index.json'
      )) ?? {
        schemaVersion: 1,
        generatedAt: '',
        comics: [],
      }
    )
  }

  public async getSearchIndex(locale: AppLocale): Promise<StaticSearchIndexData> {
    return this.readJson(locale, 'search-index.json')
  }

  public async getKnowledgeRelatedIndex(
    locale: AppLocale
  ): Promise<StaticKnowledgeRelatedIndexData> {
    return (
      (await this.tryReadJson<StaticKnowledgeRelatedIndexData>(
        locale,
        'knowledge/related-index.json'
      )) ?? {
        schemaVersion: 1,
        generatedAt: '',
        items: {},
      }
    )
  }

  public async getAlbum(locale: AppLocale, albumId: string): Promise<StaticAlbumData> {
    const safeAlbumId = assertSafeStaticPathSegment(albumId, 'albumId')
    return this.readJson(locale, `albums/${safeAlbumId}.json`)
  }

  public async getChapter(locale: AppLocale, chapterId: string): Promise<StaticChapterData> {
    const safeChapterId = assertSafeStaticPathSegment(chapterId, 'chapterId')
    return this.decorateChapterVisualDiagnostics(
      await this.readJson<StaticChapterData>(locale, `chapters/${safeChapterId}.json`)
    )
  }

  private decorateChapterVisualDiagnostics(chapter: StaticChapterData): StaticChapterData {
    const diagnostics: StaticChapterVisualDiagnostics = {
      cueCount: 0,
      readyCount: 0,
      disabledCount: 0,
      missingCount: 0,
      referencedCount: 0,
      unmatchedCount: 0,
    }

    const visitBlocks = (blocks: StaticChapterData['blocks']): void => {
      for (const block of blocks) {
        if (block.type === 'backgroundCue' || block.type === 'imageCue') {
          diagnostics.cueCount += 1

          if (block.assetStatus === 'ready' && block.localPath) {
            diagnostics.readyCount += 1
          } else if (block.assetStatus === 'disabled') {
            diagnostics.disabledCount += 1
          } else if (block.assetStatus === 'missing') {
            diagnostics.missingCount += 1
          } else {
            diagnostics.referencedCount += 1
          }

          continue
        }

        if (block.type === 'choice') {
          for (const branch of block.branches ?? []) {
            visitBlocks(branch.blocks)
          }

          continue
        }

        if (
          block.type === 'unknownCue' &&
          (block.prop.toLowerCase() === 'background' || block.prop.toLowerCase() === 'image')
        ) {
          diagnostics.cueCount += 1
          diagnostics.unmatchedCount += 1
        }
      }
    }

    visitBlocks(chapter.blocks)

    return {
      ...chapter,
      visualDiagnostics: diagnostics,
    }
  }

  private async readJson<T>(locale: AppLocale, relativePath: string): Promise<T> {
    const normalizedPath = normalizeStaticDataRelativePath(relativePath)
    return this.readCachedJson<T>(buildStaticDataPath(locale, normalizedPath), normalizedPath)
  }

  private async tryReadJson<T>(locale: AppLocale, relativePath: string): Promise<T | null> {
    try {
      return await this.readJson<T>(locale, relativePath)
    } catch {
      return null
    }
  }

  private async readRootJson<T>(relativePath: string): Promise<T> {
    const normalizedPath = normalizeStaticDataRelativePath(relativePath)
    return this.readCachedJson<T>(`/data/${normalizedPath}`, relativePath)
  }

  private async readCachedJson<T>(url: string, errorLabel: string): Promise<T> {
    let cache = jsonPromiseCacheByFetch.get(this.cacheFetchImpl)

    if (!cache) {
      cache = new Map()
      jsonPromiseCacheByFetch.set(this.cacheFetchImpl, cache)
    }

    const cached = cache.get(url)

    if (cached) {
      return cached as Promise<T>
    }

    const loading = this.fetchImpl(url)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to load ${errorLabel}: HTTP ${response.status} ${response.statusText}`
          )
        }

        return (await response.json()) as T
      })
      .catch((error) => {
        cache.delete(url)
        throw error
      })

    cache.set(url, loading)
    return loading
  }

  private async tryReadRootJson<T>(relativePath: string): Promise<T | null> {
    try {
      return await this.readRootJson<T>(relativePath)
    } catch {
      return null
    }
  }

}

function assertSafeStaticPathSegment(value: string, label: string): string {
  const normalized = normalizeStaticDataRelativePath(value)

  if (normalized.includes('/')) {
    throw new Error(`Unsafe ${label}: ${value}`)
  }

  return normalized
}
