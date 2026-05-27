import { useQuery, useQueryClient } from '@tanstack/react-query'
import { pinyin } from 'pinyin-pro'
import {
  Button,
  Card,
  Checkbox,
  Col,
  Divider,
  Drawer,
  Input,
  List,
  Menu,
  Row,
  Select,
  Space,
  Tag,
  Tree,
  Typography,
} from 'antd'
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import type { DataNode, TreeProps } from 'antd/es/tree'
import { useHeaderDownloadAction } from '../../components/layout/header-download-action'
import { EmptyState } from '../../components/states/empty-state'
import { ErrorState } from '../../components/states/error-state'
import { LoadingState } from '../../components/states/loading-state'
import { createOperatorAlbum } from '../../domain/album/album-factory'
import type { ExportFileMode, ExportFormat } from '../../domain/export/export-format'
import type { ExportArtifact } from '../../domain/export/export-renderer'
import { calculateAlbumProgressPercent } from '../../domain/progress/album-progress'
import { applyDoctorName } from '../../domain/story/doctor-name'
import {
  ReaderService,
  adaptRuntimeContentToStaticChapter,
} from '../../features/reader/reader-service'
import { PrtsStoryResourceLoader } from '../../features/reader/runtime/story-resource-loader'
import { StoryRelatedRefRenderer } from '../../features/reader/runtime/reader-renderers'
import { getReadableStoryBlocks } from '../../features/reader/readable-story-blocks'
import type { SearchResultItem } from '../../features/search/search-service'
import { getSharedSearchService } from '../../features/search/shared-search-service'
import { StaticStoryRepository } from '../../infrastructure/storage/static-story-repository'
import type {
  StaticChapterData,
  StaticKnowledgeRelatedItem,
  StaticOperatorArchiveData,
  StaticOperatorConfidentialData,
  StaticOperatorIndexData,
  StaticOperatorModuleData,
  StaticOperatorModulesData,
  StaticTerraHistoricusComicData,
  StaticAlbumData,
} from '../../infrastructure/storage/static-story-repository'
import { useAppSettingsStore } from '../../infrastructure/storage/use-app-settings-store'
import { useReadingProgressStore } from '../../infrastructure/storage/use-reading-progress-store'
import {
  HomeAlbumGroups,
  OperatorTopologyGroups,
  ProgressiveImageFrame,
} from '../components/home-cards'
import {
  getCoverAspectRatio,
  getAlbumCardGroupTitle,
  isHomeAlbumSectionKey,
  resolveCoverImageSource,
  resolveMusicClassificationTag,
  type OperatorGroupViewModel,
  type OperatorTopologyViewModel,
  type AlbumCardGroup,
  type TimelineCardViewModel,
} from '../components/home-card-utils'
import { fetchRemoteSearchResults } from '../search-remote'
import type { AppLocale } from '../i18n'

export interface PageProps {
  locale: AppLocale
}

export interface AlbumBreadcrumbSync {
  onAlbumResolved: (albumTitle: string) => void
}

export interface ReaderBreadcrumbSync extends AlbumBreadcrumbSync {
  onChapterResolved: (chapterTitle: string) => void
}

type HomeSectionKey = 'mainline' | 'sideStory' | 'otherStory' | 'operatorRecord' | 'terraHistoricus'

interface ArchiveSectionViewModel {
  id: string
  title: string
  condition?: string
  paragraphs: string[]
}

type OperatorDetailMenuItem =
  | {
      key: string
      kind: 'archive'
      label: string
    }
  | {
      key: string
      kind: 'module'
      label: string
      module: StaticOperatorModuleData
    }
  | {
      key: string
      kind: 'confidential'
      label: string
      record: StaticOperatorConfidentialData['records'][number]
    }

type ReaderBlock = StaticChapterData['blocks'][number]
type ReaderChoiceBlockData = Extract<ReaderBlock, { type: 'choice' }>
type ReaderChoiceBranch = NonNullable<ReaderChoiceBlockData['branches']>[number]

interface ReaderSequenceRenderResult {
  items: ReaderFlowItem[]
  blocked: boolean
}

type ReaderFlowKind = 'dialogue' | 'narration' | 'doctor' | 'visual' | 'choice' | 'divider'

interface ReaderFlowItem {
  key: string
  kind: ReaderFlowKind
  node: ReactNode
}

interface ReaderKnowledgeInlineMarker {
  number: number
  anchorId: string
}

const ACESHIP_AVG_IMAGE_BASE_URL = 'https://raw.githubusercontent.com/Aceship/Arknight-Images/main'

const VISUAL_CUE_IMAGE_COMPLETE_CHECK_DELAY_MS = 250
const VISUAL_CUE_IMAGE_LOAD_TIMEOUT_MS = 1500
const VISUAL_CUE_IMAGE_INTERSECTION_ROOT_MARGIN = '800px 0px'
const READER_VISUAL_IMAGE_LOADING_TEXT = '正在从资料源下载图片...'
const READER_VISUAL_IMAGE_HIDE_PROGRESS = 30

function buildLocaleHomePath(locale: AppLocale): string {
  return `/${locale}`
}

function toDisplayType(value: string): string {
  if (value === 'mainline') {
    return '主题曲'
  }

  if (value === 'intermezzi') {
    return 'SideStory'
  }

  if (value === 'sideStory') {
    return 'SideStory'
  }

  if (value === 'sideStory') {
    return 'SideStory'
  }

  if (value === 'otherStory') {
    return '附加档案'
  }

  if (value === 'operatorRecord') {
    return '干员'
  }

  if (value === 'terraHistoricus') {
    return '泰拉记事社'
  }

  if (value === 'sidestory') {
    return 'SideStory'
  }

  return value
}

function normalizeAlbumKind(albumId: string, albumKind: string): string {
  if (isMainlineAlbumId(albumId)) {
    return 'mainline'
  }

  if (albumKind === 'sidestory') {
    return 'intermezzi'
  }

  return albumKind
}

function renderMaybeCitedText(content: string, hasCitation: boolean): ReactNode {
  return hasCitation ? <u>{content}</u> : content
}

function renderReaderTextWithKnowledgeMarkers(
  content: string,
  hasCitation: boolean,
  knowledgeMarkers: ReaderKnowledgeInlineMarker[]
): ReactNode {
  const renderedText = renderMaybeCitedText(content, hasCitation)

  if (knowledgeMarkers.length === 0) {
    return renderedText
  }

  return (
    <>
      {renderedText}
      <span className="reader-knowledge-inline-markers" aria-label="相关篇章索引">
        {knowledgeMarkers.map((marker) => (
          <a href={`#${marker.anchorId}`} key={marker.anchorId}>
            [{marker.number}]
          </a>
        ))}
      </span>
    </>
  )
}

function toReaderDisplayText(content: string, doctorName?: string | null): string {
  return applyDoctorName(content, doctorName)
}

function isDoctorSpeaker(speaker: string): boolean {
  const normalizedSpeaker = speaker.trim().toLowerCase()

  return (
    normalizedSpeaker.includes('博士') ||
    normalizedSpeaker.includes('doctor') ||
    normalizedSpeaker.includes('dr.') ||
    normalizedSpeaker.includes('dr{@nickname}') ||
    normalizedSpeaker.includes('dr.{@nickname}') ||
    normalizedSpeaker.includes('{@nickname}')
  )
}

function buildAlbumPath(locale: AppLocale, albumId: string): string {
  return `/${locale}/albums/${albumId}`
}

function buildReadPath(locale: AppLocale, albumId: string, chapterId: string): string {
  return `/${locale}/read/${albumId}/${chapterId}`
}

function buildSearchPath(locale: AppLocale, keyword = '', type = 'all'): string {
  const params = new URLSearchParams()

  if (keyword.trim().length > 0) {
    params.set('q', keyword.trim())
  }

  if (type !== 'all') {
    params.set('type', type)
  }

  const query = params.toString()
  return query.length > 0 ? `/${locale}/search?${query}` : `/${locale}/search`
}

function buildOperatorDetailPath(locale: AppLocale, operatorSlug: string): string {
  return `/${locale}/operators/${operatorSlug}`
}

function buildOperatorTopologyItems(
  operatorIndex: StaticOperatorIndexData,
  locale: AppLocale
): OperatorTopologyViewModel[] {
  return operatorIndex.operators.map((operator) => ({
    id: operator.slug,
    name: operator.name,
    slug: operator.slug,
    detailPath: buildOperatorDetailPath(locale, operator.slug),
  }))
}

function buildFallbackOperatorTopologyItems(
  items: TimelineCardViewModel[],
  locale: AppLocale
): OperatorTopologyViewModel[] {
  return items.map((item) => ({
    id: item.albumId,
    name: item.title,
    slug: item.slug,
    detailPath: buildOperatorDetailPath(locale, item.slug),
  }))
}

const OPERATOR_SPECIAL_GROUP_KEY = '#'

function groupOperatorTopologyItems(items: OperatorTopologyViewModel[]): OperatorGroupViewModel[] {
  const groups = new Map<string, OperatorTopologyViewModel[]>()

  for (const item of items) {
    const key = getOperatorInitialGroup(item.name)
    groups.set(key, [...(groups.get(key) ?? []), item])
  }

  return [...groups.entries()]
    .sort(([left], [right]) => compareOperatorGroupKey(left, right))
    .map(([key, groupItems]) => ({
      key,
      label: key,
      items: [...groupItems].sort(compareOperatorName),
    }))
}

function compareOperatorGroupKey(left: string, right: string): number {
  if (left === right) {
    return 0
  }

  if (left === OPERATOR_SPECIAL_GROUP_KEY) {
    return 1
  }

  if (right === OPERATOR_SPECIAL_GROUP_KEY) {
    return -1
  }

  return left.localeCompare(right, 'en', { sensitivity: 'base' })
}

function compareOperatorName(left: OperatorTopologyViewModel, right: OperatorTopologyViewModel) {
  const leftKey = buildOperatorSortKey(left.name)
  const rightKey = buildOperatorSortKey(right.name)
  const keyOrder = leftKey.localeCompare(rightKey, 'en', { sensitivity: 'base' })

  if (keyOrder !== 0) {
    return keyOrder
  }

  return left.name.localeCompare(right.name, 'zh-Hans-CN', { sensitivity: 'base' })
}

function getOperatorInitialGroup(name: string): string {
  const firstInitial = getOperatorNameInitials(name)[0]

  if (firstInitial && isAsciiLetter(firstInitial)) {
    return firstInitial.toUpperCase()
  }

  return OPERATOR_SPECIAL_GROUP_KEY
}

function buildOperatorSortKey(name: string): string {
  return getOperatorNameInitials(name)
    .map((initial) => (isAsciiLetter(initial) ? `0${initial.toLowerCase()}` : `1${initial}`))
    .join('')
}

function getOperatorNameInitials(name: string): string[] {
  return Array.from(name.trim()).map(getOperatorCharacterInitial)
}

function getOperatorCharacterInitial(character: string): string {
  if (isAsciiLetter(character)) {
    return character.toLowerCase()
  }

  if (!character.trim() || isAsciiDigit(character)) {
    return OPERATOR_SPECIAL_GROUP_KEY
  }

  const [initial] = pinyin(character, {
    pattern: 'first',
    toneType: 'none',
    type: 'array',
  })

  return initial && isAsciiLetter(initial) ? initial.toLowerCase() : OPERATOR_SPECIAL_GROUP_KEY
}

function isAsciiLetter(value: string): boolean {
  return /^[a-z]$/i.test(value)
}

function isAsciiDigit(value: string): boolean {
  return /^[0-9]$/.test(value)
}

function getVisualCueImage(
  block: ReaderBlock
): { urls: string[]; alt: string; label: string } | null {
  if (block.type !== 'backgroundCue' && block.type !== 'imageCue') {
    return null
  }

  const urls = uniqueNonEmptyStrings([
    block.localPath,
    block.sourceUrl,
    ...buildVisualCueFallbackUrls(block),
  ])

  if (block.type === 'backgroundCue') {
    const sourceId = block.sourceImageId?.trim()

    return {
      urls,
      alt: '剧情背景',
      label: sourceId ? `BACKGROUND · ${sourceId.toUpperCase()}` : 'BACKGROUND',
    }
  }

  const imageId = block.imageId?.trim()

  return {
    urls,
    alt: block.imageId ? `剧情插图 ${block.imageId}` : '剧情插图',
    label: imageId ? `IMAGE · ${imageId.toUpperCase()}` : 'IMAGE',
  }
}

function buildVisualCueFallbackUrls(
  block: Extract<ReaderBlock, { type: 'backgroundCue' | 'imageCue' }>
): string[] {
  const sourceId = block.type === 'backgroundCue' ? block.sourceImageId : block.imageId
  const normalizedSourceId = sourceId?.trim()
  const directories =
    block.type === 'backgroundCue'
      ? ['avg/backgrounds', 'avg/images', 'smallavg/backgrounds', 'smallavg/images']
      : ['avg/images', 'avg/backgrounds', 'smallavg/images', 'smallavg/backgrounds']

  const sourceSpecificUrls = normalizedSourceId
    ? directories.map((directory) => buildAceshipAvgImageUrl(directory, normalizedSourceId))
    : []

  return sourceSpecificUrls
}

function buildAceshipAvgImageUrl(directory: string, imageId: string): string {
  const normalized = imageId.trim().replace(/\.(png|jpe?g|webp)$/i, '')

  return `${ACESHIP_AVG_IMAGE_BASE_URL}/${directory}/${encodeURIComponent(normalized)}.png`
}

function uniqueNonEmptyStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim() ?? '')
        .filter((value): value is string => value.length > 0)
    )
  )
}

function getVisualCueDedupeKey(block: ReaderBlock): string | null {
  if (block.type !== 'backgroundCue' && block.type !== 'imageCue') {
    return null
  }

  if (block.type === 'backgroundCue') {
    return block.localPath ?? block.assetId ?? block.sourceImageId ?? block.id
  }

  return block.localPath ?? block.assetId ?? block.imageId ?? block.id
}

function dedupeConsecutiveVisualCues(blocks: readonly ReaderBlock[]): ReaderBlock[] {
  const result: ReaderBlock[] = []
  let previousVisualCueKey: string | null = null

  for (const block of blocks) {
    if (block.type === 'backgroundCue' || block.type === 'imageCue') {
      const visualCueKey = getVisualCueDedupeKey(block)

      if (visualCueKey && visualCueKey === previousVisualCueKey) {
        continue
      }

      previousVisualCueKey = visualCueKey
      result.push(block)
      continue
    }

    previousVisualCueKey = null
    result.push(block)
  }

  return result
}

function toDisplayMultilineText(value: string): string {
  return value
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
}

