import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import type { StoryAlbumCover } from '../../src/domain/catalog/story-album-cover'
import type { StoryAlbumMusicMetadata } from '../../src/domain/catalog/story-album'
import { buildTimelineFromCatalog } from '../../src/domain/timeline/timeline-service'
import type { TimelineItem } from '../../src/domain/timeline/timeline-item'
import type { SourceRevision } from '../../src/infrastructure/data-source'
import { mapReviewStoryToChapter } from '../transform/map-review-story-to-chapter'
import { parseStoryReviewMetaOtherStorys } from '../transform/story-review-meta-extras-parser'
import type { RawInfoUnlockData } from '../transform/raw-models/raw-info-unlock-data'
import type { RawStoryReviewTablePayload } from '../transform/raw-models/raw-story-review-entry'
import { mapReviewEntryToAlbum } from '../transform/review-entry-album-mapper'

import { DisabledAssetSourceProvider, type AssetSourceProvider } from './asset-source-provider'
import { buildTimelineRules, type BuildTimelineRulesInput } from './timeline-rules'

const DATA_SCHEMA_VERSION = 1
interface BuildStaticDataInput {
  locale: string
  inputDir: string
  outputDir: string
  coverAssetsOutputDir?: string
  assetSourceProvider?: AssetSourceProvider
  generatedAt?: Date
  clearOutputDir?: boolean
  allowMissingStoryText?: boolean
  timelineRulesInput?: Pick<BuildTimelineRulesInput, 'overridesFilePath' | 'storylineOrderService'>
}

interface BuildManifest {
  schemaVersion: typeof DATA_SCHEMA_VERSION
  locale: string
  generatedAt: string
  source: SourceRevision
  files: Record<string, string>
}

interface SearchTarget {
  route: 'album' | 'chapter'
  albumId: string
  chapterId?: string
}

type SearchEntryKind = 'album' | 'chapter' | 'stage'

interface SearchIndexEntry {
  id: string
  kind: SearchEntryKind
  locale: string
  displayTitle: string
  displaySecondary?: string
  albumId: string
  albumTitle: string
  chapterId?: string
  chapterTitle?: string
  stageId?: string
  stageCode?: string
  type: string
  homeSection: string
  sortIndex: number
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
  target: SearchTarget
}

interface SearchIndex {
  generatedAt: string
  locale: string
  entries: SearchIndexEntry[]
}

interface BuildStaticDataReport {
  locale: string
  schemaVersion: typeof DATA_SCHEMA_VERSION
  generatedAt: string
  source: SourceRevision
  outputDir: string
  filesWritten: string[]
  albumCount: number
  chapterCount: number
  timelineCount: number
  searchEntryCount: number
  coverAssets: CoverAssetBuildStats
  diagnostics: BuildStaticDataDiagnostics
}

interface CoverAssetBuildStats {
  providerId: string
  mode: AssetSourceProvider['mode']
  syncedCount: number
  missingCount: number
  disabledCount: number
  placeholderPath: string
}

interface BuildStaticDataDiagnostics {
  missingStorySources: MissingStorySourceDiagnostic[]
}

interface MissingStorySourceDiagnostic {
  albumId: string
  chapterId: string
  storyTxt?: string
  resolvedPath?: string
  reason: 'missing-story-txt' | 'story-file-not-found'
}

export interface BuildStaticDataService {
  build(input: BuildStaticDataInput): Promise<BuildStaticDataReport>
}

interface StageTableStorylineStorySet {
  storySetId: string
  storySetType: string
  sortByYear: number
  sortWithinYear: number
  summary?: string
  arcTitle?: string
  movementTitle?: string
  tags: string[]
  recommended: boolean
  kvImageId?: string
  titleImageId?: string
  backgroundId?: string
  mainlineBackgroundId?: string
  ssBackgroundId?: string
  collectBackgroundId?: string
}

interface StageTableForBuild {
  storylineStorySets: StageTableStorylineStorySet[]
}

interface AlbumChapterMapping {
  story: RawInfoUnlockData
  chapterRef: ReturnType<typeof mapReviewStoryToChapter>
  chapterShell: GeneratedChapterShell
}

interface GeneratedChapterShell {
  id: string
  albumId: string
  title: string
  subtitle?: string
  code?: string
  avgTag?: string
  summary?: string
  contentSource?: ReturnType<typeof mapReviewStoryToChapter>['contentSource']
  navigation: {
    previousChapterId: string | null
    nextChapterId: string | null
  }
  blocks: []
  citations: []
}

interface RawSyncReport {
  providerId?: unknown
  revision?: unknown
}

