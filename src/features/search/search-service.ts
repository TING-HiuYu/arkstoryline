import { Document } from 'flexsearch'
import { pinyin } from 'pinyin-pro'
import type { AppLocale } from '../../app/i18n'
import type {
  StaticOperatorIndexData,
  StaticSearchIndexData,
  StoryRepository,
} from '../../infrastructure/storage/static-story-repository'

export interface SearchFilters {
  type?: string
}

export interface SearchResultItem {
  id: string
  kind: 'album' | 'chapter' | 'stage' | 'operator' | 'module' | 'confidential'
  title: string
  secondary?: string
  albumId: string
  chapterId?: string
  stageCode?: string
  albumTitle: string
  type: string
  targetPath: string
}

interface SearchIndexCache {
  index: StaticSearchIndexData
  entries: SearchRuntimeEntry[]
  flex: Document<LocalSearchDocument>
}

interface LocalSearchDocument {
  [key: string]: string
  id: string
  title: string
  albumTitle: string
  chapterCode: string
  chapterTitle: string
  keyInfo: string
}

interface SearchRuntimeEntry {
  id: string
  kind: SearchResultItem['kind']
  title: string
  secondary?: string
  albumId: string
  chapterId?: string
  stageCode?: string
  albumTitle: string
  type: string
  targetPath: string
  rankFields: Array<{ rank: number; values: string[] }>
}

type OperatorItem = StaticOperatorIndexData['operators'][number]

function isMainlineAlbumId(albumId: string): boolean {
  return /^main_\d+$/i.test(albumId)
}

function normalizeEntryType(type: string, albumId: string): string {
  if (type !== 'sidestory') {
    return type
  }

  if (isMainlineAlbumId(albumId)) {
    return 'mainline'
  }

  return 'intermezzi'
}

function toSearchPath(
  locale: AppLocale,
  target: { route: 'album' | 'chapter'; albumId: string; chapterId?: string }
): string {
  if (target.route === 'album') {
    return `/${locale}/albums/${target.albumId}`
  }

  if (!target.chapterId) {
    return `/${locale}/albums/${target.albumId}`
  }

  return `/${locale}/read/${target.albumId}/${target.chapterId}`
}

export class SearchService {
  private readonly repository: StoryRepository
  private readonly cache = new Map<AppLocale, SearchIndexCache>()

  public constructor(repository: StoryRepository) {
    this.repository = repository
  }

  public async search(
    locale: AppLocale,
    query: string,
    filters: SearchFilters = {}
  ): Promise<SearchResultItem[]> {
    const keyword = query.trim()

    if (keyword.length === 0) {
      return []
    }

    const searchIndex = await this.getLocaleIndex(locale)
    const normalizedKeywords = buildSearchTextVariants(keyword)

    const candidateIds = new Set<string>()

    for (const normalizedKeyword of normalizedKeywords) {
      const flexResults = searchIndex.flex.search(normalizedKeyword, {
        enrich: true,
        merge: true,
        limit: 80,
      }) as Array<{ id: string | number }>

      for (const result of flexResults) {
        candidateIds.add(String(result.id))
      }
    }

    return searchIndex.entries
      .filter((item) => candidateIds.has(item.id))
      .map((item) => {
        const rank = getStrictMatchRank(item, normalizedKeywords)

        return {
          item,
          rank,
        }
      })
      .filter((result) => result.rank !== null)
      .filter((result) => {
        if (!filters.type) {
          return true
        }

        if (filters.type === 'sideStory') {
          return result.item.type === 'intermezzi' || result.item.type === 'sideStory'
        }

        return result.item.type === filters.type
      })
      .sort((left, right) => {
        const leftExact = left.item.rankFields
          .find((group) => group.rank === 0)
          ?.values.some((value) => normalizedKeywords.includes(normalizeSearchText(value)))
        const rightExact = right.item.rankFields
          .find((group) => group.rank === 0)
          ?.values.some((value) => normalizedKeywords.includes(normalizeSearchText(value)))

        if (leftExact !== rightExact) {
          return leftExact ? -1 : 1
        }

        if (left.rank !== right.rank) {
          return (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER)
        }

        return compareSearchEntryOrder(left.item.kind, left.item.id, right.item.kind, right.item.id)
      })
      .map((result) => result.item)
  }

  private async getLocaleIndex(locale: AppLocale): Promise<SearchIndexCache> {
    const cached = this.cache.get(locale)

    if (cached) {
      return cached
    }

    const index = await this.repository.getSearchIndex(locale)
    const baseEntries = index.entries.map((entry) => toRuntimeEntry(locale, entry))
    const operatorEntries = await this.buildOperatorRuntimeEntries(locale)
    const entries = [...baseEntries, ...operatorEntries]
    const flex = new Document<LocalSearchDocument>({
      tokenize: 'full',
      document: {
        id: 'id',
        index: ['title', 'albumTitle', 'chapterCode', 'chapterTitle', 'keyInfo'],
        store: false,
      },
    })

    for (const entry of entries) {
      const document = toLocalSearchDocument(entry)

      if (document) {
        flex.add(document)
      }
    }

    const built = { index, entries, flex }
    this.cache.set(locale, built)
    return built
  }

  private async buildOperatorRuntimeEntries(locale: AppLocale): Promise<SearchRuntimeEntry[]> {
    const operatorIndex = await this.repository.getOperatorIndex()
    return operatorIndex.operators.map((operator) => buildOperatorEntry(locale, operator))
  }
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').toLowerCase().trim()
}