function toParagraphs(value: string): string[] {
  return toDisplayMultilineText(value)
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function buildArchiveSections(
  profile: StaticOperatorArchiveData['profile']
): ArchiveSectionViewModel[] {
  const sectionIndexSet = new Set<number>()

  for (const key of Object.keys(profile)) {
    const match = key.match(/^档案(\d+)(?:文本|条件)?$/)
    if (match) {
      sectionIndexSet.add(Number.parseInt(match[1] ?? '0', 10))
    }
  }

  return Array.from(sectionIndexSet)
    .filter((index) => Number.isFinite(index) && index > 0)
    .sort((left, right) => left - right)
    .map((index) => {
      const title = profile[`档案${index}`] ?? `档案${index}`
      const condition = profile[`档案${index}条件`]
      const content = profile[`档案${index}文本`] ?? ''

      return {
        id: `archive-section-${index}`,
        title,
        condition,
        paragraphs: toParagraphs(content),
      }
    })
    .filter((section) => section.paragraphs.length > 0)
}

function buildArchiveCoreEntries(
  profile: StaticOperatorArchiveData['profile']
): Array<[string, string]> {
  return Object.entries(profile).filter(([key, value]) => {
    if (key.match(/^档案\d+(?:文本|条件)?$/)) {
      return false
    }

    return typeof value === 'string' && value.trim().length > 0
  })
}

function getModuleBasicInfoContent(module: StaticOperatorModuleData): string | null {
  const exact = module.fields['基础信息']
  if (typeof exact === 'string' && exact.trim().length > 0) {
    return toDisplayMultilineText(exact).trim()
  }

  const fallbackEntry = Object.entries(module.fields).find(([key, value]) => {
    return key.includes('基础信息') && typeof value === 'string' && value.trim().length > 0
  })

  if (!fallbackEntry) {
    return null
  }

  return toDisplayMultilineText(fallbackEntry[1]).trim()
}

function buildOperatorDetailMenuItems(
  archive: StaticOperatorArchiveData,
  modules: StaticOperatorModulesData,
  confidential: StaticOperatorConfidentialData
): OperatorDetailMenuItem[] {
  const items: OperatorDetailMenuItem[] = []

  if (Object.keys(archive.profile).length > 0) {
    items.push({ key: 'archive', kind: 'archive', label: '档案' })
  }

  for (const module of modules.modules) {
    items.push({
      key: `module:${module.id}`,
      kind: 'module',
      label: `模组 · ${module.name}`,
      module,
    })
  }

  for (const record of confidential.records) {
    if (!record.contentSource?.url) {
      continue
    }

    items.push({
      key: `confidential:${record.id}`,
      kind: 'confidential',
      label: `秘录 · ${record.title || record.slug}`,
      record,
    })
  }

  return items
}

function isHiddenCueInlineText(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  const compactText = value.trim().replace(/\s+/g, '')

  if (/^第[零〇一二三四五六七八九十百千万\d]+关[（(](?:前|后)[）)]$/.test(compactText)) {
    return true
  }

  return (
    normalized === '[dialog]' ||
    normalized === '[charslot]' ||
    normalized === '[stopmusic]' ||
    normalized === '[playmusic]'
  )
}

function ReaderBlockItem({
  block,
  chapterCitations,
  depth,
  doctorName,
  knowledgeMarkersByBlock,
}: {
  block: StaticChapterData['blocks'][number]
  chapterCitations: StaticChapterData['citations']
  depth: number
  doctorName?: string | null
  knowledgeMarkersByBlock?: Map<string, ReaderKnowledgeInlineMarker[]>
}): ReaderFlowItem | null {
  const hasCitation = chapterCitations.some((citation) => citation.blockId === block.id)
  const knowledgeMarkers = knowledgeMarkersByBlock?.get(block.id) ?? []
  const lineClassName = knowledgeMarkers.length > 0 ? 'reader-line-with-knowledge' : undefined

  if (block.type === 'dialogue') {
    const key = `${depth}:${block.id}`
    const speaker = toReaderDisplayText(block.speaker, doctorName)
    const text = toReaderDisplayText(block.text, doctorName)

    if (isHiddenCueInlineText(text)) {
      return null
    }

    if (isDoctorSpeaker(block.speaker)) {
      return {
        key,
        kind: 'doctor',
        node: (
          <Typography.Paragraph
            className={['reader-doctor-line', lineClassName].filter(Boolean).join(' ')}
            style={{ fontStyle: 'italic', textAlign: 'center' }}
          >
            {renderReaderTextWithKnowledgeMarkers(text, hasCitation, knowledgeMarkers)}
          </Typography.Paragraph>
        ),
      }
    }

    return {
      key,
      kind: 'dialogue',
      node: (
        <div className="reader-dialogue">
          <Typography.Text className="reader-speaker" style={{ textAlign: 'right' }}>
            {speaker}
          </Typography.Text>
          <Typography.Paragraph
            className={lineClassName}
            style={{ marginBottom: 0, textAlign: 'left' }}
          >
            {renderReaderTextWithKnowledgeMarkers(text, hasCitation, knowledgeMarkers)}
          </Typography.Paragraph>
        </div>
      ),
    }
  }

  if (block.type === 'narration') {
    const text = toReaderDisplayText(block.text, doctorName)
    if (isHiddenCueInlineText(text)) {
      return null
    }

    return {
      key: `${depth}:${block.id}`,
      kind: 'narration',
      node: (
        <Typography.Paragraph
          className={['reader-narration', lineClassName].filter(Boolean).join(' ')}
        >
          {renderReaderTextWithKnowledgeMarkers(text, hasCitation, knowledgeMarkers)}
        </Typography.Paragraph>
      ),
    }
  }

  if (block.type === 'backgroundCue' || block.type === 'imageCue') {
    const image = getVisualCueImage(block)

    if (!image) {
      return null
    }

    return {
      key: `${depth}:${block.id}`,
      kind: 'visual',
      node: <ReaderVisualCueImage image={image} />,
    }
  }

  if (block.type === 'choice') {
    return {
      key: `${depth}:${block.id}`,
      kind: 'choice',
      node: (
        <ReaderChoiceBlock
          block={block}
          chapterCitations={chapterCitations}
          doctorName={doctorName}
          knowledgeMarkersByBlock={knowledgeMarkersByBlock}
        />
      ),
    }
  }

  if (block.type === 'sectionBreak') {
    return {
      key: `${depth}:${block.id}`,
      kind: 'divider',
      node: <Divider dashed />,
    }
  }

  return null
}

function getReaderFlowGap(
  previousKind: ReaderFlowKind | null,
  currentKind: ReaderFlowKind
): number {
  if (!previousKind) {
    return 0
  }

  const hasKind = (kind: ReaderFlowKind) => previousKind === kind || currentKind === kind
  const hasPlayerSideContent =
    previousKind === 'doctor' ||
    previousKind === 'choice' ||
    currentKind === 'doctor' ||
    currentKind === 'choice'

  if (hasKind('narration')) {
    return 26
  }

  if (previousKind === 'dialogue' && currentKind === 'dialogue') {
    return 12
  }

  if (hasPlayerSideContent) {
    return 18
  }

  if (hasKind('visual')) {
    return 20
  }

  if (hasKind('divider')) {
    return 24
  }

  return 18
}

function ReaderFlow({ items }: { items: ReaderFlowItem[] }) {
  return (
    <>
      {items.map((item, index) => {
        const previousKind = index > 0 ? (items[index - 1]?.kind ?? null) : null
        const style = {
          '--reader-flow-gap': `${getReaderFlowGap(previousKind, item.kind)}px`,
        } as CSSProperties

        return (
          <div className="reader-flow-row" data-kind={item.kind} key={item.key} style={style}>
            {item.node}
          </div>
        )
      })}
    </>
  )
}

function ReaderVisualCueImage({
  image,
}: {
  image: { urls: string[]; alt: string; label: string }
}) {
  const urlsKey = image.urls.join('\n')

  return <ReaderVisualCueImageContent key={urlsKey} image={image} />
}

function ReaderVisualCueImageContent({
  image,
}: {
  image: { urls: string[]; alt: string; label: string }
}) {
  const visualFrameRef = useRef<HTMLElement | null>(null)
  const imageElementRef = useRef<HTMLImageElement | null>(null)
  const [shouldStartLoading, setShouldStartLoading] = useState(
    () => !canDeferReaderVisualCueImageLoading()
  )
  const [downloadProgressState, setDownloadProgressState] = useState<{
    attemptIndex: number
    value: number
  } | null>(null)
  const [isPureBlack, setIsPureBlack] = useState(false)
  const [imageSrcState, setImageSrcState] = useState<{
    attemptIndex: number
    src: string
  } | null>(null)
  const [attemptState, setAttemptState] = useState<{
    activeUrlIndex: number
    isExhausted: boolean
    loadedUrlIndex: number | null
  }>(() => ({
    activeUrlIndex: 0,
    isExhausted: image.urls.length === 0,
    loadedUrlIndex: null,
  }))

  useEffect(() => {
    if (shouldStartLoading) {
      return
    }

    const element = visualFrameRef.current
    if (!element) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) {
          setShouldStartLoading(true)
          observer.disconnect()
        }
      },
      { rootMargin: VISUAL_CUE_IMAGE_INTERSECTION_ROOT_MARGIN }
    )

    observer.observe(element)

    return () => observer.disconnect()
  }, [shouldStartLoading])

  const advanceFromIndex = useCallback(
    (attemptIndex: number) => {
      setAttemptState((current) => {
        if (
          current.isExhausted ||
          current.activeUrlIndex !== attemptIndex ||
          current.loadedUrlIndex === attemptIndex
        ) {
          return current
        }

        const nextIndex = attemptIndex + 1

        if (nextIndex >= image.urls.length) {
          return {
            activeUrlIndex: attemptIndex,
            isExhausted: true,
            loadedUrlIndex: null,
          }
        }

        return {
          activeUrlIndex: nextIndex,
          isExhausted: false,
          loadedUrlIndex: null,
        }
      })
    },
    [image.urls.length]
  )

  const markLoaded = useCallback((attemptIndex: number) => {
    setAttemptState((current) => {
      if (current.isExhausted || current.activeUrlIndex !== attemptIndex) {
        return current
      }

      return {
        ...current,
        loadedUrlIndex: attemptIndex,
      }
    })
  }, [])

  const setImageElement = useCallback(
    (element: HTMLImageElement | null) => {
      imageElementRef.current = element

      if (element?.complete && hasValidVisualCueImageSize(element)) {
        if (isPureBlackVisualCueImage(element)) {
          setIsPureBlack(true)
          return
        }

        markLoaded(attemptState.activeUrlIndex)
      }
    },
    [attemptState.activeUrlIndex, markLoaded]
  )

  useEffect(() => {
    const element = imageElementRef.current

    if (element?.complete && hasValidVisualCueImageSize(element)) {
      if (isPureBlackVisualCueImage(element)) {
        setIsPureBlack(true)
        return
      }

      markLoaded(attemptState.activeUrlIndex)
    }
  }, [attemptState.activeUrlIndex, markLoaded])

  useEffect(() => {
    if (!shouldStartLoading || attemptState.isExhausted) {
      return
    }

    const attemptIndex = attemptState.activeUrlIndex
    const activeUrl = image.urls[attemptIndex]
    if (!activeUrl) {
      return
    }

    const abortController = new AbortController()
    let didTimeout = false
    let objectUrl: string | null = null
    const fetchTimeoutTimer = setTimeout(() => {
      didTimeout = true
      abortController.abort()
    }, VISUAL_CUE_IMAGE_LOAD_TIMEOUT_MS)

    void (async () => {
      try {
        const response = await fetch(activeUrl, {
          signal: abortController.signal,
          referrerPolicy: 'no-referrer',
        })
        if (!response.ok) {
          advanceFromIndex(attemptIndex)
          return
        }

        const contentLengthHeader = response.headers.get('content-length')
        const totalBytes = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : 0
        const contentType = response.headers.get('content-type') ?? undefined

        if (!response.body) {
          const blob = await response.blob()
          objectUrl = URL.createObjectURL(blob)
          setDownloadProgressState({ attemptIndex, value: 100 })
          setImageSrcState({ attemptIndex, src: objectUrl })
          return
        }

        const reader = response.body.getReader()
        let receivedBytes = 0
        const chunks: BlobPart[] = []

        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            objectUrl = URL.createObjectURL(new Blob(chunks, { type: contentType }))
            setImageSrcState({ attemptIndex, src: objectUrl })
            setDownloadProgressState({ attemptIndex, value: 100 })
            break
          }

          receivedBytes += value.byteLength
          chunks.push(value)
          if (totalBytes > 0) {
            setDownloadProgressState({
              attemptIndex,
              value: Math.min(100, Math.round((receivedBytes / totalBytes) * 100)),
            })
          } else {
            setDownloadProgressState((current) => ({
              attemptIndex,
              value:
                current?.attemptIndex === attemptIndex &&
                current.value >= READER_VISUAL_IMAGE_HIDE_PROGRESS
                  ? current.value
                  : READER_VISUAL_IMAGE_HIDE_PROGRESS,
            }))
          }
        }
      } catch {
        if (!abortController.signal.aborted || didTimeout) {
          setDownloadProgressState({ attemptIndex, value: 0 })
          advanceFromIndex(attemptIndex)
        }
      } finally {
        clearTimeout(fetchTimeoutTimer)
      }
    })()

    return () => {
      clearTimeout(fetchTimeoutTimer)
      abortController.abort()
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [
    advanceFromIndex,
    attemptState.activeUrlIndex,
    attemptState.isExhausted,
    image.urls,
    shouldStartLoading,
  ])

  useEffect(() => {
    if (
      !shouldStartLoading ||
      attemptState.isExhausted ||
      attemptState.loadedUrlIndex === attemptState.activeUrlIndex
    ) {
      return
    }

    const attemptIndex = attemptState.activeUrlIndex
    const completeCheckTimer = setTimeout(() => {
      const element = imageElementRef.current

      if (!element) {
        return
      }

      if (element.complete && !hasValidVisualCueImageSize(element)) {
        advanceFromIndex(attemptIndex)
      }
    }, VISUAL_CUE_IMAGE_COMPLETE_CHECK_DELAY_MS)

    const loadTimeoutTimer = setTimeout(() => {
      const element = imageElementRef.current

      if (!element) {
        return
      }

      if (!hasValidVisualCueImageSize(element)) {
        advanceFromIndex(attemptIndex)
      }
    }, VISUAL_CUE_IMAGE_LOAD_TIMEOUT_MS)

    return () => {
      clearTimeout(completeCheckTimer)
      clearTimeout(loadTimeoutTimer)
    }
  }, [advanceFromIndex, attemptState, shouldStartLoading])

  const { activeUrlIndex, isExhausted, loadedUrlIndex } = attemptState
  const isLoaded = loadedUrlIndex === activeUrlIndex
  const downloadProgress =
    downloadProgressState?.attemptIndex === activeUrlIndex ? downloadProgressState.value : 0
  const imageSrc = imageSrcState?.attemptIndex === activeUrlIndex ? imageSrcState.src : null
  const shouldShowLoadingText =
    shouldStartLoading && !isLoaded && downloadProgress < READER_VISUAL_IMAGE_HIDE_PROGRESS

  if (isPureBlack) {
    return null
  }

  if (isExhausted) {
    return <ReaderMissingVisualCuePlaceholder />
  }

  return (
    <figure className="reader-visual-frame" ref={visualFrameRef}>
      <div className="reader-visual-frame__stage">
        {shouldShowLoadingText ? (
          <div aria-live="polite" className="reader-visual-frame__loading">
            <Typography.Text type="secondary">{READER_VISUAL_IMAGE_LOADING_TEXT}</Typography.Text>
          </div>
        ) : null}
        {imageSrc ? (
          <img
            ref={setImageElement}
            src={imageSrc}
            alt={image.alt}
            crossOrigin="anonymous"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            data-source-url={image.urls[activeUrlIndex]}
            className={
              isLoaded ? 'reader-visual-frame__image is-loaded' : 'reader-visual-frame__image'
            }
            onLoad={(event) => {
              if (hasValidVisualCueImageSize(event.currentTarget)) {
                if (isPureBlackVisualCueImage(event.currentTarget)) {
                  setIsPureBlack(true)
                  return
                }

                markLoaded(activeUrlIndex)
                return
              }

              advanceFromIndex(activeUrlIndex)
            }}
            onError={() => advanceFromIndex(activeUrlIndex)}
          />
        ) : null}
      </div>
      <figcaption className="reader-visual-frame__caption">{image.label}</figcaption>
    </figure>
  )
}

function canDeferReaderVisualCueImageLoading(): boolean {
  return typeof window !== 'undefined' && 'IntersectionObserver' in window
}

function ReaderMissingVisualCuePlaceholder() {
  return (
    <figure className="reader-visual-missing">
      <Typography.Text type="secondary">资源缺失</Typography.Text>
    </figure>
  )
}

function hasValidVisualCueImageSize(element: HTMLImageElement): boolean {
  return element.naturalWidth > 0 && element.naturalHeight > 0
}

function isPureBlackVisualCueImage(element: HTMLImageElement): boolean {
  if (!hasValidVisualCueImageSize(element)) {
    return false
  }

  try {
    const sampleWidth = Math.min(64, element.naturalWidth)
    const sampleHeight = Math.min(64, element.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = sampleWidth
    canvas.height = sampleHeight

    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      return false
    }

    context.drawImage(element, 0, 0, sampleWidth, sampleHeight)
    const { data } = context.getImageData(0, 0, sampleWidth, sampleHeight)
    let visiblePixelCount = 0

    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3] ?? 0
      if (alpha <= 8) {
        continue
      }

      visiblePixelCount += 1
      const red = data[index] ?? 0
      const green = data[index + 1] ?? 0
      const blue = data[index + 2] ?? 0

      if (red > 4 || green > 4 || blue > 4) {
        return false
      }
    }

    return visiblePixelCount > 0
  } catch {
    return false
  }
}