export const buildStaticDataService: BuildStaticDataService = {
  async build(input: BuildStaticDataInput): Promise<BuildStaticDataReport> {
    const generatedAt = (input.generatedAt ?? new Date()).toISOString()
    const outputLocaleDir = resolve(input.outputDir, input.locale)

    if (input.clearOutputDir !== false) {
      await rm(outputLocaleDir, { recursive: true, force: true })
    }
    await mkdir(outputLocaleDir, { recursive: true })

    const source = await resolveSourceRevisionFromInputDir(input.inputDir)
    const reviewPayload = await readStoryReviewTablePayload(input.inputDir)
    const reviewMetaPayload = await readStoryReviewMetaTablePayload(input.inputDir)
    const stageTable = await readStageTableForBuild(input.inputDir)
    const assetSourceProvider = input.assetSourceProvider ?? new DisabledAssetSourceProvider()
    const coverAssetsOutputDir =
      input.coverAssetsOutputDir ?? resolve(dirname(resolve(input.outputDir)), 'assets/covers')
    const otherStorys = parseStoryReviewMetaOtherStorys(reviewMetaPayload)

    const albumEntries = Object.entries(reviewPayload.storyReviewTable).sort(([left], [right]) =>
      left.localeCompare(right)
    )
    const buildableAlbumEntries = albumEntries.filter(([, entry]) => shouldBuildAlbumEntry(entry))

    const storySetTypeByAlbumId = new Map<string, string>()
    const storySetByAlbumId = new Map<string, StageTableStorylineStorySet>()
    for (const storySet of stageTable.storylineStorySets) {
      storySetTypeByAlbumId.set(storySet.storySetId, storySet.storySetType)
      storySetByAlbumId.set(storySet.storySetId, storySet)
    }

    const albums = buildableAlbumEntries.map(([albumId, entry]) =>
      mapReviewEntryToAlbum(albumId, entry, {
        resolveStorylineStorySetType: ({ id }) => storySetTypeByAlbumId.get(id),
        resolveCover: ({ id, entry: rawEntry }) =>
          resolveAlbumCover({
            albumId: id,
            albumTitle: rawEntry.name,
            storySet: storySetByAlbumId.get(id),
            reviewEntry: rawEntry,
          }),
        resolveGameOrderRank: ({ id }) => {
          const storySet = stageTable.storylineStorySets.find((item) => item.storySetId === id)
          if (!storySet) {
            return undefined
          }

          return storySet.sortByYear * 1000 + storySet.sortWithinYear
        },
        source: {
          providerId: source.providerId,
          revision: source.commitSha,
          path: `${input.locale}/gamedata/excel/story_review_table.json`,
        },
      })
    )

    for (const album of albums) {
      album.extras = otherStorys.byAlbumId[album.id] ?? []
      const storySet = storySetByAlbumId.get(album.id)
      if (!storySet) {
        continue
      }

      album.summary = storySet.summary ?? album.summary
      album.music = buildStoryAlbumMusicMetadata(album.title, storySet)
    }

    const coverAssets = await syncAlbumCoverAssets({
      locale: input.locale,
      albums,
      provider: assetSourceProvider,
      outputDir: coverAssetsOutputDir,
    })

    const chapterShells = new Map<string, GeneratedChapterShell>()
    const chapterRefsByAlbumId = new Map<string, AlbumChapterMapping[]>()
    const diagnostics: BuildStaticDataDiagnostics = {
      missingStorySources: [],
    }

    for (const [entryIndex, [rawAlbumId, entry]] of buildableAlbumEntries.entries()) {
      const normalizedAlbumId = albums[entryIndex]?.id ?? rawAlbumId
      const rawStories = asRawInfoUnlockDataArray(entry.infoUnlockDatas)
      const chapterMappings: AlbumChapterMapping[] = []

      for (const story of rawStories) {
        const chapterRef = mapReviewStoryToChapter(normalizedAlbumId, story)
        const chapterShell = buildChapterShell({
          albumId: normalizedAlbumId,
          chapterId: chapterRef.id,
          chapterTitle: chapterRef.title,
          chapterCode: chapterRef.code,
          chapterAvgTag: chapterRef.avgTag,
          chapterSummary: toNonEmptyString(story.storyInfo),
          chapterContentSource: chapterRef.contentSource,
        })

        chapterShells.set(chapterRef.id, chapterShell)
        chapterMappings.push({
          story,
          chapterRef,
          chapterShell,
        })
      }

      chapterMappings.sort((left, right) => {
        if (left.chapterRef.sort !== right.chapterRef.sort) {
          return left.chapterRef.sort - right.chapterRef.sort
        }

        return left.chapterRef.id.localeCompare(right.chapterRef.id)
      })

      updateChapterNavigation(chapterMappings, chapterShells)
      chapterRefsByAlbumId.set(normalizedAlbumId, chapterMappings)
    }

    if (
      (input.allowMissingStoryText ?? false) === false &&
      diagnostics.missingStorySources.length > 0
    ) {
      const sampleLines = diagnostics.missingStorySources.slice(0, 10).map((item) => {
        const source = item.storyTxt ?? item.resolvedPath ?? 'unknown'
        return `- [${item.reason}] album=${item.albumId} chapter=${item.chapterId} source=${source}`
      })

      throw new Error(
        [
          '[build-static-data] Missing required chapter story text source(s).',
          'This build is blocked to avoid publishing empty chapter blocks.',
          ...sampleLines,
        ].join('\n')
      )
    }

    const albumById = new Map(albums.map((album) => [album.id, album]))

    for (const [albumId, mappings] of chapterRefsByAlbumId) {
      const album = albumById.get(albumId)
      if (!album) {
        continue
      }

      album.chapters = mappings.map((mapping) => mapping.chapterRef)
    }

    const timelineRules = await buildTimelineRules({
      stageTable,
      albums,
      overridesFilePath: input.timelineRulesInput?.overridesFilePath,
      storylineOrderService: input.timelineRulesInput?.storylineOrderService,
    })

    const timelineItems: TimelineItem[] = buildTimelineFromCatalog({ albums }, timelineRules)
    const searchIndex = buildSearchIndex({
      locale: input.locale,
      generatedAt,
      albums,
      chapterRefsByAlbumId,
    })
    const filesWritten: string[] = []
    const manifestFiles: Record<string, string> = {}

    const catalogPath = 'catalog.json'
    const timelinePath = 'timeline.json'
    const searchIndexPath = 'search-index.json'

    await writeJsonFile(outputLocaleDir, catalogPath, { albums }, filesWritten, manifestFiles)
    await writeJsonFile(
      outputLocaleDir,
      timelinePath,
      { items: timelineItems },
      filesWritten,
      manifestFiles
    )
    await writeJsonFile(outputLocaleDir, searchIndexPath, searchIndex, filesWritten, manifestFiles)

    for (const album of albums) {
      const albumFilePath = `albums/${album.id}.json`
      await writeJsonFile(outputLocaleDir, albumFilePath, album, filesWritten, manifestFiles)
    }

    for (const [chapterId, chapter] of chapterShells) {
      const chapterFilePath = `chapters/${chapterId}.json`
      await writeJsonFile(outputLocaleDir, chapterFilePath, chapter, filesWritten, manifestFiles)
    }

    const manifest: BuildManifest = {
      schemaVersion: DATA_SCHEMA_VERSION,
      locale: input.locale,
      generatedAt,
      source,
      files: manifestFiles,
    }

    await writeJsonFile(outputLocaleDir, 'manifest.json', manifest, filesWritten, manifestFiles)

    return {
      locale: input.locale,
      schemaVersion: DATA_SCHEMA_VERSION,
      generatedAt,
      source,
      outputDir: outputLocaleDir,
      filesWritten,
      albumCount: albums.length,
      chapterCount: chapterShells.size,
      timelineCount: timelineItems.length,
      searchEntryCount: searchIndex.entries.length,
      coverAssets,
      diagnostics,
    }
  },
}

