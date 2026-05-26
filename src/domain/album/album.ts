import type { StoryAlbumCover } from '../catalog/story-album-cover'
import type {
  AlbumCardProfile,
  AlbumContext,
  AlbumData,
  AlbumGroup,
  AlbumKind,
  OperatorConfidential,
  OperatorDocument,
  OperatorModule,
  StoryChapterRefModel,
  TerraHistoricusEntry,
} from './album-types'

export abstract class AlbumBase {
  public readonly id: string
  public readonly slug: string
  public readonly title: string
  public readonly kind: AlbumKind
  public readonly group: AlbumGroup
  public readonly chapters: StoryChapterRefModel[]
  public readonly cover?: StoryAlbumCover
  public readonly summary?: string
  public readonly context: AlbumContext

  public abstract readonly cardProfile: AlbumCardProfile

  protected constructor(data: AlbumData, context: AlbumContext = {}) {
    this.id = data.id
    this.slug = data.slug
    this.title = data.title
    this.kind = data.kind
    this.group = data.group
    this.chapters = data.chapters ?? []
    this.cover = data.cover
    this.summary = data.summary
    this.context = context
  }

  public getChapter(chapterId: string): StoryChapterRefModel | null {
    return this.chapters.find((chapter) => chapter.id === chapterId) ?? null
  }

  public getPreviousChapter(chapterId: string): StoryChapterRefModel | null {
    const index = this.chapters.findIndex((chapter) => chapter.id === chapterId)
    return index > 0 ? (this.chapters[index - 1] ?? null) : null
  }

  public getNextChapter(chapterId: string): StoryChapterRefModel | null {
    const index = this.chapters.findIndex((chapter) => chapter.id === chapterId)
    return index >= 0 && index < this.chapters.length - 1
      ? (this.chapters[index + 1] ?? null)
      : null
  }

  public abstract getPreviousAlbum(): AlbumBase | null
  public abstract getNextAlbum(): AlbumBase | null
}

export class MainlineAlbum extends AlbumBase {
  public readonly cardProfile: AlbumCardProfile = {
    variant: 'mainline',
    showCover: true,
    showDescription: true,
    showProgress: true,
    showChapterCount: true,
  }

  public constructor(data: Omit<AlbumData, 'kind'>, context: AlbumContext = {}) {
    super({ ...data, kind: 'mainline' }, context)
  }

  public getPreviousAlbum(): AlbumBase | null {
    return this.getSiblingMainlineAlbum(-1)
  }

  public getNextAlbum(): AlbumBase | null {
    return this.getSiblingMainlineAlbum(1)
  }

  private getSiblingMainlineAlbum(offset: number): AlbumBase | null {
    const order = this.context.mainlineOrderIds ?? []
    const currentIndex = order.indexOf(this.id)
    const siblingId = currentIndex >= 0 ? order[currentIndex + offset] : undefined

    if (!siblingId) {
      return null
    }

    const sibling = this.context.albumsById?.get(siblingId)
    return sibling instanceof AlbumBase ? sibling : null
  }
}

export class SideStoryAlbum extends AlbumBase {
  public readonly cardProfile: AlbumCardProfile = {
    variant: 'compact',
    showCover: false,
    showDescription: false,
    showProgress: false,
    showChapterCount: true,
  }

  public constructor(data: Omit<AlbumData, 'kind'>, context: AlbumContext = {}) {
    super({ ...data, kind: 'sidestory' }, context)
  }

  public getPreviousAlbum(): null {
    return null
  }

  public getNextAlbum(): null {
    return null
  }
}

export class OtherArchiveAlbum extends AlbumBase {
  public readonly cardProfile: AlbumCardProfile = {
    variant: 'compact',
    showCover: false,
    showDescription: false,
    showProgress: false,
    showChapterCount: true,
  }

  public constructor(data: Omit<AlbumData, 'kind'>, context: AlbumContext = {}) {
    super({ ...data, kind: 'archive' }, context)
  }

  public getPreviousAlbum(): null {
    return null
  }

  public getNextAlbum(): null {
    return null
  }
}

export class OperatorAlbum extends AlbumBase {
  public readonly cardProfile: AlbumCardProfile = {
    variant: 'operator',
    showCover: false,
    showDescription: false,
    showProgress: false,
    showChapterCount: false,
  }

  public readonly documents: OperatorDocument[]
  public readonly modules: OperatorModule[]
  public readonly confidentials: OperatorConfidential[]

  public constructor(
    data: Omit<AlbumData, 'kind' | 'chapters'> & {
      documents: OperatorDocument[]
      modules: OperatorModule[]
      confidentials: OperatorConfidential[]
    },
    context: AlbumContext = {}
  ) {
    super({ ...data, kind: 'operator', chapters: [] }, context)
    this.documents = data.documents
    this.modules = data.modules
    this.confidentials = data.confidentials
  }

  public getPreviousAlbum(): null {
    return null
  }

  public getNextAlbum(): null {
    return null
  }
}

export class TerraHistoricusAlbum extends AlbumBase {
  public readonly cardProfile: AlbumCardProfile = {
    variant: 'terraHistoricus',
    showCover: true,
    showDescription: false,
    showProgress: false,
    showChapterCount: false,
  }

  public readonly entries: TerraHistoricusEntry[]

  public constructor(
    data: Omit<AlbumData, 'kind' | 'chapters'> & { entries: TerraHistoricusEntry[] },
    context: AlbumContext = {}
  ) {
    super({ ...data, kind: 'terraHistoricus', chapters: [] }, context)
    this.entries = data.entries
  }

  public getPreviousAlbum(): null {
    return null
  }

  public getNextAlbum(): null {
    return null
  }
}
