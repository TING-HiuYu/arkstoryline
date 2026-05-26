import type { AppLocale } from '../../app/i18n'
import type { StaticDataManifest } from './static-data-client'
import type {
  StaticChapterVisualDiagnostics,
  StaticOperatorArchiveData,
  StaticCatalogData,
  StaticOperatorConfidentialData,
  StaticOperatorIndexData,
  StaticOperatorModulesData,
  StaticTerraHistoricusIndexData,
  StaticKnowledgeRelatedIndexData,
  StaticSearchIndexData,
  StaticChapterData,
  StaticAlbumData,
  StaticTimelineData,
  StoryRepository,
} from './static-story-repository'

interface LocaleSnapshot {
  manifest: StaticDataManifest
  catalog: StaticCatalogData
  timeline: StaticTimelineData
  searchIndex: StaticSearchIndexData
  knowledgeRelatedIndex?: StaticKnowledgeRelatedIndexData
  albumsById: Record<string, StaticAlbumData>
  chaptersById: Record<string, StaticChapterData>
  operatorIndex?: StaticOperatorIndexData
  operatorArchiveBySlug?: Record<string, StaticOperatorArchiveData>
  operatorModulesBySlug?: Record<string, StaticOperatorModulesData>
  operatorConfidentialBySlug?: Record<string, StaticOperatorConfidentialData>
  terraHistoricusIndex?: StaticTerraHistoricusIndexData
}

export class MemoryStoryRepository implements StoryRepository {
  private readonly snapshotByLocale = new Map<AppLocale, LocaleSnapshot>()

  public seed(locale: AppLocale, snapshot: LocaleSnapshot): void {
    this.snapshotByLocale.set(locale, snapshot)
  }

  public async getManifest(locale: AppLocale): Promise<StaticDataManifest> {
    return this.getSnapshot(locale).manifest
  }

  public async getCatalog(locale: AppLocale): Promise<StaticCatalogData> {
    return this.getSnapshot(locale).catalog
  }

  public async getTimeline(locale: AppLocale): Promise<StaticTimelineData> {
    return this.getSnapshot(locale).timeline
  }

  public async getSearchIndex(locale: AppLocale): Promise<StaticSearchIndexData> {
    return this.getSnapshot(locale).searchIndex
  }

  public async getKnowledgeRelatedIndex(
    locale: AppLocale
  ): Promise<StaticKnowledgeRelatedIndexData> {
    return (
      this.getSnapshot(locale).knowledgeRelatedIndex ?? {
        schemaVersion: 1,
        generatedAt: new Date(0).toISOString(),
        items: {},
      }
    )
  }

  public async getOperatorIndex(): Promise<StaticOperatorIndexData> {
    const snapshot = this.getSnapshot('zh_CN')

    return (
      snapshot.operatorIndex ?? {
        generatedAt: new Date(0).toISOString(),
        operators: [],
      }
    )
  }

  public async getOperatorConfidential(
    operatorSlug: string,
    operatorName = operatorSlug
  ): Promise<StaticOperatorConfidentialData> {
    const snapshot = this.getSnapshot('zh_CN')

    return (
      snapshot.operatorConfidentialBySlug?.[operatorSlug] ?? {
        operatorId: operatorSlug,
        operatorName,
        records: [],
      }
    )
  }

  public async getOperatorArchive(
    operatorSlug: string,
    operatorName = operatorSlug
  ): Promise<StaticOperatorArchiveData> {
    const snapshot = this.getSnapshot('zh_CN')

    return (
      snapshot.operatorArchiveBySlug?.[operatorSlug] ?? {
        operatorId: operatorSlug,
        name: operatorName,
        profile: {},
        metadata: {},
      }
    )
  }

  public async getOperatorModules(operatorSlug: string): Promise<StaticOperatorModulesData> {
    const snapshot = this.getSnapshot('zh_CN')

    return (
      snapshot.operatorModulesBySlug?.[operatorSlug] ?? {
        operatorId: operatorSlug,
        modules: [],
      }
    )
  }

  public async getTerraHistoricusIndex(): Promise<StaticTerraHistoricusIndexData> {
    return (
      this.getSnapshot('zh_CN').terraHistoricusIndex ?? {
        schemaVersion: 1,
        generatedAt: new Date(0).toISOString(),
        comics: [],
      }
    )
  }

  public async getAlbum(locale: AppLocale, albumId: string): Promise<StaticAlbumData> {
    const album = this.getSnapshot(locale).albumsById[albumId]

    if (!album) {
      throw new Error(`No album snapshot for id: ${albumId}`)
    }

    return album
  }

  public async getChapter(locale: AppLocale, chapterId: string): Promise<StaticChapterData> {
    const chapter = this.getSnapshot(locale).chaptersById[chapterId]

    if (!chapter) {
      throw new Error(`No chapter snapshot for id: ${chapterId}`)
    }

    return this.decorateChapter(chapter)
  }

  private getSnapshot(locale: AppLocale): LocaleSnapshot {
    const snapshot = this.snapshotByLocale.get(locale)

    if (!snapshot) {
      throw new Error(`No memory snapshot for locale: ${locale}`)
    }

    return snapshot
  }

  private decorateChapter(chapter: StaticChapterData): StaticChapterData {
    if (chapter.visualDiagnostics) {
      return chapter
    }

    const visualDiagnostics: StaticChapterVisualDiagnostics = {
      cueCount: 0,
      readyCount: 0,
      disabledCount: 0,
      missingCount: 0,
      referencedCount: 0,
      unmatchedCount: 0,
    }

    for (const block of chapter.blocks) {
      if (block.type === 'backgroundCue' || block.type === 'imageCue') {
        visualDiagnostics.cueCount += 1

        if (block.assetStatus === 'ready' && block.localPath) {
          visualDiagnostics.readyCount += 1
        } else if (block.assetStatus === 'disabled') {
          visualDiagnostics.disabledCount += 1
        } else if (block.assetStatus === 'missing') {
          visualDiagnostics.missingCount += 1
        } else {
          visualDiagnostics.referencedCount += 1
        }
      }
    }

    return {
      ...chapter,
      visualDiagnostics,
    }
  }
}