async function readStoryReviewTablePayload(inputDir: string): Promise<RawStoryReviewTablePayload> {
  const payload = await readJsonFile<unknown>(
    resolve(inputDir, 'gamedata/excel/story_review_table.json')
  )

  if (!isRecord(payload)) {
    throw new Error(
      '[build-static-data] story_review_table.json must contain object field "storyReviewTable".'
    )
  }

  const storyReviewTable = resolveStoryReviewTable(payload)
  if (storyReviewTable === undefined) {
    throw new Error(
      '[build-static-data] story_review_table.json must contain object field "storyReviewTable".'
    )
  }

  return {
    storyReviewTable,
  }
}

function resolveStoryReviewTable(
  payload: Record<string, unknown>
): RawStoryReviewTablePayload['storyReviewTable'] | undefined {
  if (isRecord(payload.storyReviewTable)) {
    return payload.storyReviewTable as RawStoryReviewTablePayload['storyReviewTable']
  }

  if (Object.keys(payload).length > 0) {
    return payload as RawStoryReviewTablePayload['storyReviewTable']
  }

  return undefined
}

async function readStoryReviewMetaTablePayload(inputDir: string): Promise<Record<string, unknown>> {
  try {
    return await readJsonFile<Record<string, unknown>>(
      resolve(inputDir, 'gamedata/excel/story_review_meta_table.json')
    )
  } catch {
    return {}
  }
}

