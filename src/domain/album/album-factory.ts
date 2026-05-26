import type {
  StaticOperatorArchiveData,
  StaticOperatorConfidentialData,
  StaticOperatorModulesData,
  StaticAlbumData,
  StaticTerraHistoricusComicData,
} from '../../infrastructure/storage/static-story-repository'
import {
  MainlineAlbum,
  OperatorAlbum,
  OtherArchiveAlbum,
  SideStoryAlbum,
  TerraHistoricusAlbum,
  type AlbumBase,
} from './album'
import type {
  AlbumContext,
  AlbumData,
  AlbumGroup,
  OperatorConfidential,
  OperatorDocument,
  OperatorDocumentSection,
  OperatorModule,
  RelatedRef,
} from './album-types'

export function createAlbumFromData(
  album: StaticAlbumData,
  options: {
    context?: AlbumContext
    relatedRefsByChapterId?: Map<string, RelatedRef[]>
  } = {}
): AlbumBase {
  const kind = normalizeAlbumKind(album.id, album.albumKind)
  const data: Omit<AlbumData, 'kind'> = {
    id: album.id,
    slug: album.id,
    title: album.title,
    group: resolveAlbumGroup(album),
    cover: album.cover,
    summary: album.summary,
    chapters: album.chapters.map((chapter, index) => ({
      ...chapter,
      albumId: album.id,
      sort: index + 1,
      downloadable: true,
      relatedRef: options.relatedRefsByChapterId?.get(chapter.id) ?? [],
    })),
  }

  if (kind === 'mainline') {
    return new MainlineAlbum(data, options.context)
  }

  if (kind === 'otherStory') {
    return new OtherArchiveAlbum(data, options.context)
  }

  return new SideStoryAlbum(data, options.context)
}

export function createOperatorAlbum(
  operatorSlug: string,
  operatorName: string,
  archive: StaticOperatorArchiveData,
  modules: StaticOperatorModulesData,
  confidential: StaticOperatorConfidentialData
): OperatorAlbum {
  return new OperatorAlbum({
    id: operatorSlug,
    slug: operatorSlug,
    title: operatorName,
    group: {
      id: `operator-${resolveInitialGroup(operatorName)}`,
      title: resolveInitialGroup(operatorName),
      order: resolveInitialGroupOrder(operatorName),
      kind: 'operator-initial',
    },
    documents: createOperatorDocuments(archive),
    modules: modules.modules.map(createOperatorModule),
    confidentials: confidential.records.map(
      (record): OperatorConfidential => ({
        id: record.id,
        title: record.title,
        contentSource: record.page
          ? {
              provider: 'prts',
              url: `https://prts.wiki/w/${encodeWikiPath(record.page)}`,
              page: record.page,
              kind: 'operator-confidential',
            }
          : undefined,
        sections: Object.entries(record.fields ?? {}).map(([key, value], index) => ({
          id: `${record.id}:field:${index}`,
          title: key,
          body: value,
        })),
      })
    ),
  })
}

export function createTerraHistoricusAlbum(
  comics: StaticTerraHistoricusComicData[]
): TerraHistoricusAlbum {
  return new TerraHistoricusAlbum({
    id: 'terra-historicus',
    slug: 'terra-historicus',
    title: '泰拉记事社',
    group: {
      id: 'terra-historicus',
      title: '泰拉记事社',
      order: 0,
      kind: 'terra-historicus',
    },
    entries: comics.map((comic) => ({
      id: comic.cid,
      title: comic.title,
      subtitle: comic.subtitle,
      cover: comic.coverPath ?? comic.cover,
      url: comic.url,
    })),
  })
}

function createOperatorDocuments(archive: StaticOperatorArchiveData): OperatorDocument[] {
  const profileEntries = Object.entries(archive.profile)
  const profileSections: OperatorDocumentSection[] = profileEntries
    .filter(([key]) => !/文本$|条件$/u.test(key))
    .map(([key, value], index) => ({
      id: `${archive.operatorId}:profile:${index}`,
      title: key,
      body: value,
    }))
  const fileSections: OperatorDocumentSection[] = profileEntries
    .filter(([key]) => /文本$/u.test(key))
    .map(([key, value], index) => ({
      id: `${archive.operatorId}:file:${index}`,
      title: key.replace(/文本$/u, ''),
      body: value,
    }))

  return [
    {
      id: `${archive.operatorId}:document:profile`,
      title: '档案',
      sections: [...profileSections, ...fileSections],
    },
  ]
}

function createOperatorModule(
  module: StaticOperatorModulesData['modules'][number]
): OperatorModule {
  return {
    id: module.id,
    title: module.name,
    moduleCode: module.type,
    sections: Object.entries(module.fields).map(([key, value], index) => ({
      id: `${module.id}:field:${index}`,
      title: key,
      body: value,
    })),
  }
}

function resolveAlbumGroup(album: StaticAlbumData): AlbumGroup {
  const normalizedType = normalizeAlbumKind(album.id, album.albumKind)

  if (normalizedType === 'mainline') {
    return {
      id: slugGroup(album.music?.arcTitle ?? '主题曲'),
      title: album.music?.arcTitle ?? '主题曲',
      order: 0,
      kind: 'mainline-phase',
    }
  }

  if (normalizedType === 'otherStory') {
    const title = album.otherStory?.groupTitle ?? '附加档案'
    return {
      id: slugGroup(title),
      title,
      order: 0,
      kind: 'archive-category',
    }
  }

  const title = album.music?.arcTitle ?? album.music?.movementTitle ?? 'SideStory'
  return {
    id: slugGroup(title),
    title,
    order: 0,
    kind: 'sidestory-category',
  }
}

function normalizeAlbumKind(albumId: string, albumKind: string): string {
  if (/^main_\d+$/i.test(albumId)) {
    return 'mainline'
  }

  if (albumKind === 'sidestory') {
    return 'intermezzi'
  }

  return albumKind
}

function resolveInitialGroup(value: string): string {
  const first = value.trim()[0]

  if (!first) {
    return '#'
  }

  return /[a-z]/i.test(first) ? first.toUpperCase() : '#'
}

function resolveInitialGroupOrder(value: string): number {
  const group = resolveInitialGroup(value)
  return group === '#' ? 999 : group.charCodeAt(0)
}

function slugGroup(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{Letter}\p{Number}-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

function encodeWikiPath(page: string): string {
  return page
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
}