function ReaderChoiceBlock({
  block,
  chapterCitations,
  doctorName,
  knowledgeMarkersByBlock,
  selectedIndex: controlledSelectedIndex,
  onSelect,
  renderBranchItems,
}: {
  block: ReaderChoiceBlockData
  chapterCitations: StaticChapterData['citations']
  doctorName?: string | null
  knowledgeMarkersByBlock?: Map<string, ReaderKnowledgeInlineMarker[]>
  selectedIndex?: number | null
  onSelect?: (optionIndex: number) => void
  renderBranchItems?: () => ReaderFlowItem[] | null
}) {
  const [localSelectedIndex, setLocalSelectedIndex] = useState<number | null>(null)
  const selectedIndex =
    controlledSelectedIndex === undefined ? localSelectedIndex : controlledSelectedIndex
  const selectedOption = selectedIndex === null ? null : block.options[selectedIndex]

  const selectedBranch = resolveSelectedChoiceBranch(block, selectedIndex)
  const fallbackBranchItems =
    selectedBranch?.blocks
      .map((branchBlock, index) => {
        const item = ReaderBlockItem({
          block: branchBlock,
          chapterCitations,
          depth: 1,
          doctorName,
          knowledgeMarkersByBlock,
        })

        return item
          ? {
              ...item,
              key: `${selectedBranch.id}:${item.key}:${index}`,
            }
          : null
      })
      .filter((item): item is ReaderFlowItem => item !== null) ?? []

  if (selectedIndex === null) {
    return (
      <div className="reader-choice-block">
        {block.options.map((option, optionIndex) => (
          <Button
            key={`${block.id}:${optionIndex}`}
            block
            onClick={() => (onSelect ?? setLocalSelectedIndex)(optionIndex)}
          >
            {toReaderDisplayText(option, doctorName)}
          </Button>
        ))}
      </div>
    )
  }

  return (
    <div className="reader-choice-block reader-choice-block--answered">
      <Typography.Paragraph
        className="reader-choice-result"
        style={{ textAlign: 'center', fontStyle: 'italic', fontWeight: 'bold' }}
      >
        {toReaderDisplayText(selectedOption ?? '', doctorName)}
      </Typography.Paragraph>
      {selectedBranch && selectedBranch.blocks.length > 0 ? (
        <div className="reader-choice-branch">
          <ReaderFlow items={renderBranchItems?.() ?? fallbackBranchItems} />
        </div>
      ) : null}
    </div>
  )
}

function resolveSelectedChoiceBranch(
  block: ReaderChoiceBlockData,
  selectedIndex: number | null
): ReaderChoiceBranch | null {
  const selectedValue =
    selectedIndex === null ? null : (block.values?.[selectedIndex] ?? String(selectedIndex + 1))

  if (selectedValue === null) {
    return null
  }

  return (
    block.branches?.find(
      (candidate) =>
        candidate.predicate === selectedValue || candidate.references?.includes(selectedValue)
    ) ?? null
  )
}

function renderReaderBlockSequence({
  blocks,
  chapterCitations,
  depth,
  doctorName,
  choiceSelections,
  onChoiceSelect,
  knowledgeMarkersByBlock,
}: {
  blocks: StaticChapterData['blocks']
  chapterCitations: StaticChapterData['citations']
  depth: number
  doctorName?: string | null
  choiceSelections: Record<string, number>
  onChoiceSelect: (choiceId: string, optionIndex: number) => void
  knowledgeMarkersByBlock?: Map<string, ReaderKnowledgeInlineMarker[]>
}): ReaderSequenceRenderResult {
  const items: ReaderFlowItem[] = []

  for (const [index, block] of blocks.entries()) {
    if (block.type === 'choice') {
      const selectedIndex = choiceSelections[block.id] ?? null
      const selectedBranch = resolveSelectedChoiceBranch(block, selectedIndex)
      const branchRenderResult =
        selectedBranch && selectedBranch.blocks.length > 0
          ? renderReaderBlockSequence({
              blocks: selectedBranch.blocks,
              chapterCitations,
              depth: depth + 1,
              doctorName,
              choiceSelections,
              onChoiceSelect,
              knowledgeMarkersByBlock,
            })
          : null

      items.push({
        key: `${depth}:${block.id}:${index}`,
        kind: 'choice',
        node: (
          <ReaderChoiceBlock
            block={block}
            chapterCitations={chapterCitations}
            doctorName={doctorName}
            knowledgeMarkersByBlock={knowledgeMarkersByBlock}
            selectedIndex={selectedIndex}
            onSelect={(optionIndex) => onChoiceSelect(block.id, optionIndex)}
            renderBranchItems={() => branchRenderResult?.items ?? null}
          />
        ),
      })

      if (selectedIndex === null || branchRenderResult?.blocked) {
        return { items, blocked: true }
      }

      continue
    }

    const item = ReaderBlockItem({
      block,
      chapterCitations,
      depth,
      doctorName,
      knowledgeMarkersByBlock,
    })

    if (item) {
      items.push({
        ...item,
        key: `${item.key}:${index}`,
      })
    }
  }

  return { items, blocked: false }
}

function ReaderBlockSequence({
  blocks,
  chapterCitations,
  depth,
  doctorName,
  choiceSelections,
  onChoiceSelect,
  knowledgeMarkersByBlock,
}: {
  blocks: StaticChapterData['blocks']
  chapterCitations: StaticChapterData['citations']
  depth: number
  doctorName?: string | null
  choiceSelections: Record<string, number>
  onChoiceSelect: (choiceId: string, optionIndex: number) => void
  knowledgeMarkersByBlock?: Map<string, ReaderKnowledgeInlineMarker[]>
}) {
  const rendered = renderReaderBlockSequence({
    blocks,
    chapterCitations,
    depth,
    doctorName,
    choiceSelections,
    onChoiceSelect,
    knowledgeMarkersByBlock,
  })

  return <ReaderFlow items={rendered.items} />
}

function toAlbumKey(albumId: string): string {
  return `album:${albumId}`
}

function toChapterKey(chapterId: string): string {
  return `chapter:${chapterId}`
}

function isMainlineAlbumId(albumId: string): boolean {
  return /^main_\d+$/i.test(albumId)
}

function parseMainlineOrder(albumId: string): number {
  const match = albumId.match(/^main_(\d+)$/i)
  if (!match || !match[1]) {
    return Number.MAX_SAFE_INTEGER
  }

  const parsed = Number.parseInt(match[1], 10)
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER
}

function resolveHomeSectionFromSearch(search: string): HomeSectionKey {
  const section = new URLSearchParams(search).get('section')
  if (section === 'intermezzi' || section === 'sideStory') {
    return 'sideStory'
  }

  if (
    section === 'mainline' ||
    section === 'sideStory' ||
    section === 'otherStory' ||
    section === 'operatorRecord' ||
    section === 'terraHistoricus'
  ) {
    return section
  }

  return 'mainline'
}

interface ClassifiedAlbum {
  albumId: string
  slug: string
  title: string
  sectionKey: HomeSectionKey
  albumKind: string
  section: TimelineCardViewModel['section']
  side?: 'left' | 'right'
  timelineRank: number
  gameOrderRank: number
  otherStory?: StaticAlbumData['otherStory']
}

function buildClassifiedAlbums(
  timelineItems: TimelineCardViewModel[],
  catalogAlbums: Array<{
    id: string
    slug: string
    title: string
    albumKind?: string
    otherStory?: StaticAlbumData['otherStory']
  }>
): ClassifiedAlbum[] {
  const timelineByAlbumId = new Map<string, TimelineCardViewModel>()
  const dedupedTimeline = dedupeByAlbumId(timelineItems)

  for (const item of dedupedTimeline) {
    timelineByAlbumId.set(item.albumId, item)
  }

  const mainlineTimeline = dedupedTimeline
    .filter((item) => item.albumKind === 'mainline')
    .sort(compareTimelineOrder)
  const maxMainlineTimelineRank = Math.max(0, ...mainlineTimeline.map((item) => item.timelineRank))
  const maxMainlineGameOrderRank = Math.max(
    0,
    ...mainlineTimeline.map((item) => item.gameOrderRank ?? 0)
  )

  const metadataOnlyMainlineAlbums = catalogAlbums
    .filter((album) => !timelineByAlbumId.has(album.id) && isMainlineAlbumId(album.id))
    .sort(
      (left, right) =>
        parseMainlineOrder(left.id) - parseMainlineOrder(right.id) ||
        left.id.localeCompare(right.id)
    )
  const mainlineRankByAlbumId = new Map<string, { timelineRank: number; gameOrderRank: number }>()
  metadataOnlyMainlineAlbums.forEach((album, index) => {
    mainlineRankByAlbumId.set(album.id, {
      timelineRank: maxMainlineTimelineRank + index + 1,
      gameOrderRank: maxMainlineGameOrderRank + index + 1,
    })
  })

  const items: ClassifiedAlbum[] = []

  for (const album of catalogAlbums) {
    const timeline = timelineByAlbumId.get(album.id)

    if (timeline) {
      const normalizedEntryType = normalizeAlbumKind(album.id, timeline.albumKind)
      let sectionKey: HomeSectionKey
      if (normalizedEntryType === 'mainline') {
        sectionKey = 'mainline'
      } else if (normalizedEntryType === 'intermezzi' || normalizedEntryType === 'sideStory') {
        sectionKey = 'sideStory'
      } else if (normalizedEntryType === 'operatorRecord') {
        sectionKey = 'operatorRecord'
      } else {
        sectionKey = 'otherStory'
      }

      items.push({
        albumId: album.id,
        slug: album.slug,
        title: album.title,
        sectionKey,
        albumKind: normalizedEntryType,
        section:
          sectionKey === 'otherStory'
            ? 'otherStory'
            : (timeline.section as TimelineCardViewModel['section']),
        side: timeline.side,
        timelineRank: timeline.timelineRank,
        gameOrderRank: timeline.gameOrderRank ?? Number.MAX_SAFE_INTEGER,
        otherStory: timeline.otherStory ?? album.otherStory,
      })
      continue
    }

    if (isMainlineAlbumId(album.id)) {
      const mainlineRank = mainlineRankByAlbumId.get(album.id)
      items.push({
        albumId: album.id,
        slug: album.slug,
        title: album.title,
        sectionKey: 'mainline',
        albumKind: 'mainline',
        section: 'mainline',
        side: 'left',
        timelineRank: mainlineRank?.timelineRank ?? Number.MAX_SAFE_INTEGER,
        gameOrderRank: mainlineRank?.gameOrderRank ?? Number.MAX_SAFE_INTEGER,
        otherStory: album.otherStory,
      })
      continue
    }

    const normalizedCatalogEntryType = normalizeAlbumKind(album.id, album.albumKind ?? 'otherStory')
    const sectionKey =
      normalizedCatalogEntryType === 'mainline'
        ? 'mainline'
        : normalizedCatalogEntryType === 'intermezzi' || normalizedCatalogEntryType === 'sideStory'
          ? 'sideStory'
          : normalizedCatalogEntryType === 'operatorRecord'
            ? 'operatorRecord'
            : 'otherStory'

    items.push({
      albumId: album.id,
      slug: album.slug,
      title: album.title,
      sectionKey,
      albumKind: normalizedCatalogEntryType,
      section:
        sectionKey === 'otherStory' || sectionKey === 'operatorRecord'
          ? sectionKey
          : sectionKey === 'sideStory' && normalizedCatalogEntryType === 'sideStory'
            ? 'sideStory'
            : 'mainline',
      side: sectionKey === 'sideStory' ? 'right' : sectionKey === 'mainline' ? 'left' : undefined,
      timelineRank: Number.MAX_SAFE_INTEGER,
      gameOrderRank: Number.MAX_SAFE_INTEGER,
      otherStory: album.otherStory,
    })
  }

  return items
}

function compareTimelineOrder(left: TimelineCardViewModel, right: TimelineCardViewModel): number {
  if (left.timelineRank !== right.timelineRank) {
    return left.timelineRank - right.timelineRank
  }

  const leftGameOrderRank = left.gameOrderRank ?? Number.MAX_SAFE_INTEGER
  const rightGameOrderRank = right.gameOrderRank ?? Number.MAX_SAFE_INTEGER

  if (leftGameOrderRank !== rightGameOrderRank) {
    return leftGameOrderRank - rightGameOrderRank
  }

  return left.albumId.localeCompare(right.albumId)
}

function dedupeByAlbumId(items: TimelineCardViewModel[]): TimelineCardViewModel[] {
  const seen = new Set<string>()
  const deduped: TimelineCardViewModel[] = []

  for (const item of items) {
    if (seen.has(item.albumId)) {
      continue
    }

    seen.add(item.albumId)
    deduped.push(item)
  }

  return deduped
}

function groupAlbumCards(items: TimelineCardViewModel[]): AlbumCardGroup[] {
  const groups: AlbumCardGroup[] = []
  const groupByTitle = new Map<string, AlbumCardGroup>()

  for (const item of items) {
    const title = getAlbumCardGroupTitle(item)
    const existing = groupByTitle.get(title)

    if (existing) {
      existing.items.push(item)
      continue
    }

    const group = {
      key: title,
      title,
      items: [item],
    }
    groups.push(group)
    groupByTitle.set(title, group)
  }

  return groups
}

interface DownloadSelectorPanelProps {
  locale: AppLocale
  defaultAlbumId?: string
  focusedChapterId?: string
  defaultEmpty?: boolean
}