async function readStageTableForBuild(inputDir: string): Promise<StageTableForBuild> {
  const stageTable = await readJsonFile<unknown>(
    resolve(inputDir, 'gamedata/excel/stage_table.json')
  )

  if (!isRecord(stageTable) || !isRecord(stageTable.storylineStorySets)) {
    return {
      storylineStorySets: [],
    }
  }

  const metadataByRawStorySetId = resolveStorylineGroupingMetadata(stageTable)
  const mainlineAlbumIdByRawStorySetId = resolveMainlineAlbumIds(stageTable)
  const storylineStorySets: StageTableStorylineStorySet[] = []
  const entries = Object.values(stageTable.storylineStorySets)

  for (const entry of entries) {
    if (!isRecord(entry)) {
      continue
    }

    const storySetId = toNonEmptyString(entry.storySetId)
    const storySetType = toNonEmptyString(entry.storySetType)
    const sortByYear = toFiniteNumber(entry.sortByYear)
    const sortWithinYear = toFiniteNumber(entry.sortWithinYear)
    const kvImageId = toNonEmptyString(entry.kvImageId)
    const titleImageId = toNonEmptyString(entry.titleImageId)
    const backgroundId = toNonEmptyString(entry.backgroundId)

    const mainlineData = isRecord(entry.mainlineData) ? entry.mainlineData : undefined
    const ssData = isRecord(entry.ssData) ? entry.ssData : undefined
    const collectData = isRecord(entry.collectData) ? entry.collectData : undefined

    const mainlineBackgroundId = toNonEmptyString(mainlineData?.backgroundId)
    const ssBackgroundId = toNonEmptyString(ssData?.backgroundId)
    const collectBackgroundId = toNonEmptyString(collectData?.backgroundId)
    const summary =
      toNonEmptyString(mainlineData?.desc) ??
      toNonEmptyString(ssData?.desc) ??
      toNonEmptyString(collectData?.desc)
    const tags = [
      ...readStringArray(mainlineData?.tags),
      ...readStringArray(ssData?.tags),
      ...readStringArray(collectData?.tags),
    ]
    const recommended =
      toBoolean(mainlineData?.isRecommended) ??
      toBoolean(ssData?.isRecommended) ??
      toBoolean(collectData?.isRecommended) ??
      false

    if (!storySetId || !storySetType || sortByYear === undefined || sortWithinYear === undefined) {
      continue
    }

    const metadata = metadataByRawStorySetId.get(storySetId)

    storylineStorySets.push({
      storySetId: resolveStorylineStorySetAlbumId(
        entry,
        storySetId,
        mainlineAlbumIdByRawStorySetId
      ),
      storySetType,
      sortByYear,
      sortWithinYear,
      summary,
      arcTitle: metadata?.arcTitle,
      movementTitle: metadata?.movementTitle,
      tags,
      recommended,
      kvImageId,
      titleImageId,
      backgroundId,
      mainlineBackgroundId,
      ssBackgroundId,
      collectBackgroundId,
    })
  }

  return {
    storylineStorySets,
  }
}

function resolveStorylineGroupingMetadata(
  stageTable: Record<string, unknown>
): Map<string, { arcTitle?: string; movementTitle?: string }> {
  const metadataByStorySetId = new Map<string, { arcTitle?: string; movementTitle?: string }>()
  const storylines = isRecord(stageTable.storylines) ? Object.values(stageTable.storylines) : []

  for (const storyline of storylines) {
    if (!isRecord(storyline)) {
      continue
    }

    const storylineId = toNonEmptyString(storyline.storylineId)
    const storylineName = toNonEmptyString(storyline.storylineName)
    const locations = isRecord(storyline.locations) ? Object.values(storyline.locations) : []

    if (storylineId === 'mainLine') {
      attachMainlineGroupingMetadata(locations, metadataByStorySetId)
      continue
    }

    for (const location of locations) {
      if (!isRecord(location) || toNonEmptyString(location.locationType) !== 'STORY_SET') {
        continue
      }

      const rawStorySetId = toNonEmptyString(location.relevantStorySetId)
      if (!rawStorySetId) {
        continue
      }

      metadataByStorySetId.set(rawStorySetId, {
        arcTitle: storylineName,
        movementTitle: storylineName,
      })
    }
  }

  return metadataByStorySetId
}

function resolveMainlineAlbumIds(stageTable: Record<string, unknown>): Map<string, string> {
  const albumIdByRawStorySetId = new Map<string, string>()
  const storySetEntries = isRecord(stageTable.storylineStorySets)
    ? Object.values(stageTable.storylineStorySets)
    : []

  storySetEntries
    .filter(isRecord)
    .filter((entry) => toNonEmptyString(entry.storySetType) === 'MAINLINE')
    .sort(
      (left, right) =>
        (toFiniteNumber(left.sortByYear) ?? 0) - (toFiniteNumber(right.sortByYear) ?? 0) ||
        (toFiniteNumber(left.sortWithinYear) ?? 0) - (toFiniteNumber(right.sortWithinYear) ?? 0)
    )
    .forEach((entry, index) => {
      const rawStorySetId = toNonEmptyString(entry.storySetId)
      if (rawStorySetId) {
        albumIdByRawStorySetId.set(rawStorySetId, `main_${index}`)
      }
    })

  return albumIdByRawStorySetId
}

function attachMainlineGroupingMetadata(
  locations: unknown[],
  metadataByStorySetId: Map<string, { arcTitle?: string; movementTitle?: string }>
): void {
  let currentArcTitle = '主题曲'
  const sortedLocations = locations
    .filter(isRecord)
    .sort((left, right) => (toFiniteNumber(left.sortId) ?? 0) - (toFiniteNumber(right.sortId) ?? 0))

  for (const location of sortedLocations) {
    const locationType = toNonEmptyString(location.locationType)

    if (locationType === 'MAINLINE_SPLIT') {
      const splitData = isRecord(location.mainlineSplitData) ? location.mainlineSplitData : undefined
      currentArcTitle = normalizeMainlineArcTitle(toNonEmptyString(splitData?.subName))
      continue
    }

    if (locationType !== 'STORY_SET') {
      continue
    }

    const rawStorySetId = toNonEmptyString(location.relevantStorySetId)
    if (!rawStorySetId) {
      continue
    }

    metadataByStorySetId.set(rawStorySetId, {
      arcTitle: currentArcTitle,
      movementTitle: currentArcTitle,
    })
  }
}