function buildSearchTextVariants(value: string): string[] {
  return uniqueSearchValues([normalizeSearchText(value), ...buildChineseNameSearchAliases(value)])
}

function toLocalSearchDocument(item: SearchRuntimeEntry): LocalSearchDocument | null {
  return {
    id: item.id,
    title: item.title,
    albumTitle: item.albumTitle,
    chapterCode: item.stageCode ?? '',
    chapterTitle: '',
    keyInfo: buildLocalKeyInfo(item),
  }
}

function toRuntimeEntry(
  locale: AppLocale,
  item: StaticSearchIndexData['entries'][number]
): SearchRuntimeEntry {
  const normalizedType = normalizeEntryType(item.type, item.albumId)
  const visibleStageCode = item.stageCode ?? item.match.stageCode
  const visibleTitles = [item.displayTitle, item.match.title].filter((value): value is string =>
    Boolean(value)
  )
  const visibleChapterTitles = [item.chapterTitle, item.match.chapterTitle].filter(
    (value): value is string => Boolean(value)
  )
  const visibleAlbumTitles = [item.albumTitle, item.match.albumTitle].filter(
    (value): value is string => Boolean(value)
  )

  return {
    id: item.id,
    kind: item.kind,
    title: item.displayTitle,
    secondary: item.displaySecondary,
    albumId: item.albumId,
    chapterId: item.chapterId,
    stageCode: item.stageCode,
    albumTitle: item.albumTitle,
    type: normalizedType,
    targetPath: toSearchPath(locale, item.target),
    rankFields: [
      { rank: 0, values: item.kind === 'album' ? visibleAlbumTitles : [] },
      { rank: 1, values: [visibleStageCode].filter((value): value is string => Boolean(value)) },
      { rank: 2, values: visibleTitles },
      {
        rank: 3,
        values: [...visibleChapterTitles, ...visibleAlbumTitles],
      },
    ],
  }
}

function buildOperatorEntry(locale: AppLocale, operator: OperatorItem): SearchRuntimeEntry {
  const nameAliases = buildChineseNameSearchAliases(operator.name)

  return {
    id: `operator:${operator.slug}`,
    kind: 'operator',
    title: operator.name,
    secondary: operator.faction,
    albumId: operator.slug,
    albumTitle: operator.name,
    type: 'operatorRecord',
    targetPath: `/${locale}/operators/${operator.slug}`,
    rankFields: [
      { rank: 0, values: [operator.name, ...nameAliases] },
      {
        rank: 2,
        values: [operator.name, operator.page, ...nameAliases].filter((value): value is string =>
          Boolean(value)
        ),
      },
      {
        rank: 4,
        values: [operator.profession, operator.faction].filter((value): value is string =>
          Boolean(value)
        ),
      },
    ],
  }
}

function buildLocalKeyInfo(item: SearchRuntimeEntry): string {
  return item.rankFields
    .flatMap((field) => field.values)
    .filter((value) => !looksLikeInternalId(value))
    .join(' ')
}

function looksLikeInternalId(value: string): boolean {
  return /(?:^|[_-])(?:obt|story|memory|main|act|char|uniequip)(?:[_-]|$)/i.test(value)
}

function getStrictMatchRank(item: SearchRuntimeEntry, normalizedKeywords: string[]): number | null {
  for (const group of item.rankFields) {
    if (
      group.values.some((value) =>
        normalizedKeywords.some((normalizedKeyword) =>
          isStrictCandidateMatch(value, normalizedKeyword)
        )
      )
    ) {
      return group.rank
    }
  }

  return null
}

function buildChineseNameSearchAliases(value: string): string[] {
  if (!hasChineseCharacter(value)) {
    return []
  }

  const normalizedValue = normalizeSearchText(value)
  const syllables = pinyin(normalizedValue, {
    toneType: 'none',
    type: 'array',
  })
    .map((part) => normalizeSearchText(part))
    .filter(Boolean)
  const initials = pinyin(normalizedValue, {
    pattern: 'first',
    toneType: 'none',
    type: 'array',
  })
    .map((part) => normalizeSearchText(part))
    .filter(Boolean)

  return uniqueSearchValues([syllables.join(''), initials.join('')])
}

function hasChineseCharacter(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value)
}

function uniqueSearchValues(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalizedValue = normalizeSearchText(value)

    if (!normalizedValue || seen.has(normalizedValue)) {
      continue
    }

    seen.add(normalizedValue)
    result.push(normalizedValue)
  }

  return result
}

function isStrictCandidateMatch(candidate: string | undefined, normalizedKeyword: string): boolean {
  if (!candidate) {
    return false
  }

  const normalizedCandidate = normalizeSearchText(candidate)

  if (/^\d+$/.test(normalizedKeyword)) {
    const numericSegments = Array.from(normalizedCandidate.matchAll(/\d+/g), (match) => match[0])
    return numericSegments.includes(normalizedKeyword)
  }

  return normalizedCandidate.includes(normalizedKeyword)
}

function compareSearchEntryOrder(
  leftKind: SearchResultItem['kind'],
  leftId: string,
  rightKind: SearchResultItem['kind'],
  rightId: string
): number {
  const kindRank = { album: 0, chapter: 1, operator: 2, module: 3, confidential: 4, stage: 5 }
  const leftKindRank = kindRank[leftKind]
  const rightKindRank = kindRank[rightKind]

  if (leftKindRank !== rightKindRank) {
    return leftKindRank - rightKindRank
  }

  return leftId.localeCompare(rightId)
}