export function DownloadSelectorPanel({
  locale,
  defaultAlbumId,
  focusedChapterId,
  defaultEmpty = false,
}: DownloadSelectorPanelProps) {
  const staticStoryRepository = useMemo(() => new StaticStoryRepository(), [])
  const [userCheckedKeys, setUserCheckedKeys] = useState<string[] | null>(null)
  const [userExpandedKeys, setUserExpandedKeys] = useState<string[] | null>(null)
  const [loadedAlbumDetails, setLoadedAlbumDetails] = useState<Record<string, StaticAlbumData>>({})
  const loadingAlbumDetailsRef = useRef(new Map<string, Promise<StaticAlbumData>>())
  const [exportFormat, setExportFormat] = useState<ExportFormat>('txt')
  const [exportFileMode, setExportFileMode] = useState<ExportFileMode>('single')
  const [includeExportImages, setIncludeExportImages] = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState({
    completedChapters: 0,
    totalChapters: 0,
  })
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const doctorName = useAppSettingsStore((state) => state.doctorName)

  const timelineQuery = useQuery({
    queryKey: ['download-timeline', locale],
    queryFn: async () => staticStoryRepository.getTimeline(locale),
  })

  const catalogQuery = useQuery({
    queryKey: ['download-catalog', locale],
    queryFn: async () => staticStoryRepository.getCatalog(locale),
  })

  const ensureAlbumDetailLoaded = useCallback(
    async (albumId: string): Promise<StaticAlbumData> => {
      const cached = loadedAlbumDetails[albumId]
      if (cached) {
        return cached
      }

      const loading = loadingAlbumDetailsRef.current.get(albumId)
      if (loading) {
        return loading
      }

      const loadingDetail = staticStoryRepository.getAlbum(locale, albumId)
      loadingAlbumDetailsRef.current.set(albumId, loadingDetail)

      const detail = await loadingDetail.finally(() => {
        loadingAlbumDetailsRef.current.delete(albumId)
      })
      setLoadedAlbumDetails((previous) => {
        if (previous[albumId]) {
          return previous
        }

        return {
          ...previous,
          [albumId]: detail,
        }
      })
      return detail
    },
    [loadedAlbumDetails, locale, staticStoryRepository]
  )

  const timelineData = timelineQuery.data
  const catalogData = catalogQuery.data

  const timelineCards = useMemo(() => {
    if (!timelineData) {
      return [] as TimelineCardViewModel[]
    }

    return dedupeByAlbumId(
      timelineData.items.map((item) => ({
        albumId: item.albumId,
        slug: item.slug,
        title: item.title,
        cover: item.cover,
        albumKind: item.albumKind,
        section: item.section as TimelineCardViewModel['section'],
        side: item.side,
        timelineRank: item.timelineRank,
        gameOrderRank: item.gameOrderRank,
        chapterCount: item.chapterCount,
        progressPercent: 0,
        summary: item.summary,
        music: item.music,
        otherStory: item.otherStory,
        operator: item.operator,
      }))
    )
  }, [timelineData])

  const classifiedAlbums = useMemo(() => {
    if (!catalogData) {
      return [] as ClassifiedAlbum[]
    }

    return buildClassifiedAlbums(timelineCards, catalogData.albums)
  }, [catalogData, timelineCards])

  const classifiedAlbumById = useMemo(
    () => new Map(classifiedAlbums.map((item) => [item.albumId, item])),
    [classifiedAlbums]
  )

  const defaultSelectedAlbumDetailQuery = useQuery({
    queryKey: ['download-default-album-detail', locale, defaultAlbumId],
    enabled: userCheckedKeys === null && !defaultEmpty && Boolean(defaultAlbumId),
    queryFn: async () => {
      if (!defaultAlbumId) {
        throw new Error('Missing default album id')
      }

      return ensureAlbumDetailLoaded(defaultAlbumId)
    },
  })

  const defaultExpandedKeys = useMemo(() => {
    if (!defaultAlbumId) {
      return ['root:all']
    }

    const album = classifiedAlbumById.get(defaultAlbumId)
    if (!album) {
      return ['root:all']
    }

    const groupKeyBySection: Record<HomeSectionKey, string> = {
      mainline: 'group:mainline',
      sideStory: 'group:sideStory',
      otherStory: 'group:otherStory',
      operatorRecord: 'group:operatorRecord',
      terraHistoricus: 'group:terraHistoricus',
    }

    const nextExpanded = [
      'root:all',
      groupKeyBySection[album.sectionKey],
      toAlbumKey(defaultAlbumId),
    ]
    if (album.sectionKey === 'mainline' || album.sectionKey === 'sideStory') {
      nextExpanded.splice(1, 0, 'group:storyline')
    }

    return Array.from(new Set(nextExpanded))
  }, [classifiedAlbumById, defaultAlbumId])

  const expandedKeys = userExpandedKeys ?? defaultExpandedKeys
  const defaultCheckedKeys = useMemo(() => {
    if (defaultEmpty || !defaultAlbumId || !defaultSelectedAlbumDetailQuery.data) {
      return []
    }

    const focusedChapter = focusedChapterId
      ? defaultSelectedAlbumDetailQuery.data.chapters.find(
          (chapter) => chapter.id === focusedChapterId
        )
      : undefined
    const selected = focusedChapter
      ? [toChapterKey(focusedChapter.id)]
      : [
          toAlbumKey(defaultAlbumId),
          ...defaultSelectedAlbumDetailQuery.data.chapters.map((chapter) =>
            toChapterKey(chapter.id)
          ),
        ]

    return Array.from(new Set(selected))
  }, [defaultEmpty, defaultAlbumId, defaultSelectedAlbumDetailQuery.data, focusedChapterId])
  const checkedKeys = userCheckedKeys ?? defaultCheckedKeys

  if (timelineQuery.isLoading || catalogQuery.isLoading) {
    return <LoadingState message="正在加载下载选择器..." />
  }

  if (timelineQuery.isError || catalogQuery.isError) {
    return <ErrorState message="下载选择器加载失败。" />
  }

  if (!timelineData || !catalogData) {
    return <ErrorState message="下载选择器数据不完整。" />
  }

  const toAlbumNode = (classified: ClassifiedAlbum): DataNode => {
    const detail = loadedAlbumDetails[classified.albumId]

    return {
      key: toAlbumKey(classified.albumId),
      title: classified.title,
      isLeaf: false,
      children: detail?.chapters.map((chapter) => ({
        key: toChapterKey(chapter.id),
        title: chapter.title,
      })),
    }
  }

  const mainlineAlbumNodes: DataNode[] = classifiedAlbums
    .filter((item) => item.sectionKey === 'mainline')
    .sort((left, right) => {
      if (left.timelineRank !== right.timelineRank) {
        return left.timelineRank - right.timelineRank
      }

      return left.gameOrderRank - right.gameOrderRank || left.albumId.localeCompare(right.albumId)
    })
    .map(toAlbumNode)

  const sideStoryAlbumNodes: DataNode[] = classifiedAlbums
    .filter((item) => item.sectionKey === 'sideStory')
    .sort(
      (left, right) =>
        left.timelineRank - right.timelineRank || left.albumId.localeCompare(right.albumId)
    )
    .map(toAlbumNode)

  const otherStoryNodes: DataNode[] = classifiedAlbums
    .filter((item) => item.sectionKey === 'otherStory')
    .sort((left, right) => left.title.localeCompare(right.title, 'zh-Hans-CN'))
    .map(toAlbumNode)

  const treeData: DataNode[] = [
    {
      key: 'root:all',
      title: '全部剧情',
      children: [
        {
          key: 'group:storyline',
          title: '主时间线',
          children: [
            {
              key: 'group:mainline',
              title: '主题曲',
              children: mainlineAlbumNodes,
            },
            {
              key: 'group:sideStory',
              title: 'SideStory',
              children: sideStoryAlbumNodes,
            },
          ],
        },
        {
          key: 'group:otherStory',
          title: '附加档案',
          children: otherStoryNodes,
        },
      ],
    },
  ]

  const checkedChapterCount = checkedKeys.filter((key) => key.startsWith('chapter:')).length
  const hasExportableSelection = checkedKeys.some((key) => {
    if (key === 'root:all' || key === 'group:storyline') {
      return true
    }

    if (key === 'group:mainline' || key === 'group:sideStory' || key === 'group:otherStory') {
      return true
    }

    return key.startsWith('album:') || key.startsWith('chapter:')
  })

  const downloadArtifacts = (artifacts: ExportArtifact[]) => {
    for (const artifact of artifacts) {
      const blob = new Blob([artifact.data as BlobPart], { type: artifact.mimeType })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = artifact.fileName
      anchor.rel = 'noopener'
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    }
  }

  const getAlbumIdsForCheckedKey = (key: string): string[] => {
    if (key === 'root:all') {
      return classifiedAlbums
        .filter((item) => item.sectionKey !== 'operatorRecord')
        .map((item) => item.albumId)
    }

    if (key === 'group:storyline') {
      return classifiedAlbums
        .filter((item) => item.sectionKey === 'mainline' || item.sectionKey === 'sideStory')
        .map((item) => item.albumId)
    }

    if (key === 'group:mainline') {
      return classifiedAlbums
        .filter((item) => item.sectionKey === 'mainline')
        .map((item) => item.albumId)
    }

    if (key === 'group:sideStory') {
      return classifiedAlbums
        .filter((item) => item.sectionKey === 'sideStory')
        .map((item) => item.albumId)
    }

    if (key === 'group:otherStory') {
      return classifiedAlbums
        .filter((item) => item.sectionKey === 'otherStory')
        .map((item) => item.albumId)
    }

    if (key.startsWith('album:')) {
      return [key.slice('album:'.length)]
    }

    return []
  }

  const buildExportSelection = async () => {
    const selectedAlbumIds = new Set<string>()
    const fullAlbumIds = new Set<string>()
    const selectedChapterIds = new Set<string>()

    for (const key of checkedKeys) {
      if (key.startsWith('chapter:')) {
        selectedChapterIds.add(key.slice('chapter:'.length))
        continue
      }

      for (const albumId of getAlbumIdsForCheckedKey(key)) {
        selectedAlbumIds.add(albumId)
        fullAlbumIds.add(albumId)
      }
    }

    const albumIdsFromExplicitChapters = new Set<string>()
    for (const [albumId, detail] of Object.entries(loadedAlbumDetails)) {
      if (detail.chapters.some((chapter) => selectedChapterIds.has(chapter.id))) {
        albumIdsFromExplicitChapters.add(albumId)
      }
    }

    for (const albumId of albumIdsFromExplicitChapters) {
      selectedAlbumIds.add(albumId)
    }

    const items = []
    for (const albumId of selectedAlbumIds) {
      const detail = await ensureAlbumDetailLoaded(albumId)
      const chapterIds = detail.chapters
        .filter((chapter) => fullAlbumIds.has(albumId) || selectedChapterIds.has(chapter.id))
        .map((chapter) => chapter.id)

      if (chapterIds.length > 0) {
        items.push({ albumId, chapterIds })
      }
    }

    return {
      locale,
      fileMode: exportFileMode,
      includeImages:
        exportFormat === 'epub' || exportFormat === 'pdf' ? includeExportImages : false,
      doctorName,
      items,
    }
  }

  const downloadPercent =
    downloadProgress.totalChapters > 0
      ? Math.min(
          100,
          Math.round((downloadProgress.completedChapters / downloadProgress.totalChapters) * 100)
        )
      : 0
  const downloadButtonLabel = isDownloading
    ? `已下载 ${downloadPercent}%`
    : `下载已选内容（${checkedChapterCount} 章）`

  const handleDownload = async () => {
    setDownloadError(null)
    setDownloadProgress({ completedChapters: 0, totalChapters: checkedChapterCount })
    setIsDownloading(true)

    try {
      const selection = await buildExportSelection()
      const totalChapters = selection.items.reduce(
        (total, item) => total + item.chapterIds.length,
        0
      )
      setDownloadProgress({ completedChapters: 0, totalChapters })
      if (selection.items.length === 0) {
        throw new Error('请选择至少一个可导出的章节。')
      }

      const { ExportService } = await import('../../features/download')
      const exportService = new ExportService(staticStoryRepository)
      const artifacts = await exportService.export(exportFormat, selection, {
        onProgress: setDownloadProgress,
      })
      downloadArtifacts(artifacts)
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : '下载失败，请重试。')
    } finally {
      setIsDownloading(false)
    }
  }

  const handleCheck: TreeProps['onCheck'] = (next) => {
    if (Array.isArray(next)) {
      setUserCheckedKeys(next.map((value) => String(value)))
      return
    }

    setUserCheckedKeys(next.checked.map((value) => String(value)))
  }

  const handleLoadData: TreeProps['loadData'] = async (treeNode) => {
    const key = String(treeNode.key)

    if (key.startsWith('album:')) {
      const albumId = key.slice('album:'.length)
      await ensureAlbumDetailLoaded(albumId)
      return
    }
  }

  return (
    <Space className="download-panel" orientation="vertical" size={10} style={{ width: '100%' }}>
      <Button
        data-testid="download-action-top"
        type="primary"
        loading={isDownloading}
        disabled={!hasExportableSelection || isDownloading}
        onClick={handleDownload}
      >
        {downloadButtonLabel}
      </Button>
      <Space wrap size={8}>
        <Select<ExportFormat>
          aria-label="导出格式"
          value={exportFormat}
          onChange={setExportFormat}
          disabled={isDownloading}
          options={[
            { value: 'txt', label: 'TXT' },
            { value: 'epub', label: 'EPUB' },
            { value: 'pdf', label: 'PDF' },
          ]}
          style={{ width: 120 }}
        />
        <Select<ExportFileMode>
          aria-label="导出文件模式"
          value={exportFileMode}
          onChange={setExportFileMode}
          disabled={isDownloading}
          options={[
            { value: 'single', label: '合并为单文件' },
            { value: 'perAlbumZip', label: '按曲谱打包 ZIP' },
          ]}
          style={{ width: 180 }}
        />
        {exportFormat === 'epub' || exportFormat === 'pdf' ? (
          <Checkbox
            checked={includeExportImages}
            disabled={isDownloading}
            onChange={(event) => setIncludeExportImages(event.target.checked)}
          >
            包含图片
          </Checkbox>
        ) : null}
      </Space>
      <Typography.Text type="secondary">
        支持选择全部、多个曲谱、以及单曲谱内多章节。
      </Typography.Text>
      {downloadError ? <Typography.Text type="danger">{downloadError}</Typography.Text> : null}
      {focusedChapterId ? (
        <Typography.Text type="secondary">当前章节定位：{focusedChapterId}</Typography.Text>
      ) : null}
      <Tree
        checkable
        expandAction="click"
        loadData={handleLoadData}
        expandedKeys={expandedKeys}
        onExpand={(nextExpanded) => setUserExpandedKeys(nextExpanded.map((value) => String(value)))}
        checkedKeys={checkedKeys}
        onCheck={handleCheck}
        treeData={treeData}
      />
      <Typography.Text>已选章节数：{checkedChapterCount}</Typography.Text>
      <Button
        data-testid="download-action-bottom"
        type="primary"
        loading={isDownloading}
        disabled={!hasExportableSelection || isDownloading}
        onClick={handleDownload}
      >
        {downloadButtonLabel}
      </Button>
    </Space>
  )
}

export function DownloadPage({ locale }: PageProps) {
  const location = useLocation()
  const query = new URLSearchParams(location.search)
  const albumId = query.get('albumId') ?? undefined
  const chapterId = query.get('chapterId') ?? undefined

  return (
    <main className="page-panel">
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        <span className="page-kicker">Export</span>
        <Typography.Title level={2}>下载页</Typography.Title>
        <DownloadSelectorPanel
          locale={locale}
          defaultAlbumId={albumId}
          focusedChapterId={chapterId}
          defaultEmpty={!albumId}
        />
      </Space>
    </main>
  )
}

interface SearchResultGroup {
  albumId: string
  albumTitle: string
  type: string
  albumHit?: SearchResultItem
  items: SearchResultItem[]
}

function groupSearchResults(results: SearchResultItem[]): SearchResultGroup[] {
  const groups: SearchResultGroup[] = []
  const groupByAlbumId = new Map<string, SearchResultGroup>()

  for (const item of results) {
    const existing = groupByAlbumId.get(item.albumId)

    if (existing) {
      existing.items.push(item)
      if (item.kind === 'album' && !existing.albumHit) {
        existing.albumHit = item
      }
      continue
    }

    const group: SearchResultGroup = {
      albumId: item.albumId,
      albumTitle: item.albumTitle,
      type: item.type,
      albumHit: item.kind === 'album' ? item : undefined,
      items: [item],
    }
    groups.push(group)
    groupByAlbumId.set(item.albumId, group)
  }

  return groups
}

export function SearchPage({ locale }: PageProps) {
  const location = useLocation()
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])

  return (
    <SearchPageContent
      key={`${locale}:${location.search}`}
      locale={locale}
      initialKeyword={searchParams.get('q') ?? ''}
      initialEntryType={searchParams.get('type') ?? 'all'}
    />
  )
}