function normalizeMainlineArcTitle(subName: string | undefined): string {
  switch (subName) {
    case 'HOUR OF AN AWAKENING':
      return 'init. 觉醒'
    case 'SHATTER OF A VISION':
      return 'Ⅰ 幻灭'
    case 'SHADOW OF A DYING SUN':
      return 'Ⅱ 残阳'
    case 'NEXUS POINT OF FUTURE':
      return 'Ⅲ 裂变'
    default:
      return subName ?? '主题曲'
  }
}

function resolveStorylineStorySetAlbumId(
  entry: Record<string, unknown>,
  fallbackStorySetId: string,
  mainlineAlbumIdByRawStorySetId: Map<string, string>
): string {
  const storySetType = toNonEmptyString(entry.storySetType)
  const rawStorySetId = toNonEmptyString(entry.storySetId)
  const mainlineData = isRecord(entry.mainlineData) ? entry.mainlineData : undefined
  const mainlineZoneId = toNonEmptyString(mainlineData?.zoneId)
  if (mainlineZoneId) {
    return mainlineZoneId
  }

  if (storySetType === 'MAINLINE' && rawStorySetId) {
    return mainlineAlbumIdByRawStorySetId.get(rawStorySetId) ?? fallbackStorySetId
  }

  const relevantActivityId = toNonEmptyString(entry.relevantActivityId)
  if (relevantActivityId) {
    return relevantActivityId
  }

  return fallbackStorySetId
}

function resolveAlbumCover(input: {
  albumId: string
  albumTitle: string | undefined
  storySet: StageTableStorylineStorySet | undefined
  reviewEntry: RawStoryReviewTablePayload['storyReviewTable'][string]
}): StoryAlbumCover {
  const kvImageId = toNonEmptyString(input.storySet?.kvImageId)
  const titleImageId = toNonEmptyString(input.storySet?.titleImageId)
  const storyEntryPicId = toNonEmptyString(input.reviewEntry.storyEntryPicId)
  const storyPicId = toNonEmptyString(input.reviewEntry.storyPicId)

  const nestedBackgroundId =
    toNonEmptyString(input.storySet?.mainlineBackgroundId) ??
    toNonEmptyString(input.storySet?.ssBackgroundId) ??
    toNonEmptyString(input.storySet?.collectBackgroundId)
  const backgroundImageId = nestedBackgroundId ?? toNonEmptyString(input.storySet?.backgroundId)
  const prtsCoverUrl = buildPrtsAlbumCoverUrl(input.albumId, input.albumTitle)

  if (kvImageId) {
    return {
      primaryImageId: kvImageId,
      titleImageId,
      backgroundImageId,
      storyEntryPicId,
      storyPicId,
      url: prtsCoverUrl,
      source: 'stage-kv',
      assetStatus: 'missing',
    }
  }

  if (storyEntryPicId) {
    return {
      primaryImageId: storyEntryPicId,
      titleImageId,
      backgroundImageId,
      storyEntryPicId,
      storyPicId,
      url: prtsCoverUrl,
      source: 'review-entry-pic',
      assetStatus: 'missing',
    }
  }

  if (storyPicId) {
    return {
      primaryImageId: storyPicId,
      titleImageId,
      backgroundImageId,
      storyEntryPicId,
      storyPicId,
      url: prtsCoverUrl,
      source: 'review-story-pic',
      assetStatus: 'missing',
    }
  }

  if (backgroundImageId) {
    return {
      primaryImageId: backgroundImageId,
      titleImageId,
      backgroundImageId,
      storyEntryPicId,
      storyPicId,
      url: prtsCoverUrl,
      source: 'stage-background',
      assetStatus: 'missing',
    }
  }

  return {
    titleImageId,
    storyEntryPicId,
    storyPicId,
    url: prtsCoverUrl,
    source: 'none',
    assetStatus: 'missing',
  }
}

function buildStoryAlbumMusicMetadata(
  albumTitle: string,
  storySet: StageTableStorylineStorySet
): StoryAlbumMusicMetadata {
  return {
    movementTitle: storySet.movementTitle ?? storySet.arcTitle ?? albumTitle,
    arcTitle: storySet.arcTitle,
    tags: storySet.tags,
    recommended: storySet.recommended,
    sourcePage: 'stage_table.storylineStorySets',
  }
}

function buildPrtsAlbumCoverUrl(albumId: string, albumTitle: string | undefined): string | undefined {
  const coverFileName = buildPrtsAlbumCoverFileName(albumId, albumTitle)
  if (!coverFileName) {
    return undefined
  }

  const hash = createHash('md5').update(coverFileName).digest('hex')
  return `https://media.prts.wiki/${hash[0]}/${hash.slice(0, 2)}/${encodeURIComponent(coverFileName)}`
}

function buildPrtsAlbumCoverFileName(
  albumId: string,
  albumTitle: string | undefined
): string | undefined {
  const mainlineMatch = albumId.match(/^main_(\d+)$/)
  if (mainlineMatch) {
    const episodeIndex = Number(mainlineMatch[1])
    const episodeName = episodeIndex === 0 ? '序章' : `第${toChineseEpisodeNumber(episodeIndex)}章`
    return `章节名称_${episodeName}.png`
  }

  const title = toNonEmptyString(albumTitle)
  return title ? `活动图标_${title}.png` : undefined
}

function toChineseEpisodeNumber(value: number): string {
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  if (value <= 10) {
    return value === 10 ? '十' : digits[value]!
  }

  if (value < 20) {
    return `十${digits[value % 10]}`
  }

  const tens = Math.floor(value / 10)
  const ones = value % 10
  return `${digits[tens]}十${ones === 0 ? '' : digits[ones]}`
}

async function syncAlbumCoverAssets(input: {
  locale: string
  albums: ReturnType<typeof mapReviewEntryToAlbum>[]
  provider: AssetSourceProvider
  outputDir: string
}): Promise<CoverAssetBuildStats> {
  const placeholderPath = await ensureCoverPlaceholder(input.outputDir, input.locale)
  let syncedCount = 0
  let missingCount = 0
  let disabledCount = 0

  for (const album of input.albums) {
    const cover = album.cover ?? {
      source: 'none',
      assetStatus: 'missing',
    }

    if (!cover.primaryImageId) {
      album.cover = {
        ...cover,
        assetPath: placeholderPath,
        assetStatus: 'missing',
      }
      missingCount += 1
      continue
    }

    const syncResult = await input.provider.syncCoverAsset({
      locale: input.locale,
      imageId: cover.primaryImageId,
      targetFileName: `${sanitizeFileSegment(album.id)}-cover`,
      outputDir: input.outputDir,
    })

    if (syncResult.status === 'ready' && syncResult.assetPath) {
      album.cover = {
        ...cover,
        assetPath: syncResult.assetPath,
        width: syncResult.width,
        height: syncResult.height,
        assetStatus: 'ready',
      }
      syncedCount += 1
      continue
    }

    const resolvedStatus = syncResult.status === 'disabled' ? 'disabled' : 'missing'
    album.cover = {
      ...cover,
      assetPath: placeholderPath,
      assetStatus: resolvedStatus,
    }

    if (resolvedStatus === 'disabled') {
      disabledCount += 1
    } else {
      missingCount += 1
    }
  }

  return {
    providerId: input.provider.id,
    mode: input.provider.mode,
    syncedCount,
    missingCount,
    disabledCount,
    placeholderPath,
  }
}

async function ensureCoverPlaceholder(outputDir: string, locale: string): Promise<string> {
  const localeDir = join(resolve(outputDir), locale)
  const fileName = 'placeholder.svg'
  const filePath = join(localeDir, fileName)

  await mkdir(localeDir, { recursive: true })
  await writeFile(filePath, buildCoverPlaceholderSvg(), 'utf8')

  return `/assets/covers/${locale}/${fileName}`
}

function buildCoverPlaceholderSvg(): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" role="img" aria-label="cover placeholder">',
    '<defs>',
    '<linearGradient id="coverPlaceholderGradient" x1="0" y1="0" x2="1" y2="1">',
    '<stop offset="0%" stop-color="#e2e8f0"/>',
    '<stop offset="100%" stop-color="#cbd5e1"/>',
    '</linearGradient>',
    '</defs>',
    '<rect width="800" height="450" fill="url(#coverPlaceholderGradient)"/>',
    '<rect x="34" y="34" width="732" height="382" fill="none" stroke="#94a3b8" stroke-width="6" stroke-dasharray="16 12"/>',
    '<text x="400" y="228" text-anchor="middle" fill="#475569" font-size="36" font-family="sans-serif">Cover Unavailable</text>',
    '</svg>',
    '',
  ].join('\n')
}

function sanitizeFileSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, '_')
}

function buildChapterShell(input: {
  albumId: string
  chapterId: string
  chapterTitle: string
  chapterCode?: string
  chapterAvgTag?: string
  chapterSummary?: string
  chapterContentSource?: ReturnType<typeof mapReviewStoryToChapter>['contentSource']
}): GeneratedChapterShell {
  return {
    id: input.chapterId,
    albumId: input.albumId,
    title: input.chapterTitle,
    subtitle: input.chapterCode,
    code: input.chapterCode,
    avgTag: input.chapterAvgTag,
    summary: input.chapterSummary,
    contentSource: input.chapterContentSource,
    navigation: {
      previousChapterId: null,
      nextChapterId: null,
    },
    blocks: [],
    citations: [],
  }
}