function SearchPageContent({
  locale,
  initialKeyword,
  initialEntryType,
}: {
  locale: AppLocale
  initialKeyword: string
  initialEntryType: string
}) {
  const [keyword, setKeyword] = useState(initialKeyword)
  const [albumKind, setEntryType] = useState(initialEntryType)
  const [expandedAlbumIds, setExpandedAlbumIds] = useState<Set<string>>(() => new Set())
  const searchService = useMemo(() => getSharedSearchService(), [])
  const remoteSearchEndpoint = import.meta.env.VITE_REMOTE_SEARCH_ENDPOINT as string | undefined
  const deferredKeyword = useDeferredValue(keyword)
  const trimmedDeferredKeyword = deferredKeyword.trim()

  const searchQuery = useQuery({
    queryKey: ['search', locale, trimmedDeferredKeyword, albumKind],
    queryFn: async () =>
      searchService.search(locale, trimmedDeferredKeyword, {
        type: albumKind === 'all' ? undefined : albumKind,
      }),
    enabled: trimmedDeferredKeyword.length > 0,
  })

  const remoteSearchQuery = useQuery({
    queryKey: ['remote-search', locale, trimmedDeferredKeyword, remoteSearchEndpoint],
    queryFn: async ({ signal }) => {
      if (!remoteSearchEndpoint) {
        return []
      }

      return fetchRemoteSearchResults(remoteSearchEndpoint, locale, trimmedDeferredKeyword, {
        signal,
      })
    },
    enabled: trimmedDeferredKeyword.length > 0 && Boolean(remoteSearchEndpoint),
  })

  const albumKindOptions = [
    { label: '全部', value: 'all' },
    { label: '主题曲', value: 'mainline' },
    { label: 'SideStory', value: 'sideStory' },
    { label: '附加档案', value: 'otherStory' },
    { label: '干员', value: 'operatorRecord' },
  ]

  const resultGroups = searchQuery.data ? groupSearchResults(searchQuery.data) : []

  const toggleGroup = (albumId: string) => {
    setExpandedAlbumIds((previous) => {
      const next = new Set(previous)

      if (next.has(albumId)) {
        next.delete(albumId)
      } else {
        next.add(albumId)
      }

      return next
    })
  }

  return (
    <main className="page-panel">
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        <span className="page-kicker">Search</span>
        <Typography.Title level={2}>剧情搜索</Typography.Title>
        <Input.Search
          placeholder="输入曲谱名、章节编号、章节名、干员名、模组名或秘录名"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <Select value={albumKind} options={albumKindOptions} onChange={setEntryType} />
        <Link to={buildSearchPath(locale, keyword, albumKind)}>刷新当前搜索链接</Link>

        {keyword.trim().length === 0 ? <EmptyState message="请输入搜索关键词。" /> : null}

        {searchQuery.isLoading ? <LoadingState message="正在搜索..." /> : null}
        {searchQuery.isError ? <ErrorState message="搜索失败，请重试。" /> : null}

        {searchQuery.data && searchQuery.data.length === 0 ? (
          <EmptyState message="没有匹配结果。" />
        ) : null}

        {resultGroups.length > 0 ? (
          <div className="search-results">
            {resultGroups.map((group) => {
              const primaryItem = group.albumHit ?? group.items[0]

              if (!primaryItem) {
                return null
              }

              const nestedItems = group.items.filter((item) => item.id !== primaryItem.id)
              const isOperatorGroup = primaryItem.type === 'operatorRecord'
              const shouldCollapseByDefault =
                (Boolean(group.albumHit) || isOperatorGroup) && nestedItems.length > 0
              const isExpanded = !shouldCollapseByDefault || expandedAlbumIds.has(group.albumId)
              const visibleNestedItems = isExpanded ? nestedItems : nestedItems.slice(0, 3)
              const relationLabel = isOperatorGroup ? '模组/秘录' : '章节/关卡'

              return (
                <Card className="search-result-group" key={group.albumId}>
                  <div className="search-result-group__header">
                    <Space orientation="vertical" size={4}>
                      <Space wrap size={8}>
                        <Typography.Title level={4} style={{ margin: 0 }}>
                          {group.albumTitle}
                        </Typography.Title>
                        <Tag>{toDisplayType(group.type)}</Tag>
                        {group.albumHit ? <Tag color="green">曲谱命中</Tag> : null}
                        {primaryItem.kind === 'operator' ? <Tag color="green">干员命中</Tag> : null}
                      </Space>
                      <Typography.Text type="secondary">
                        {nestedItems.length > 0
                          ? `关联清单：${nestedItems.length} 个${relationLabel}命中`
                          : primaryItem.kind === 'operator'
                            ? '干员命中'
                            : '标题命中'}
                      </Typography.Text>
                    </Space>
                    <Space wrap>
                      <Link to={primaryItem.targetPath}>
                        {isOperatorGroup ? '打开干员' : '打开曲谱'}
                      </Link>
                      {shouldCollapseByDefault ? (
                        <Button size="small" onClick={() => toggleGroup(group.albumId)}>
                          {isExpanded ? '收起关联' : `展开 ${nestedItems.length} 条关联`}
                        </Button>
                      ) : null}
                    </Space>
                  </div>

                  {visibleNestedItems.length > 0 ? (
                    <List
                      className="search-result-group__list"
                      dataSource={visibleNestedItems}
                      renderItem={(item) => (
                        <List.Item>
                          <Space orientation="vertical" size={2} style={{ width: '100%' }}>
                            <Link to={item.targetPath}>
                              <Typography.Text strong>{item.title}</Typography.Text>
                            </Link>
                            <Typography.Text type="secondary">
                              {item.secondary ?? item.albumTitle} · {item.stageCode ?? item.kind}
                            </Typography.Text>
                          </Space>
                        </List.Item>
                      )}
                    />
                  ) : null}
                </Card>
              )
            })}
          </div>
        ) : null}

        {keyword.trim().length > 0 ? (
          <Card className="remote-search-panel" title="远端扩展检索">
            {!remoteSearchEndpoint ? (
              <Typography.Text type="secondary">
                远端搜索索引 索引接入后，这里会在静态结果出现的同时加载扩展结果。
              </Typography.Text>
            ) : null}
            {remoteSearchQuery.isLoading ? <LoadingState message="正在加载扩展结果..." /> : null}
            {remoteSearchQuery.isError ? (
              <ErrorState message="远端扩展检索暂时不可用，静态搜索结果不受影响。" />
            ) : null}
            {remoteSearchQuery.data && remoteSearchQuery.data.length > 0 ? (
              <List
                dataSource={remoteSearchQuery.data}
                renderItem={(item) => (
                  <List.Item>
                    <Space orientation="vertical" size={4} style={{ width: '100%' }}>
                      {item.targetPath ? (
                        <Link to={item.targetPath}>
                          <Typography.Text strong>{item.title}</Typography.Text>
                        </Link>
                      ) : (
                        <Typography.Text strong>{item.title}</Typography.Text>
                      )}
                      {item.excerpt ? (
                        <Typography.Text type="secondary">{item.excerpt}</Typography.Text>
                      ) : null}
                    </Space>
                  </List.Item>
                )}
              />
            ) : null}
          </Card>
        ) : null}
      </Space>
    </main>
  )
}

export function AboutDataPage() {
  const sourceCards: Array<{
    id: string
    label: string
    note: React.ReactNode
  }> = [
    {
      id: 'arknights-text',
      label: '剧情文本内容',
      note: (
        <>
          版权归
          <a href="https://ak.hypergryph.com/" target="_blank" rel="noopener noreferrer">
            《明日方舟》
          </a>
          及其权利人所有。
        </>
      ),
    },
    {
      id: 'arknights-images',
      label: '剧情图片内容',
      note: (
        <>
          版权归
          <a href="https://ak.hypergryph.com/" target="_blank" rel="noopener noreferrer">
            《明日方舟》
          </a>
          及其权利人所有。
        </>
      ),
    },
    {
      id: 'arknights-audio',
      label: '游戏音频资源',
      note: (
        <>
          版权归
          <a href="https://ak.hypergryph.com/" target="_blank" rel="noopener noreferrer">
            《明日方舟》
          </a>
          及其权利人所有。
        </>
      ),
    },
    {
      id: 'arknights-wiki',
      label: '其余数据声明',
      note: (
        <>
          曲谱封面和章节内容源自
          <a href="https://prts.wiki/" target="_blank" rel="noopener noreferrer">
            网站PRTS
          </a>
          。本站只作数据的分类和阅读辅助，版权归PRTS网站原作者与
          <a href="https://ak.hypergryph.com/" target="_blank" rel="noopener noreferrer">
            《明日方舟》
          </a>
          及其权利人所有。
        </>
      ),
    },
  ]

  return (
    <main className="page-panel">
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        <span className="page-kicker">Data Sources</span>
        <Typography.Title level={2}>关于数据与版权</Typography.Title>
        <Card className="archive-card" title="内容源声明" style={{ borderRadius: 8 }}>
          <Space orientation="vertical" size={10} style={{ width: '100%' }}>
            {sourceCards.map((source) => (
              <Space className="source-row" key={source.id} orientation="vertical" size={2}>
                <Typography.Text strong>{source.label}</Typography.Text>
                <Typography.Text type="secondary">{source.note}</Typography.Text>
              </Space>
            ))}
          </Space>
        </Card>
      </Space>
    </main>
  )
}

export function AlbumsIndexPage({ locale }: PageProps) {
  const staticStoryRepository = new StaticStoryRepository()

  const catalogQuery = useQuery({
    queryKey: ['albums-index', locale],
    queryFn: async () => staticStoryRepository.getCatalog(locale),
  })

  if (catalogQuery.isLoading) {
    return <LoadingState message="正在加载曲谱列表..." />
  }

  if (catalogQuery.isError || !catalogQuery.data) {
    return <ErrorState message="曲谱列表加载失败。" />
  }

  if (catalogQuery.data.albums.length === 0) {
    return <EmptyState message="暂无可阅读曲谱。" />
  }

  return (
    <main className="page-panel">
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        <span className="page-kicker">Albums</span>
        <Typography.Title level={2}>曲谱</Typography.Title>
        <List
          className="simple-list"
          bordered
          dataSource={catalogQuery.data.albums}
          renderItem={(album) => (
            <List.Item>
              <Space orientation="vertical" size={2} style={{ width: '100%' }}>
                <Typography.Text strong>{album.title}</Typography.Text>
                <Link to={buildAlbumPath(locale, album.id)}>查看曲谱</Link>
              </Space>
            </List.Item>
          )}
        />
      </Space>
    </main>
  )
}

export function ReaderIndexPage({ locale }: PageProps) {
  const lastRead = useReadingProgressStore((state) => state.lastRead)

  return (
    <main className="page-panel">
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        <span className="page-kicker">Reader</span>
        <Typography.Title level={2}>阅读</Typography.Title>
        <Typography.Text type="secondary">请选择具体章节进入阅读页。</Typography.Text>
        {lastRead ? (
          <Link to={buildReadPath(locale, lastRead.albumId, lastRead.chapterId)}>继续阅读</Link>
        ) : (
          <Link to={buildLocaleHomePath(locale)}>返回首页选择曲谱</Link>
        )}
      </Space>
    </main>
  )
}