function updateChapterNavigation(
  mappings: AlbumChapterMapping[],
  chapterShells: Map<string, GeneratedChapterShell>
): void {
  for (let index = 0; index < mappings.length; index += 1) {
    const currentChapterId = mappings[index]?.chapterRef.id
    if (!currentChapterId) {
      continue
    }

    const shell = chapterShells.get(currentChapterId)
    if (!shell) {
      continue
    }

    const previousChapterId = mappings[index - 1]?.chapterRef.id ?? null
    const nextChapterId = mappings[index + 1]?.chapterRef.id ?? null

    chapterShells.set(currentChapterId, {
      ...shell,
      navigation: {
        previousChapterId,
        nextChapterId,
      },
    })
  }
}

function buildSearchIndex(input: {
  locale: string
  generatedAt: string
  albums: ReturnType<typeof mapReviewEntryToAlbum>[]
  chapterRefsByAlbumId: Map<string, AlbumChapterMapping[]>
}): SearchIndex {
  const entries: SearchIndexEntry[] = []

  const sortedAlbums = [...input.albums].sort((left, right) => {
    if (left.timelineRank !== right.timelineRank) {
      return left.timelineRank - right.timelineRank
    }

    return left.id.localeCompare(right.id)
  })

  for (const album of sortedAlbums) {
    const albumAliases = compactStrings([
      album.title,
      album.id,
      album.slug,
      album.summary,
      album.music?.movementTitle,
      album.music?.arcTitle,
      ...(album.music?.tags ?? []),
    ])

    entries.push({
      id: `album:${album.id}`,
      kind: 'album',
      locale: input.locale,
      displayTitle: album.title,
      displaySecondary: album.id,
      albumId: album.id,
      albumTitle: album.title,
      type: album.albumKind,
      homeSection: album.homeSection,
      sortIndex: normalizeSortIndex(album.gameOrderRank ?? album.timelineRank),
      match: {
        title: album.title,
        albumTitle: album.title,
        aliases: albumAliases,
        tokens: buildSearchTokens(albumAliases),
        exactIds: compactStrings([album.id]),
      },
      target: {
        route: 'album',
        albumId: album.id,
      },
    })

    const chapterMappings = input.chapterRefsByAlbumId.get(album.id) ?? []
    for (const mapping of chapterMappings) {
      const chapterDisplayTitle = buildChapterSearchDisplayTitle(
        mapping.chapterRef.code,
        mapping.chapterRef.title
      )
      const chapterAliases = compactStrings([
        chapterDisplayTitle,
        mapping.chapterRef.title,
        mapping.chapterRef.code,
        mapping.chapterRef.avgTag,
        mapping.chapterRef.id,
      ])

      entries.push({
        id: `chapter:${mapping.chapterRef.id}`,
        kind: 'chapter',
        locale: input.locale,
        displayTitle: chapterDisplayTitle,
        displaySecondary: album.title,
        albumId: album.id,
        albumTitle: album.title,
        chapterId: mapping.chapterRef.id,
        chapterTitle: mapping.chapterRef.title,
        stageCode: mapping.chapterRef.code,
        type: album.albumKind,
        homeSection: album.homeSection,
        sortIndex: mapping.chapterRef.sort,
        match: {
          title: chapterDisplayTitle,
          albumTitle: album.title,
          chapterTitle: mapping.chapterRef.title,
          stageCode: mapping.chapterRef.code,
          aliases: chapterAliases,
          tokens: buildSearchTokens(chapterAliases),
          exactIds: compactStrings([mapping.chapterRef.id, mapping.chapterRef.code]),
        },
        target: {
          route: 'chapter',
          albumId: album.id,
          chapterId: mapping.chapterRef.id,
        },
      })

      const stageIds = readStageIds(mapping.story.requiredStages)
      for (const stageId of stageIds) {
        const stageDisplayTitle = chapterDisplayTitle
        const stageAliases = compactStrings([
          stageDisplayTitle,
          stageId,
          mapping.chapterRef.code,
          mapping.chapterRef.title,
          album.title,
        ])

        entries.push({
          id: `stage:${mapping.chapterRef.id}:${stageId}`,
          kind: 'stage',
          locale: input.locale,
          displayTitle: stageDisplayTitle,
          displaySecondary: compactStrings([album.title, stageId]).join(' · '),
          albumId: album.id,
          albumTitle: album.title,
          chapterId: mapping.chapterRef.id,
          chapterTitle: mapping.chapterRef.title,
          stageId,
          stageCode: mapping.chapterRef.code,
          type: album.albumKind,
          homeSection: album.homeSection,
          sortIndex: mapping.chapterRef.sort,
          match: {
            title: stageDisplayTitle,
            albumTitle: album.title,
            chapterTitle: mapping.chapterRef.title,
            stageId,
            stageCode: mapping.chapterRef.code,
            aliases: stageAliases,
            tokens: buildSearchTokens(stageAliases),
            exactIds: compactStrings([stageId, mapping.chapterRef.id, mapping.chapterRef.code]),
          },
          target: {
            route: 'chapter',
            albumId: album.id,
            chapterId: mapping.chapterRef.id,
          },
        })
      }
    }
  }

  return {
    generatedAt: input.generatedAt,
    locale: input.locale,
    entries,
  }
}

function buildChapterSearchDisplayTitle(
  chapterCode: string | undefined,
  chapterTitle: string | undefined
): string {
  const code = toNonEmptyString(chapterCode)
  const title = toNonEmptyString(chapterTitle)

  if (code && title) {
    return `${code} ${title}`
  }

  return title ?? code ?? 'Untitled chapter'
}

function readStageIds(requiredStages: RawInfoUnlockData['requiredStages']): string[] {
  if (!Array.isArray(requiredStages)) {
    return []
  }

  const stageIds = new Set<string>()

  for (const stage of requiredStages) {
    const stageId = toNonEmptyString(stage?.stageId)
    if (stageId) {
      stageIds.add(stageId)
    }
  }

  return [...stageIds].sort((left, right) => left.localeCompare(right))
}

function buildSearchTokens(input: string[]): string[] {
  const tokens = new Set<string>()

  for (const value of input) {
    const normalized = normalizeSearchText(value)
    if (!normalized) {
      continue
    }

    tokens.add(normalized)
    for (const token of normalized.split(/\s+/)) {
      const trimmed = token.trim()
      if (trimmed) {
        tokens.add(trimmed)
      }
    }
  }

  return [...tokens].sort((left, right) => left.localeCompare(right))
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactStrings(values: Array<string | undefined>): string[] {
  const set = new Set<string>()

  for (const value of values) {
    const normalized = toNonEmptyString(value)
    if (normalized) {
      set.add(normalized)
    }
  }

  return [...set].sort((left, right) => left.localeCompare(right))
}

function normalizeSortIndex(value: number): number {
  if (!Number.isFinite(value)) {
    return Number.MAX_SAFE_INTEGER
  }

  return value
}

async function resolveSourceRevisionFromInputDir(inputDir: string): Promise<SourceRevision> {
  const syncReportPath = resolve(inputDir, 'sync-report.json')

  try {
    const report = await readJsonFile<RawSyncReport>(syncReportPath)
    const providerId = toNonEmptyString(report.providerId) ?? 'unknown-provider'
    const commitSha = toNonEmptyString(report.revision) ?? inferRevisionFromInputPath(inputDir)

    return {
      providerId,
      commitSha,
    }
  } catch {
    return {
      providerId: 'unknown-provider',
      commitSha: inferRevisionFromInputPath(inputDir),
    }
  }
}

function inferRevisionFromInputPath(inputDir: string): string {
  const normalized = resolve(inputDir)
  const pathSegments = normalized.split('/').filter(Boolean)
  const candidate = pathSegments[pathSegments.length - 1]
  return candidate ? candidate : 'unknown-revision'
}

async function writeJsonFile(
  baseDir: string,
  relativePath: string,
  value: unknown,
  filesWritten: string[],
  manifestFiles: Record<string, string>
): Promise<void> {
  const targetPath = join(baseDir, relativePath)
  await mkdir(dirname(targetPath), { recursive: true })

  const serialized = `${JSON.stringify(value, null, 2)}\n`
  await writeFile(targetPath, serialized, 'utf8')

  filesWritten.push(relativePath)
  manifestFiles[relativePath] = checksum(serialized)
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const text = await readFile(filePath, 'utf8')
  return JSON.parse(text) as T
}

function checksum(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function asRawInfoUnlockDataArray(value: unknown): RawInfoUnlockData[] {
  if (!Array.isArray(value)) {
    return []
  }

  const items: RawInfoUnlockData[] = []

  for (const item of value) {
    if (isRecord(item)) {
      items.push(item as RawInfoUnlockData)
    }
  }

  return items
}

function shouldBuildAlbumEntry(
  entry: RawStoryReviewTablePayload['storyReviewTable'][string]
): boolean {
  const albumKind = toNonEmptyString(entry.albumKind)

  if (albumKind !== 'NONE') {
    return true
  }

  const stories = asRawInfoUnlockDataArray(entry.infoUnlockDatas)
  return stories.some((story) => toNonEmptyString(story.storyTxt) !== undefined)
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  return undefined
}

function toBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => toNonEmptyString(item))
    .filter((item): item is string => item !== undefined)
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export async function listBuiltDataFiles(outputLocaleDir: string): Promise<string[]> {
  const files = await walkFiles(outputLocaleDir, outputLocaleDir)
  return files.sort((left, right) => left.localeCompare(right))
}

async function walkFiles(rootDir: string, currentDir: string): Promise<string[]> {
  const dirEntries = await readdir(currentDir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of dirEntries) {
    const absolutePath = join(currentDir, entry.name)

    if (entry.isDirectory()) {
      const nestedFiles = await walkFiles(rootDir, absolutePath)
      files.push(...nestedFiles)
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    files.push(absolutePath.slice(rootDir.length + 1).replace(/\\/g, '/'))
  }

  return files
}