function AlbumDetailBody({ locale, album }: { locale: AppLocale; album: StaticAlbumData }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const progressByAlbumId = useReadingProgressStore((state) => state.byAlbumId)

  const displayEntryType = normalizeAlbumKind(album.id, album.albumKind)
  const progressPercent = progressByAlbumId[album.id]?.progressPercent ?? 0
  const shouldShowSummary = displayEntryType !== 'otherStory' && Boolean(album.summary)
  const isMainlineDetail = displayEntryType === 'mainline'
  const coverSrc = resolveCoverImageSource(album.cover)

  return (
    <>
      <section
        className={[
          'detail-hero',
          isMainlineDetail ? 'detail-hero--text-only' : 'detail-hero--dossier',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="detail-hero__overview">
          <div className="detail-hero__identity">
            <span className="page-kicker">{toDisplayType(displayEntryType)}</span>
            {!isMainlineDetail && coverSrc ? (
              <h1 className="detail-hero__title detail-hero__title--cover">
                <span className="sr-only">{album.title}</span>
                <ProgressiveImageFrame
                  src={coverSrc}
                  alt={`${album.title} 封面`}
                  aspectRatio={getCoverAspectRatio(album.cover)}
                  fit="contain"
                />
              </h1>
            ) : (
              <h1 className="detail-hero__title">{album.title}</h1>
            )}
            <Space wrap size={6} style={{ marginTop: 14 }}>
              <Tag>{toDisplayType(displayEntryType)}</Tag>
              {resolveMusicClassificationTag(displayEntryType, album.music) ? (
                <Tag>{resolveMusicClassificationTag(displayEntryType, album.music)}</Tag>
              ) : null}
              {displayEntryType === 'otherStory' && album.otherStory?.groupTitle ? (
                <Tag>{album.otherStory.groupTitle}</Tag>
              ) : null}
              {album.music?.recommended ? <Tag color="blue">推荐</Tag> : null}
            </Space>
          </div>

          {shouldShowSummary ? <p className="detail-hero__summary">{album.summary}</p> : null}
        </div>

        <div className="detail-hero__stats">
          <div className="detail-progress">
            <div className="detail-progress__meta">
              <span>共{album.chapters.length}章</span>
              <span>进度 {progressPercent}%</span>
            </div>
            <div className="progress-meter" aria-hidden="true">
              <div className="progress-meter__bar" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
          <Button onClick={() => setDrawerOpen(true)}>下载该曲谱</Button>
        </div>
      </section>

      <Space orientation="vertical" size={18} style={{ width: '100%' }}>
        <div className="section-intro" style={{ marginTop: 0 }}>
          <div>
            <span className="page-kicker">Chapters</span>
            <h2>章节目录</h2>
          </div>
        </div>

        <div
          className="chapter-grid"
          data-testid="album-chapter-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          {album.chapters.map((chapter) => (
            <Card
              className="chapter-card"
              key={chapter.id}
              size="small"
              style={{ borderRadius: 8 }}
            >
              <div className="chapter-card__body">
                <div className="chapter-card__meta">
                  <span>{chapter.code ?? '-'}</span>
                  <span>{chapter.avgTag ?? '-'}</span>
                </div>
                <Typography.Text strong>{chapter.title}</Typography.Text>
                <Link className="card-action" to={buildReadPath(locale, album.id, chapter.id)}>
                  进入阅读页
                </Link>
              </div>
            </Card>
          ))}
        </div>

        {album.extras && album.extras.length > 0 ? (
          <Card className="archive-card" title="附加档案" style={{ borderRadius: 8 }}>
            <List
              dataSource={album.extras}
              renderItem={(extra) => (
                <List.Item>
                  <Space orientation="vertical" size={2} style={{ width: '100%' }}>
                    <Typography.Text strong>{extra.title}</Typography.Text>
                    <Typography.Text type="secondary">类型：{extra.type}</Typography.Text>
                    {extra.path ? (
                      <Typography.Text type="secondary">路径：{extra.path}</Typography.Text>
                    ) : null}
                    {extra.imageId ? (
                      <Typography.Text type="secondary">
                        图片元数据：{extra.imageId}
                      </Typography.Text>
                    ) : null}
                    {extra.musicId ? (
                      <Typography.Text type="secondary">
                        音乐元数据：{extra.musicId}（仅元数据，不默认播放或分发）
                      </Typography.Text>
                    ) : null}
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        ) : null}

        <Drawer
          rootClassName="download-drawer"
          title="下载章节"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          destroyOnClose
          placement="right"
        >
          <DownloadSelectorPanel locale={locale} defaultAlbumId={album.id} />
        </Drawer>
      </Space>
    </>
  )
}

export function AlbumDetailPage({ locale, onAlbumResolved }: PageProps & AlbumBreadcrumbSync) {
  const params = useParams<{ albumId?: string }>()
  const albumId = params.albumId
  const staticStoryRepository = new StaticStoryRepository()

  const albumQuery = useQuery({
    queryKey: ['static-album', locale, albumId],
    queryFn: async () => {
      if (!albumId) {
        throw new Error('Missing albumId')
      }

      return staticStoryRepository.getAlbum(locale, albumId)
    },
    enabled: Boolean(albumId),
  })

  useEffect(() => {
    if (!albumQuery.data) {
      return
    }

    onAlbumResolved(albumQuery.data.title)
  }, [onAlbumResolved, albumQuery.data])

  if (!albumId) {
    return <ErrorState message="缺少 albumId 参数。" />
  }

  if (albumQuery.isLoading) {
    return <LoadingState message="正在加载曲谱详情..." />
  }

  if (albumQuery.isError || !albumQuery.data) {
    return <ErrorState message="曲谱不存在或加载失败。" />
  }

  const album = albumQuery.data
  return (
    <main className="page-panel">
      <AlbumDetailBody locale={locale} album={album} />
    </main>
  )
}

export function ReaderPage({
  locale,
  onAlbumResolved,
  onChapterResolved,
}: PageProps & ReaderBreadcrumbSync) {
  const params = useParams<{ albumId?: string; chapterId?: string }>()
  const albumId = params.albumId
  const chapterId = params.chapterId
  const staticStoryRepository = useMemo(() => new StaticStoryRepository(), [])
  const readerService = useMemo(
    () => new ReaderService(staticStoryRepository),
    [staticStoryRepository]
  )
  const storyRelatedRefRenderer = useMemo(() => new StoryRelatedRefRenderer(), [])
  const queryClient = useQueryClient()
  const [directoryOpen, setDirectoryOpen] = useState(false)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const readerChoiceKey = `${locale}:${albumId ?? ''}:${chapterId ?? ''}`
  const [choiceSelectionState, setChoiceSelectionState] = useState<{
    key: string
    selections: Record<string, number>
  }>(() => ({ key: readerChoiceKey, selections: {} }))
  const choiceSelections =
    choiceSelectionState.key === readerChoiceKey ? choiceSelectionState.selections : {}
  const updateProgress = useReadingProgressStore((state) => state.updateProgress)
  const doctorName = useAppSettingsStore((state) => state.doctorName)
  const openReaderDownloadDrawer = useCallback(() => setDownloadOpen(true), [])

  useHeaderDownloadAction(openReaderDownloadDrawer)

  const chapterQuery = useQuery({
    queryKey: ['reader-chapter', locale, albumId, chapterId],
    queryFn: async () => {
      if (!albumId || !chapterId) {
        throw new Error('Missing route params')
      }

      return readerService.loadChapter(locale, albumId, chapterId)
    },
    enabled: Boolean(albumId && chapterId),
  })

  const timelineQuery = useQuery({
    queryKey: ['reader-timeline', locale],
    queryFn: async () => staticStoryRepository.getTimeline(locale),
  })

  const catalogQuery = useQuery({
    queryKey: ['reader-catalog', locale],
    queryFn: async () => staticStoryRepository.getCatalog(locale),
  })

  const knowledgeRelatedQuery = useQuery({
    queryKey: ['reader-knowledge-related-index', locale],
    queryFn: async () => staticStoryRepository.getKnowledgeRelatedIndex(locale),
  })

  useEffect(() => {
    if (!chapterQuery.data) {
      return
    }

    onAlbumResolved(chapterQuery.data.album.title)
    onChapterResolved(chapterQuery.data.chapter.title)
  }, [chapterQuery.data, onChapterResolved, onAlbumResolved])

  useEffect(() => {
    if (!chapterQuery.data) {
      return
    }

    const nextChapterId = chapterQuery.data.chapter.navigation.nextChapterId

    if (!nextChapterId || !albumId) {
      return
    }

    void queryClient.prefetchQuery({
      queryKey: ['reader-chapter', locale, albumId, nextChapterId],
      queryFn: async () => readerService.loadChapter(locale, albumId, nextChapterId),
    })
  }, [chapterQuery.data, locale, queryClient, readerService, albumId])

  useEffect(() => {
    if (!albumId || !chapterId || !chapterQuery.data) {
      return
    }

    const chapterIds = chapterQuery.data.album.chapters.map((chapter) => chapter.id)
    updateProgress({
      albumId,
      chapterId,
      progressPercent: calculateAlbumProgressPercent({
        chapterIds,
        currentChapterId: chapterId,
      }),
      updatedAt: new Date().toISOString(),
    })
  }, [chapterId, chapterQuery.data, albumId, updateProgress])

  const loadedPayload = chapterQuery.data
  const loadedAlbum = loadedPayload?.album
  const loadedChapter = loadedPayload?.chapter
  const knowledgeSourceIds = useMemo(
    () => (loadedAlbum && loadedChapter ? buildKnowledgeSourceIds(loadedAlbum, loadedChapter) : []),
    [loadedChapter, loadedAlbum]
  )
  const knowledgeRelatedItems = useMemo(() => {
    const items = knowledgeRelatedQuery.data?.items

    if (!items) {
      return []
    }

    for (const sourceId of knowledgeSourceIds) {
      const related = items[sourceId]

      if (related && related.length > 0) {
        return related
      }
    }

    return []
  }, [knowledgeRelatedQuery.data, knowledgeSourceIds])
  const knowledgeInlineMarkersByBlock = useMemo(
    () =>
      buildKnowledgeInlineMarkers(
        knowledgeRelatedItems,
        knowledgeSourceIds,
        loadedChapter?.blocks ?? []
      ),
    [knowledgeRelatedItems, knowledgeSourceIds, loadedChapter]
  )
  const knowledgeTargetAlbumIds = useMemo(
    () =>
      Array.from(
        new Set(
          knowledgeRelatedItems
            .map((item) => item.targetAlbumId)
            .filter((item): item is string => Boolean(item))
        )
      ),
    [knowledgeRelatedItems]
  )

  const knowledgeTargetAlbumsQuery = useQuery({
    queryKey: ['reader-knowledge-target-albums', locale, knowledgeTargetAlbumIds],
    enabled: knowledgeTargetAlbumIds.length > 0,
    queryFn: async () => {
      const albums = await Promise.all(
        knowledgeTargetAlbumIds.map(async (targetAlbumId) => {
          try {
            return await staticStoryRepository.getAlbum(locale, targetAlbumId)
          } catch {
            return null
          }
        })
      )

      return new Map(
        albums
          .filter((album): album is StaticAlbumData => Boolean(album))
          .map((album) => [album.id, album])
      )
    },
  })
  const chapterIndex =
    loadedAlbum && loadedChapter
      ? loadedAlbum.chapters.findIndex((item) => item.id === loadedChapter.id)
      : -1
  const isFirstChapter = chapterIndex <= 0
  const isLastChapter =
    loadedAlbum && chapterIndex >= 0 ? chapterIndex >= loadedAlbum.chapters.length - 1 : false

  const orderedMainlineAlbumIds = useMemo(() => {
    const timelineCards = dedupeByAlbumId(
      (timelineQuery.data?.items ?? []).map((item) => ({
        albumId: item.albumId,
        slug: item.slug,
        title: item.title,
        cover: item.cover,
        albumKind: item.albumKind,
        section: item.section as TimelineCardViewModel['section'],
        side: item.side,
        timelineRank: item.timelineRank,
        gameOrderRank: item.gameOrderRank,
        chapterCount: item.chapterCount,
        progressPercent: 0,
        summary: item.summary,
        music: item.music,
        operator: item.operator,
      }))
    )

    if (catalogQuery.data) {
      return buildClassifiedAlbums(timelineCards, catalogQuery.data.albums)
        .filter((item) => item.sectionKey === 'mainline')
        .sort(
          (left, right) =>
            left.timelineRank - right.timelineRank ||
            left.gameOrderRank - right.gameOrderRank ||
            left.albumId.localeCompare(right.albumId)
        )
        .map((item) => item.albumId)
    }

    return timelineCards
      .filter((item) => normalizeAlbumKind(item.albumId, item.albumKind) === 'mainline')
      .sort(compareTimelineOrder)
      .map((item) => item.albumId)
  }, [catalogQuery.data, timelineQuery.data])

  const currentMainlineAlbumIndex = loadedAlbum
    ? orderedMainlineAlbumIds.findIndex((item) => item === loadedAlbum.id)
    : -1

  const previousMainlineAlbumId =
    currentMainlineAlbumIndex > 0
      ? orderedMainlineAlbumIds[currentMainlineAlbumIndex - 1]
      : undefined
  const nextMainlineAlbumId =
    currentMainlineAlbumIndex >= 0 && currentMainlineAlbumIndex < orderedMainlineAlbumIds.length - 1
      ? orderedMainlineAlbumIds[currentMainlineAlbumIndex + 1]
      : undefined

  const isLoadedMainlineAlbum = loadedAlbum
    ? normalizeAlbumKind(loadedAlbum.id, loadedAlbum.albumKind) === 'mainline'
    : false

  const previousMainlineAlbumQuery = useQuery({
    queryKey: ['reader-previous-mainline-album', locale, previousMainlineAlbumId],
    enabled: Boolean(isLoadedMainlineAlbum && isFirstChapter && previousMainlineAlbumId),
    queryFn: async () => {
      if (!previousMainlineAlbumId) {
        throw new Error('Missing previous mainline album id')
      }

      return staticStoryRepository.getAlbum(locale, previousMainlineAlbumId)
    },
  })

  const nextMainlineAlbumQuery = useQuery({
    queryKey: ['reader-next-mainline-album', locale, nextMainlineAlbumId],
    enabled: Boolean(isLoadedMainlineAlbum && isLastChapter && nextMainlineAlbumId),
    queryFn: async () => {
      if (!nextMainlineAlbumId) {
        throw new Error('Missing next mainline album id')
      }

      return staticStoryRepository.getAlbum(locale, nextMainlineAlbumId)
    },
  })

  const previousMainlineTargetChapterId =
    previousMainlineAlbumQuery.data && previousMainlineAlbumQuery.data.chapters.length > 0
      ? previousMainlineAlbumQuery.data.chapters[
          previousMainlineAlbumQuery.data.chapters.length - 1
        ]?.id
      : undefined
  const nextMainlineTargetChapterId =
    nextMainlineAlbumQuery.data && nextMainlineAlbumQuery.data.chapters.length > 0
      ? nextMainlineAlbumQuery.data.chapters[0]?.id
      : undefined

  if (!albumId || !chapterId) {
    return <ErrorState message="阅读页参数缺失。" />
  }

  if (chapterQuery.isLoading) {
    return <LoadingState message="正在加载章节..." />
  }

  if (chapterQuery.isError || !chapterQuery.data) {
    return <ErrorState message="章节加载失败。" />
  }

  const payload = chapterQuery.data
  const chapter = payload.chapter
  const readerInstance = payload.reader
  const missingStoryTextDiagnostic = chapter.buildDiagnostics?.find(
    (item) => item.code === 'missing-story-text'
  )

  if (missingStoryTextDiagnostic) {
    const sourceHint =
      missingStoryTextDiagnostic.sourcePath ??
      missingStoryTextDiagnostic.storyTxt ??
      'unknown-source'
    return <ErrorState message={`章节正文缺失，暂无法阅读（${sourceHint}）。`} />
  }

  const previousChapterId =
    readerInstance.previousChapter?.id ?? chapter.navigation.previousChapterId
  const nextChapterId = readerInstance.nextChapter?.id ?? chapter.navigation.nextChapterId

  const readableBlocksResult = getReadableStoryBlocks(chapter.blocks)
  const readerBlocks = dedupeConsecutiveVisualCues(readableBlocksResult.blocks)
  const chapterCitations = chapter.citations
  const knowledgeTargetAlbums =
    knowledgeTargetAlbumsQuery.data ?? new Map<string, StaticAlbumData>()
  const storyRelatedRefNode = storyRelatedRefRenderer.render(readerInstance.chapter.relatedRef)

  return (
    <main className="reader-page">
      <article className="reader-article">
        <header className="reader-header">
          <span className="page-kicker">{payload.album.title}</span>
          <h1 className="reader-header__title">{chapter.title}</h1>
          <div className="reader-header__subtitle">{chapter.subtitle ?? payload.album.title}</div>
          <div className="reader-header__meta">
            {chapter.code ?? '-'} · {chapter.avgTag ?? '-'}
          </div>
        </header>

        <div className="reader-content" style={{ margin: '0 auto', maxWidth: 760, width: '100%' }}>
          <div className="reader-content__flow">
            <ReaderBlockSequence
              blocks={readerBlocks}
              chapterCitations={chapterCitations}
              depth={0}
              doctorName={doctorName}
              choiceSelections={choiceSelections}
              knowledgeMarkersByBlock={knowledgeInlineMarkersByBlock}
              onChoiceSelect={(choiceId, optionIndex) =>
                setChoiceSelectionState((current) => ({
                  key: readerChoiceKey,
                  selections: {
                    ...(current.key === readerChoiceKey ? current.selections : {}),
                    [choiceId]: optionIndex,
                  },
                }))
              }
            />
          </div>
        </div>

        <nav className="reader-footer-nav" aria-label="正文末尾导航">
          <div className="reader-footer-nav__side reader-footer-nav__side--previous">
            {previousChapterId ? (
              <Link to={buildReadPath(locale, payload.album.id, previousChapterId)}>上一章</Link>
            ) : null}
            {isLoadedMainlineAlbum && isFirstChapter && previousMainlineTargetChapterId ? (
              <Link
                to={buildReadPath(
                  locale,
                  previousMainlineAlbumQuery.data!.id,
                  previousMainlineTargetChapterId
                )}
              >
                上一曲谱
              </Link>
            ) : null}
          </div>
          <div className="reader-footer-nav__side reader-footer-nav__side--next">
            {nextChapterId ? (
              <Link to={buildReadPath(locale, payload.album.id, nextChapterId)}>下一章</Link>
            ) : null}
            {isLoadedMainlineAlbum && isLastChapter && nextMainlineTargetChapterId ? (
              <Link
                to={buildReadPath(
                  locale,
                  nextMainlineAlbumQuery.data!.id,
                  nextMainlineTargetChapterId
                )}
              >
                下一曲谱
              </Link>
            ) : null}
          </div>
        </nav>

        <Card
          className="reader-related-card archive-card"
          title={`相关篇章索引${knowledgeRelatedItems.length > 0 ? ` · ${knowledgeRelatedItems.length}` : ''}`}
          style={{ borderRadius: 8 }}
        >
          {storyRelatedRefNode ? (
            storyRelatedRefNode
          ) : knowledgeRelatedQuery.isLoading ? (
            <Typography.Text type="secondary">正在读取相关索引...</Typography.Text>
          ) : knowledgeRelatedItems.length === 0 ? (
            <Typography.Text type="secondary">暂无相关索引。</Typography.Text>
          ) : (
            <div className="reader-related-list">
              {knowledgeRelatedItems.map((related, index) => (
                <ReaderKnowledgeRelatedLink
                  key={related.id}
                  locale={locale}
                  markerNumber={index + 1}
                  related={related}
                  targetAlbum={
                    related.targetAlbumId
                      ? knowledgeTargetAlbums.get(related.targetAlbumId)
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </Card>
      </article>

      <Drawer title="章节目录" open={directoryOpen} onClose={() => setDirectoryOpen(false)}>
        <List
          dataSource={payload.album.chapters}
          renderItem={(chapterItem) => (
            <List.Item>
              <Link to={buildReadPath(locale, payload.album.id, chapterItem.id)}>
                {chapterItem.title}
              </Link>
            </List.Item>
          )}
        />
      </Drawer>

      <Drawer
        rootClassName="download-drawer"
        title="下载章节"
        open={downloadOpen}
        onClose={() => setDownloadOpen(false)}
        destroyOnClose
        placement="right"
      >
        <DownloadSelectorPanel
          locale={locale}
          defaultAlbumId={payload.album.id}
          focusedChapterId={chapter.id}
        />
      </Drawer>
    </main>
  )
}

function ReaderKnowledgeRelatedLink({
  locale,
  markerNumber,
  related,
  targetAlbum,
}: {
  locale: AppLocale
  markerNumber: number
  related: StaticKnowledgeRelatedItem
  targetAlbum?: StaticAlbumData
}) {
  const targetChapter = targetAlbum ? findKnowledgeTargetChapter(related, targetAlbum) : undefined
  const targetPath = targetChapter
    ? buildReadPath(locale, targetAlbum!.id, targetChapter.id)
    : related.targetAlbumId
      ? buildAlbumPath(locale, related.targetAlbumId)
      : buildSearchPath(locale, related.targetTitle ?? related.targetId)
  const targetSummary = buildKnowledgeTargetSummary(related, targetAlbum, targetChapter)
  const overview = getKnowledgeReasonOverview(related.reason)
  const anchorId = buildKnowledgeRelatedAnchorId(markerNumber)

  return (
    <div className="reader-related-item" id={anchorId}>
      <Link className="reader-related-item__title" rel="noreferrer" target="_blank" to={targetPath}>
        <span className="reader-related-item__marker">[{markerNumber}]</span>
        <span className="reader-related-item__citation">
          <span className="reader-related-item__chapter-title">{targetSummary.chapterTitle}</span>
          <span className="reader-related-item__meta">
            {targetSummary.albumTitle ? (
              <em className="reader-related-item__album-title">《{targetSummary.albumTitle}》</em>
            ) : null}
            {targetSummary.code ? <span>{targetSummary.code}</span> : null}
            {targetSummary.part ? <span>{targetSummary.part}</span> : null}
          </span>
        </span>
      </Link>
      <Typography.Text className="reader-related-item__reason" type="secondary">
        {overview}
      </Typography.Text>
    </div>
  )
}

function buildKnowledgeRelatedAnchorId(markerNumber: number): string {
  return `reader-related-index-${markerNumber}`
}

function buildKnowledgeInlineMarkers(
  relatedItems: StaticKnowledgeRelatedItem[],
  sourceIds: string[],
  blocks: StaticChapterData['blocks']
): Map<string, ReaderKnowledgeInlineMarker[]> {
  const sourceIdSet = new Set(sourceIds)
  const markersByBlock = new Map<string, ReaderKnowledgeInlineMarker[]>()
  const knownBlockIds = new Set(blocks.map((block) => block.id))
  const addMarker = (blockId: string, marker: ReaderKnowledgeInlineMarker) => {
    const existing = markersByBlock.get(blockId) ?? []
    if (existing.some((item) => item.number === marker.number)) {
      return
    }

    markersByBlock.set(blockId, [...existing, marker])
  }

  relatedItems.forEach((related, index) => {
    const marker: ReaderKnowledgeInlineMarker = {
      number: index + 1,
      anchorId: buildKnowledgeRelatedAnchorId(index + 1),
    }

    for (const evidence of related.evidence ?? []) {
      if (!sourceIdSet.has(evidence.contentId)) {
        continue
      }

      if (evidence.blockId && knownBlockIds.has(evidence.blockId)) {
        addMarker(evidence.blockId, marker)
        continue
      }

      const excerpt = evidence.excerpt?.trim()
      if (!excerpt) {
        continue
      }

      const matchedBlock = blocks.find((block) =>
        getKnowledgeSearchableBlockText(block).includes(excerpt)
      )
      if (matchedBlock) {
        addMarker(matchedBlock.id, marker)
      }
    }
  })

  return markersByBlock
}

function getKnowledgeSearchableBlockText(block: StaticChapterData['blocks'][number]): string {
  if (block.type === 'dialogue' || block.type === 'narration') {
    return block.text
  }

  if (block.type === 'choice') {
    return block.options.join('\n')
  }

  return ''
}

function buildKnowledgeTargetSummary(
  related: StaticKnowledgeRelatedItem,
  targetAlbum: StaticAlbumData | undefined,
  targetChapter: StaticAlbumData['chapters'][number] | undefined
): { chapterTitle: string; albumTitle?: string; code?: string; part?: string } {
  const fallbackTitle = related.targetTitle ?? related.targetId
  return {
    chapterTitle: targetChapter?.title ?? stripKnowledgeTargetTitle(fallbackTitle),
    albumTitle: targetAlbum?.title,
    code: targetChapter?.code ?? extractStageCode(fallbackTitle),
    part: targetChapter?.avgTag ?? extractKnowledgeTargetPartLabel(fallbackTitle),
  }
}

function stripKnowledgeTargetTitle(value: string): string {
  return (
    value
      .replace(/^[A-Z]{1,4}\d?(?:-[A-Z]+)?-\d+\s*/i, '')
      .replace(/^[0-9]{1,2}-\d+\s*/, '')
      .replace(/\s*(?:行动前|行动后|幕间)\s*$/u, '')
      .trim() || value
  )
}

function extractKnowledgeTargetPartLabel(value: string): string | undefined {
  const match = value.match(/(行动前|行动后|幕间)\s*$/u)
  return match?.[1]
}

function getKnowledgeReasonOverview(reason: string): string {
  const overview = reason.split(/[；;]/u)[0]?.trim()
  return overview && overview.length > 0 ? overview : reason
}

function buildKnowledgeSourceIds(album: StaticAlbumData, chapter: StaticChapterData): string[] {
  const sourceIds = new Set<string>()

  if (chapter.sourceContentId) {
    sourceIds.add(chapter.sourceContentId)
  }

  sourceIds.add(chapter.id)

  const stageCode = chapter.code?.normalize('NFKC').trim().toLowerCase()

  if (!stageCode) {
    return Array.from(sourceIds)
  }

  const part = inferKnowledgeSourcePart(chapter)
  const preferredCategory = inferKnowledgeSourceCategory(album)
  const categories = [preferredCategory, 'mainline', 'sidestory', 'other'].filter(
    (item, index, list): item is string => Boolean(item) && list.indexOf(item) === index
  )

  for (const category of categories) {
    sourceIds.add(`storyline:${category}:${stageCode}:${stageCode}:${part}`)
  }

  return Array.from(sourceIds)
}

function inferKnowledgeSourceCategory(album: StaticAlbumData): string | undefined {
  const normalizedType = normalizeAlbumKind(album.id, album.albumKind)

  if (normalizedType === 'mainline') {
    return 'mainline'
  }

  if (normalizedType === 'otherStory') {
    return 'other'
  }

  if (
    normalizedType === 'intermezzi' ||
    normalizedType === 'sidestory' ||
    normalizedType === 'sideStory' ||
    normalizedType === 'sideStory'
  ) {
    return 'sidestory'
  }

  return undefined
}

function inferKnowledgeSourcePart(chapter: StaticChapterData): 'beg' | 'end' | 'main' {
  const marker = `${chapter.id} ${chapter.title} ${chapter.avgTag ?? ''}`.toLowerCase()

  if (chapter.avgTag === '行动前' || /(?:_beg|-beg|\bbeg\b|行动前)/i.test(marker)) {
    return 'beg'
  }

  if (chapter.avgTag === '行动后' || /(?:_end|-end|\bend\b|行动后)/i.test(marker)) {
    return 'end'
  }

  return 'main'
}

function findKnowledgeTargetChapter(
  related: StaticKnowledgeRelatedItem,
  targetAlbum: StaticAlbumData
): StaticAlbumData['chapters'][number] | undefined {
  const exactMatch = targetAlbum.chapters.find((chapter) => chapter.id === related.targetId)

  if (exactMatch) {
    return exactMatch
  }

  const targetTitle = related.targetTitle ?? related.targetId
  const normalizedTargetTitle = normalizeKnowledgeMatchText(targetTitle)
  const targetCode = extractStageCode(targetTitle)
  const targetPart = inferTargetPart(targetTitle)
  const candidates = targetAlbum.chapters.filter((chapter) => {
    const codeMatches = targetCode ? normalizeKnowledgeMatchText(chapter.code) === targetCode : true
    const titleMatches = chapter.title
      ? normalizedTargetTitle.includes(normalizeKnowledgeMatchText(chapter.title))
      : true

    return codeMatches && titleMatches
  })

  if (candidates.length === 0) {
    return undefined
  }

  if (targetPart) {
    const partMatch = candidates.find((chapter) => {
      const chapterText = normalizeKnowledgeMatchText(
        [chapter.id, chapter.title, chapter.avgTag, chapter.code].filter(Boolean).join(' ')
      )

      return targetPart === 'beg'
        ? /(?:BEG|BEGIN|BEFORE|行动前|幕间)$/.test(chapterText) || chapterText.includes('_BEG')
        : /(?:END|AFTER|行动后)$/.test(chapterText) || chapterText.includes('_END')
    })

    if (partMatch) {
      return partMatch
    }
  }

  return candidates[0]
}

function extractStageCode(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  return normalizeKnowledgeMatchText(value).match(
    /[A-Z]{1,4}\d?(?:-[A-Z]+)?-\d+|[0-9]{1,2}-\d+/
  )?.[0]
}

function inferTargetPart(value: string | undefined): 'beg' | 'end' | undefined {
  if (!value) {
    return undefined
  }

  if (/行动前|\/BEG\b|_BEG\b|-BEG\b/i.test(value)) {
    return 'beg'
  }

  if (/行动后|\/END\b|_END\b|-END\b/i.test(value)) {
    return 'end'
  }

  return undefined
}

function normalizeKnowledgeMatchText(value: string | undefined): string {
  return (value ?? '').normalize('NFKC').trim().toUpperCase()
}

function formatContinueReadingChapterLabel(
  chapter: Pick<StaticChapterData, 'code' | 'avgTag'> | undefined
): string | undefined {
  if (!chapter?.code) {
    return undefined
  }

  const phase = formatChapterPhaseShortLabel(chapter.avgTag)
  return phase ? `${chapter.code}(${phase})` : chapter.code
}

function formatChapterPhaseShortLabel(avgTag: string | undefined): string | undefined {
  if (avgTag === '行动前') {
    return '前'
  }

  if (avgTag === '行动后') {
    return '后'
  }

  return undefined
}

function TerraHistoricusSection({
  items,
  isLoading,
  isError,
}: {
  items: StaticTerraHistoricusComicData[]
  isLoading: boolean
  isError: boolean
}) {
  if (isLoading) {
    return <LoadingState message="正在读取泰拉记事社目录..." />
  }

  if (isError) {
    return <ErrorState message="泰拉记事社目录加载失败，请先同步静态目录。" />
  }

  if (items.length === 0) {
    return <EmptyState message="暂无泰拉记事社作品目录，请先运行同步命令。" />
  }

  return (
    <div className="terra-comic-grid" data-testid="home-terra-historicus-grid">
      {items.map((item) => (
        <a
          aria-label={`打开泰拉记事社作品：${item.title}`}
          className="terra-comic-card-link"
          href={item.url}
          key={item.cid}
          rel="noreferrer"
          target="_blank"
        >
          <Card className="story-card story-card--mainline terra-comic-card" hoverable>
            <Typography.Title className="terra-comic-card__title" level={5}>
              {item.title}
            </Typography.Title>
            <div className="terra-comic-card__coverWrap">
              <img
                className="terra-comic-card__cover"
                src={item.coverPath || item.cover}
                alt={item.title}
                referrerPolicy="no-referrer"
              />
            </div>
          </Card>
        </a>
      ))}
    </div>
  )
}

export function HomePage({ locale }: PageProps) {
  const staticStoryRepository = new StaticStoryRepository()
  const location = useLocation()
  const lastRead = useReadingProgressStore((state) => state.lastRead)
  const progressByAlbumId = useReadingProgressStore((state) => state.byAlbumId)
  const activeSection = resolveHomeSectionFromSearch(location.search)
  const homeUiKey = `${locale}:${location.search}`
  const [homeUiState, setHomeUiState] = useState<{
    key: string
    selectedAlbumId: string | null
    toggledGroupKeys: Set<string>
  }>(() => ({
    key: homeUiKey,
    selectedAlbumId: null,
    toggledGroupKeys: new Set(),
  }))
  const selectedAlbumId = homeUiState.key === homeUiKey ? homeUiState.selectedAlbumId : null
  const toggledGroupKeys =
    homeUiState.key === homeUiKey ? homeUiState.toggledGroupKeys : new Set<string>()

  const manifestQuery = useQuery({
    queryKey: ['static-manifest', locale],
    queryFn: async () => staticStoryRepository.getManifest(locale),
  })

  const catalogQuery = useQuery({
    queryKey: ['static-catalog', locale],
    queryFn: async () => staticStoryRepository.getCatalog(locale),
  })

  const timelineQuery = useQuery({
    queryKey: ['static-timeline', locale],
    queryFn: async () => staticStoryRepository.getTimeline(locale),
  })

  const operatorTopologyQuery = useQuery({
    queryKey: ['operator-topology'],
    enabled: activeSection === 'operatorRecord',
    queryFn: async () =>
      buildOperatorTopologyItems(await staticStoryRepository.getOperatorIndex(), locale),
  })

  const terraHistoricusQuery = useQuery({
    queryKey: ['terra-historicus-index'],
    enabled: activeSection === 'terraHistoricus',
    queryFn: async () => staticStoryRepository.getTerraHistoricusIndex(),
  })

  const missingTimelineAlbumIds = useMemo(() => {
    if (!timelineQuery.data || !catalogQuery.data) {
      return [] as string[]
    }

    const timelineAlbumIdSet = new Set(timelineQuery.data.items.map((item) => item.albumId))
    return catalogQuery.data.albums
      .filter((album) => !timelineAlbumIdSet.has(album.id))
      .map((album) => album.id)
  }, [catalogQuery.data, timelineQuery.data])

  const missingAlbumDetailQuery = useQuery({
    queryKey: ['home-missing-album-details', locale, missingTimelineAlbumIds.join(',')],
    enabled: missingTimelineAlbumIds.length > 0,
    queryFn: async () => {
      const missingAlbums = await Promise.all(
        missingTimelineAlbumIds.map(
          async (albumId) =>
            [albumId, await staticStoryRepository.getAlbum(locale, albumId)] as const
        )
      )

      return Object.fromEntries(missingAlbums)
    },
  })

  const selectedAlbumQuery = useQuery({
    queryKey: ['home-selected-album-detail', locale, selectedAlbumId],
    enabled: Boolean(selectedAlbumId),
    queryFn: async () => {
      if (!selectedAlbumId) {
        throw new Error('Missing selected album id')
      }

      return staticStoryRepository.getAlbum(locale, selectedAlbumId)
    },
  })

  const lastReadAlbumQuery = useQuery({
    queryKey: ['home-last-read-album-detail', locale, lastRead?.albumId],
    enabled: Boolean(lastRead?.albumId),
    queryFn: async () => {
      if (!lastRead?.albumId) {
        throw new Error('Missing last read album id')
      }

      return staticStoryRepository.getAlbum(locale, lastRead.albumId)
    },
  })

  if (
    manifestQuery.isLoading ||
    catalogQuery.isLoading ||
    timelineQuery.isLoading ||
    missingAlbumDetailQuery.isLoading
  ) {
    return <LoadingState message="正在读取静态构建产物..." />
  }

  if (
    manifestQuery.isError ||
    catalogQuery.isError ||
    timelineQuery.isError ||
    missingAlbumDetailQuery.isError
  ) {
    return <ErrorState message="未检测到静态构建产物，请先运行 pnpm data:build --locale zh_CN" />
  }

  const timelineCount = timelineQuery.data?.items.length ?? 0
  const catalogCount = catalogQuery.data?.albums.length ?? 0

  if (timelineCount === 0) {
    return <EmptyState message="静态时间线为空，请检查构建输入。" />
  }

  const timelineCards = dedupeByAlbumId(
    (timelineQuery.data?.items ?? []).map((item) => ({
      albumId: item.albumId,
      slug: item.slug,
      title: item.title,
      cover: item.cover,
      albumKind: item.albumKind,
      section: item.section,
      side: item.side,
      timelineRank: item.timelineRank,
      gameOrderRank: item.gameOrderRank,
      chapterCount: item.chapterCount,
      progressPercent: progressByAlbumId[item.albumId]?.progressPercent ?? 0,
      summary: item.summary,
      music: item.music,
      otherStory: item.otherStory,
      operator: item.operator,
    }))
  )

  const timelineCardByAlbumId = new Map(timelineCards.map((item) => [item.albumId, item]))
  const classifiedAlbums = buildClassifiedAlbums(timelineCards, catalogQuery.data?.albums ?? [])
  const missingAlbumDetails = missingAlbumDetailQuery.data ?? {}

  const mergedTimelineCards = classifiedAlbums.map((classified) => {
    const existing = timelineCardByAlbumId.get(classified.albumId)
    if (existing) {
      return {
        ...existing,
        progressPercent: progressByAlbumId[existing.albumId]?.progressPercent ?? 0,
        otherStory: existing.otherStory ?? classified.otherStory,
      }
    }

    const detail = missingAlbumDetails[classified.albumId]
    return {
      albumId: classified.albumId,
      slug: classified.slug,
      title: detail?.title ?? classified.title,
      cover: detail?.cover,
      albumKind: classified.albumKind,
      section: classified.section,
      side: classified.side,
      timelineRank: classified.timelineRank,
      gameOrderRank: classified.gameOrderRank,
      chapterCount: detail?.chapters.length ?? 0,
      progressPercent: progressByAlbumId[classified.albumId]?.progressPercent ?? 0,
      summary: detail?.summary,
      music: detail?.music,
      otherStory: detail?.otherStory ?? classified.otherStory,
    } satisfies TimelineCardViewModel
  })

  const uniqueSearchableCards = dedupeByAlbumId(mergedTimelineCards)

  const cardsBySection = {
    mainline: uniqueSearchableCards
      .filter(
        (item) =>
          (item.section === 'mainline' && item.side === 'left') || item.albumKind === 'mainline'
      )
      .sort(compareTimelineOrder),
    sideStory: uniqueSearchableCards
      .filter(
        (item) =>
          (item.section === 'mainline' && item.side === 'right') ||
          item.section === 'sideStory' ||
          item.albumKind === 'intermezzi' ||
          item.albumKind === 'sideStory'
      )
      .sort(compareTimelineOrder),
    otherStory: uniqueSearchableCards
      .filter((item) => item.section === 'otherStory' || item.albumKind === 'otherStory')
      .sort((left, right) => left.title.localeCompare(right.title, 'zh-Hans-CN')),
    operatorRecord: uniqueSearchableCards
      .filter((item) => item.section === 'operatorRecord')
      .sort(compareTimelineOrder),
    terraHistoricus: [],
  } satisfies Record<HomeSectionKey, TimelineCardViewModel[]>

  const mainlineEpisodeIndexByAlbumId = new Map(
    cardsBySection.mainline.map((item, index) => [item.albumId, index])
  )
  const activeSectionCards = cardsBySection[activeSection]
  const activeAlbumGroups = groupAlbumCards(activeSectionCards)
  const lastReadAlbum = lastRead
    ? catalogQuery.data?.albums.find((album) => album.id === lastRead.albumId)
    : undefined
  const lastReadChapter = lastReadAlbumQuery.data?.chapters.find(
    (chapter) => chapter.id === lastRead?.chapterId
  )
  const lastReadChapterLabel = formatContinueReadingChapterLabel(lastReadChapter)
  const lastReadLabel = [lastReadAlbum?.title, lastReadChapterLabel].filter(Boolean).join(' ')

  const operatorTopologyItems =
    activeSection === 'operatorRecord' && operatorTopologyQuery.data
      ? operatorTopologyQuery.data
      : buildFallbackOperatorTopologyItems(cardsBySection.operatorRecord, locale)
  const operatorTopologyGroups = groupOperatorTopologyItems(operatorTopologyItems)
  const terraHistoricusItems = terraHistoricusQuery.data?.comics ?? []

  const activeSectionLabel = toDisplayType(activeSection)
  const isGroupCollapsed = (section: HomeSectionKey, groupKey: string): boolean => {
    const defaultCollapsed = section !== 'mainline'
    return toggledGroupKeys.has(groupKey) ? !defaultCollapsed : defaultCollapsed
  }

  const toggleAlbumGroup = (groupKey: string) => {
    setHomeUiState((previous) => {
      const currentKeys = previous.key === homeUiKey ? previous.toggledGroupKeys : new Set<string>()
      const next = new Set(currentKeys)

      if (next.has(groupKey)) {
        next.delete(groupKey)
      } else {
        next.add(groupKey)
      }

      return {
        key: homeUiKey,
        selectedAlbumId: previous.key === homeUiKey ? previous.selectedAlbumId : null,
        toggledGroupKeys: next,
      }
    })
  }

  return (
    <main>
      <section className="home-status-panel" aria-labelledby="home-title">
        <div className="home-status-panel__heading">
          <h1 id="home-title" className="sr-only">
            ArkStoryline
          </h1>
          <span className="page-kicker">当前收录</span>
        </div>

        <div className="home-stats" aria-label="站点概览">
          <div className="stat-card">
            <span className="stat-card__value">{catalogCount}</span>
            <span className="stat-card__label">曲谱数量</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__value">{timelineCount}</span>
            <span className="stat-card__label">时间线条目</span>
          </div>
        </div>

        {lastRead ? (
          <Link
            className="continue-card stat-card"
            to={buildReadPath(locale, lastRead.albumId, lastRead.chapterId)}
          >
            <span className="continue-card__copy">
              <span
                className="stat-card__value"
                style={{
                  fontWeight: 700,
                  fontSize: '20px',
                  lineHeight: 1,
                  fontFamily: 'var(--as-sans)',
                }}
              >
                继续阅读
              </span>
              <span className="stat-card__label continue-card__title">
                <span>{lastReadLabel || '最近阅读'}</span>
              </span>
            </span>
            <span className="continue-card__arrow" aria-hidden="true">
              →
            </span>
          </Link>
        ) : null}
      </section>

      <section>
        <div className="section-intro">
          <div>
            <span className="page-kicker">Browse</span>
            <h2>{activeSectionLabel}</h2>
          </div>
          <span className="section-intro__count">
            {activeSection === 'operatorRecord'
              ? `${operatorTopologyItems.length} 位干员`
              : activeSection === 'terraHistoricus'
                ? `${terraHistoricusItems.length} 部作品`
                : `${activeSectionCards.length} 个条目`}
          </span>
        </div>

        {activeSection === 'terraHistoricus' ? (
          <TerraHistoricusSection
            isLoading={terraHistoricusQuery.isLoading}
            isError={terraHistoricusQuery.isError}
            items={terraHistoricusItems}
          />
        ) : activeSection === 'operatorRecord' ? (
          <OperatorTopologyGroups
            groups={operatorTopologyGroups}
            isGroupCollapsed={(groupKey) => isGroupCollapsed(activeSection, groupKey)}
            onToggleGroup={toggleAlbumGroup}
          />
        ) : isHomeAlbumSectionKey(activeSection) ? (
          <HomeAlbumGroups
            locale={locale}
            sectionKey={activeSection}
            sectionLabel={activeSectionLabel}
            groups={activeAlbumGroups}
            mainlineEpisodeIndexByAlbumId={mainlineEpisodeIndexByAlbumId}
            isGroupCollapsed={(groupKey) => isGroupCollapsed(activeSection, groupKey)}
            onToggleGroup={toggleAlbumGroup}
            onOpenAlbum={(albumId) =>
              setHomeUiState((previous) => ({
                key: homeUiKey,
                selectedAlbumId: albumId,
                toggledGroupKeys:
                  previous.key === homeUiKey ? previous.toggledGroupKeys : new Set<string>(),
              }))
            }
          />
        ) : (
          <EmptyState message="暂无可浏览内容。" />
        )}
      </section>

      <Drawer
        rootClassName="album-detail-drawer"
        className="album-detail-drawer__panel"
        title={selectedAlbumQuery.data?.title ?? '曲谱详情'}
        open={Boolean(selectedAlbumId)}
        onClose={() =>
          setHomeUiState((previous) => ({
            key: homeUiKey,
            selectedAlbumId: null,
            toggledGroupKeys:
              previous.key === homeUiKey ? previous.toggledGroupKeys : new Set<string>(),
          }))
        }
        placement="right"
        size="large"
        destroyOnClose
      >
        {selectedAlbumQuery.isLoading ? <LoadingState message="正在加载曲谱详情..." /> : null}
        {selectedAlbumQuery.isError ? <ErrorState message="曲谱详情加载失败。" /> : null}
        {selectedAlbumQuery.data ? (
          <div className="album-detail-drawer__content">
            <AlbumDetailBody locale={locale} album={selectedAlbumQuery.data} />
          </div>
        ) : null}
      </Drawer>
    </main>
  )
}

export function OperatorDetailPage({ onAlbumResolved }: AlbumBreadcrumbSync) {
  const params = useParams<{ operatorSlug?: string }>()
  const operatorSlug = params.operatorSlug
  const staticStoryRepository = useMemo(() => new StaticStoryRepository(), [])
  const [activeMenuKey, setActiveMenuKey] = useState<string>('archive')
  const [confidentialChoiceSelectionState, setConfidentialChoiceSelectionState] = useState<{
    key: string
    selections: Record<string, number>
  }>(() => ({ key: '', selections: {} }))
  const doctorName = useAppSettingsStore((state) => state.doctorName)

  const operatorBundleQuery = useQuery({
    queryKey: ['operator-detail', operatorSlug],
    enabled: Boolean(operatorSlug),
    queryFn: async () => {
      if (!operatorSlug) {
        throw new Error('Missing operatorSlug')
      }

      const operatorIndex = await staticStoryRepository.getOperatorIndex()
      const operator = operatorIndex.operators.find((candidate) => candidate.slug === operatorSlug)
      const operatorName = operator?.name ?? operatorSlug

      const [archive, modules, confidential] = await Promise.all([
        staticStoryRepository.getOperatorArchive(operatorSlug, operatorName),
        staticStoryRepository.getOperatorModules(operatorSlug),
        staticStoryRepository.getOperatorConfidential(operatorSlug, operatorName),
      ])
      const hydratedArchive = hasOperatorArchiveContent(archive)
        ? archive
        : buildOperatorArchiveFromIndexEntry(operatorSlug, operatorName, operator)
      const operatorAlbum = createOperatorAlbum(
        operatorSlug,
        operatorName,
        hydratedArchive,
        modules,
        confidential
      )

      return {
        operatorName,
        operatorAlbum,
        archive: hydratedArchive,
        modules,
        confidential,
      }
    },
  })

  useEffect(() => {
    if (!operatorBundleQuery.data) {
      return
    }

    onAlbumResolved(operatorBundleQuery.data.operatorName)
  }, [onAlbumResolved, operatorBundleQuery.data])

  const menuItems = useMemo<OperatorDetailMenuItem[]>(() => {
    if (!operatorBundleQuery.data) {
      return []
    }

    return buildOperatorDetailMenuItems(
      operatorBundleQuery.data.archive,
      operatorBundleQuery.data.modules,
      operatorBundleQuery.data.confidential
    )
  }, [operatorBundleQuery.data])

  const effectiveActiveMenuKey = menuItems.some((item) => item.key === activeMenuKey)
    ? activeMenuKey
    : (menuItems[0]?.key ?? 'archive')

  const selectedMenuItem = useMemo(
    () => menuItems.find((item) => item.key === effectiveActiveMenuKey) ?? null,
    [effectiveActiveMenuKey, menuItems]
  )

  const activeConfidentialRecord =
    selectedMenuItem?.kind === 'confidential' ? selectedMenuItem.record : null
  const confidentialChoiceKey = `${operatorSlug ?? ''}:${activeConfidentialRecord?.id ?? ''}`
  const confidentialChoiceSelections =
    confidentialChoiceSelectionState.key === confidentialChoiceKey
      ? confidentialChoiceSelectionState.selections
      : {}

  const activeConfidentialChapterQuery = useQuery({
    queryKey: ['operator-confidential-content', operatorSlug, activeConfidentialRecord?.id],
    enabled: Boolean(operatorSlug && activeConfidentialRecord?.contentSource?.url),
    queryFn: async () => {
      if (!operatorSlug || !activeConfidentialRecord?.contentSource?.url) {
        throw new Error('Missing confidential content URL')
      }

      const chapterShell: StaticChapterData = {
        id: `${operatorSlug}--${activeConfidentialRecord.id}`,
        albumId: operatorSlug,
        title: activeConfidentialRecord.title || activeConfidentialRecord.slug,
        subtitle: operatorBundleQuery.data?.operatorName,
        navigation: {
          previousChapterId: null,
          nextChapterId: null,
        },
        blocks: [],
        citations: [],
        contentSource: activeConfidentialRecord.contentSource,
      }
      const runtimeContent = await new PrtsStoryResourceLoader().load(
        activeConfidentialRecord.contentSource.url
      )

      return adaptRuntimeContentToStaticChapter(chapterShell, runtimeContent)
    },
  })

  if (!operatorSlug) {
    return <ErrorState message="缺少 operatorSlug 参数。" />
  }

  if (operatorBundleQuery.isLoading) {
    return <LoadingState message="正在加载干员详情..." />
  }

  if (operatorBundleQuery.isError || !operatorBundleQuery.data) {
    return <ErrorState message="干员详情加载失败。" />
  }

  if (menuItems.length === 0) {
    return <EmptyState message="该干员暂无可展示内容。" />
  }

  const { archive, operatorName, operatorAlbum } = operatorBundleQuery.data
  const profile = archive.profile ?? {}
  const operatorDocumentCount = operatorAlbum.documents.length
  const operatorModuleCount = operatorAlbum.modules.length
  const operatorConfidentialCount = operatorAlbum.confidentials.length
  const primaryInfoEntries = buildArchiveCoreEntries(profile)
  const archiveSections = buildArchiveSections(profile)
  const selectedModule = selectedMenuItem?.kind === 'module' ? selectedMenuItem.module : null
  const selectedModuleBasicInfo = selectedModule ? getModuleBasicInfoContent(selectedModule) : null

  return (
    <main>
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        <Typography.Title level={2}>{operatorName}</Typography.Title>
        <Typography.Text type="secondary">
          档案 {operatorDocumentCount} · 模组 {operatorModuleCount} · 秘录{' '}
          {operatorConfidentialCount}
        </Typography.Text>

        <Row gutter={[12, 12]}>
          <Col xs={24} md={8}>
            <Card style={{ borderRadius: 8 }}>
              <Menu
                mode="inline"
                selectedKeys={[effectiveActiveMenuKey]}
                items={menuItems.map((item) => ({ key: item.key, label: item.label }))}
                onClick={(event) => setActiveMenuKey(event.key)}
              />
            </Card>
          </Col>

          <Col xs={24} md={16}>
            {effectiveActiveMenuKey === 'archive' ? (
              <Card title="档案" style={{ borderRadius: 8 }}>
                <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                  {primaryInfoEntries.length > 0 ? (
                    <Row gutter={[8, 8]}>
                      {primaryInfoEntries.map(([key, value]) => (
                        <Col key={key} span={12}>
                          <Card size="small" style={{ borderRadius: 8 }}>
                            <Typography.Text type="secondary">{key}</Typography.Text>
                            <Typography.Paragraph style={{ marginBottom: 0 }}>
                              {toDisplayMultilineText(value)}
                            </Typography.Paragraph>
                          </Card>
                        </Col>
                      ))}
                    </Row>
                  ) : null}

                  {archiveSections.map((section) => (
                    <Card
                      key={section.id}
                      size="small"
                      title={section.title}
                      style={{ borderRadius: 8 }}
                    >
                      {typeof section.condition === 'string' &&
                      section.condition.trim().length > 0 ? (
                        <Typography.Text type="secondary">{section.condition}</Typography.Text>
                      ) : null}
                      <Space
                        orientation="vertical"
                        size={6}
                        style={{ marginTop: 8, width: '100%' }}
                      >
                        {section.paragraphs.map((paragraph, index) => (
                          <Typography.Paragraph
                            key={`${section.id}:${index}`}
                            style={{ marginBottom: 0 }}
                          >
                            {paragraph}
                          </Typography.Paragraph>
                        ))}
                      </Space>
                    </Card>
                  ))}
                </Space>
              </Card>
            ) : null}

            {selectedModule ? (
              <Card style={{ borderRadius: 8 }}>
                {selectedModuleBasicInfo ? (
                  <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                    <Typography.Title level={5} style={{ margin: 0 }}>
                      {`模组 · ${selectedModule.name}`}
                    </Typography.Title>
                    <Divider style={{ margin: 0 }} />
                    <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
                      {selectedModuleBasicInfo}
                    </Typography.Paragraph>
                  </Space>
                ) : (
                  <EmptyState message="该模组暂无基础信息。" />
                )}
              </Card>
            ) : null}

            {activeConfidentialRecord ? (
              <Card
                title={`秘录 · ${activeConfidentialRecord.title || activeConfidentialRecord.slug}`}
                style={{ borderRadius: 8 }}
              >
                {!activeConfidentialRecord.contentSource?.url ? (
                  <EmptyState message="该秘录缺少正文 URL。" />
                ) : activeConfidentialChapterQuery.isLoading ? (
                  <LoadingState message="正在加载秘录正文..." />
                ) : activeConfidentialChapterQuery.isError ||
                  !activeConfidentialChapterQuery.data ? (
                  <ErrorState message="秘录正文加载失败。" />
                ) : (
                  <div style={{ margin: '0 auto', maxWidth: 760, width: '100%' }}>
                    <div className="reader-content__flow">
                      <ReaderBlockSequence
                        blocks={dedupeConsecutiveVisualCues(
                          getReadableStoryBlocks(activeConfidentialChapterQuery.data.blocks).blocks
                        )}
                        chapterCitations={activeConfidentialChapterQuery.data.citations}
                        depth={0}
                        doctorName={doctorName}
                        choiceSelections={confidentialChoiceSelections}
                        onChoiceSelect={(choiceId, optionIndex) =>
                          setConfidentialChoiceSelectionState((current) => ({
                            key: confidentialChoiceKey,
                            selections: {
                              ...(current.key === confidentialChoiceKey ? current.selections : {}),
                              [choiceId]: optionIndex,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>
                )}
              </Card>
            ) : null}
          </Col>
        </Row>
      </Space>
    </main>
  )
}

function hasOperatorArchiveContent(archive: StaticOperatorArchiveData): boolean {
  return Object.values(archive.profile ?? {}).some(
    (value) => typeof value === 'string' && value.trim().length > 0
  )
}

function buildOperatorArchiveFromIndexEntry(
  operatorSlug: string,
  operatorName: string,
  operator: StaticOperatorIndexData['operators'][number] | undefined
): StaticOperatorArchiveData {
  const profile: Record<string, string> = {
    姓名: operatorName,
  }

  if (operator?.profession) {
    profile.职业 = operator.profession
  }

  const rarity = parseOperatorRarity(operator?.rarity)
  if (rarity) {
    profile.星级 = rarity
  }

  if (operator?.faction) {
    profile.阵营 = operator.faction
  }

  if (operator?.page) {
    profile.PRTS页面 = operator.page
  }

  return {
    operatorId: operatorSlug,
    name: operatorName,
    profile,
    metadata: {
      source: 'operator/index.json',
      sourceUrl: operator?.page
        ? `https://prts.wiki/w/${encodeWikiPath(operator.page)}`
        : undefined,
    },
  }
}

function parseOperatorRarity(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    return value
  }

  return `${parsed + 1}星`
}

function encodeWikiPath(page: string): string {
  return page
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}
