import type { ExportDocument, ExportDocumentChapter, ExportDocumentAlbum } from './export-document'
import type { ExportSelection } from './export-selection'
import { applyDoctorName } from '../story/doctor-name'
import type {
  StaticChapterData,
  StoryRepository,
} from '../../infrastructure/storage/static-story-repository'
import {
  loadRuntimeWikiStoryPage,
  type RuntimeWikiStoryPage,
} from '../../infrastructure/storage/runtime-wiki-story'
import {
  loadRuntimeWikiOperatorPage,
  loadRuntimeWikiOperatorArchive,
  loadRuntimeWikiOperatorExtras,
} from '../../infrastructure/storage/runtime-wiki-operator'
import type {
  StaticOperatorArchiveData,
  StaticOperatorConfidentialData,
  StaticOperatorModuleData,
  StaticOperatorModulesData,
} from '../../infrastructure/storage/static-story-repository'

export interface BuildExportDocumentOptions {
  onChapterExported?: (progress: { completedChapters: number; totalChapters: number }) => void
  runtimeStoryLoader?: (contentUrl: string) => Promise<RuntimeWikiStoryPage>
}

function chapterToExportPayload(
  chapter: StaticChapterData,
  locale: string,
  doctorName?: string | null
): {
  lines: ExportDocumentChapter['lines']
  images: ExportDocumentChapter['images']
  txtContent: string
  content: string
} {
  const lines: ExportDocumentChapter['lines'] = []
  const images: ExportDocumentChapter['images'] = []
  const txtLines: string[] = []

  const appendBlocks = (blocks: StaticChapterData['blocks']) => {
    for (const block of blocks) {
      if (block.type === 'backgroundCue' || block.type === 'imageCue') {
        const sourcePath = resolveExportImageSourcePath(block.localPath ?? block.sourceUrl, locale)
        if (!sourcePath) {
          continue
        }

        const image = {
          id: `${chapter.id}-image-${images.length + 1}`,
          alt: block.type === 'backgroundCue' ? '剧情背景' : '剧情插图',
          sourcePath,
        }

        images.push(image)
        lines.push({
          text: image.alt,
          style: 'image',
          imageId: image.id,
        })
        continue
      }

      if (block.type === 'dialogue') {
        const text = `${applyDoctorName(block.speaker, doctorName)}：${applyDoctorName(block.text, doctorName)}`
        lines.push({ text, style: 'normal' })
        txtLines.push(text)
        continue
      }

      if (block.type === 'narration') {
        const text = applyDoctorName(block.text, doctorName)
        lines.push({ text, style: 'normal' })
        txtLines.push(text)
        continue
      }

      if (block.type === 'choice') {
        const firstOption = block.options[0]
        if (!firstOption) {
          continue
        }

        const text = applyDoctorName(firstOption, doctorName)
        lines.push({ text, style: 'choiceSelected' })
        txtLines.push(`我: ${text}`)

        const firstValue = block.values?.[0] ?? '1'
        const branch = block.branches?.find(
          (candidate) =>
            candidate.predicate === firstValue || candidate.references?.includes(firstValue)
        )

        if (branch && branch.blocks.length > 0) {
          appendBlocks(branch.blocks)
        }

        continue
      }

      if (block.type === 'sectionBreak') {
        lines.push({ text: '', style: 'normal' })
        txtLines.push('')
      }
    }
  }

  appendBlocks(chapter.blocks)

  const content = lines
    .map((line) => line.text)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const txtContent = txtLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    lines,
    images,
    txtContent,
    content,
  }
}

function resolveExportImageSourcePath(
  sourcePath: string | undefined,
  locale: string
): string | undefined {
  const trimmed = sourcePath?.trim()

  if (!trimmed) {
    return undefined
  }

  if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith('/')) {
    return trimmed
  }

  return `/data/${locale}/chapters/${trimmed.replace(/^\.?\//, '')}`
}

function formatExportChapterTitle(chapter: Pick<StaticChapterData, 'title' | 'avgTag'>): string {
  if (chapter.avgTag === '行动前') {
    return `${chapter.title}（前）`
  }

  if (chapter.avgTag === '行动后') {
    return `${chapter.title}（后）`
  }

  return chapter.title
}

function buildTextChapterPayload(lines: string[]): {
  lines: ExportDocumentChapter['lines']
  images: ExportDocumentChapter['images']
  txtContent: string
  content: string
} {
  const normalizedLines = lines
    .map((line) => line.trimEnd())
    .filter((line, index, source) => line.length > 0 || source[index - 1]?.length)
  const exportLines = normalizedLines.map((text) => ({ text, style: 'normal' as const }))
  const content = normalizedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    lines: exportLines,
    images: [],
    txtContent: content,
    content,
  }
}

function normalizeOperatorText(value: string | undefined): string {
  return (value ?? '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function hasOperatorArchiveContent(archive: StaticOperatorArchiveData): boolean {
  return Object.values(archive.profile).some(
    (value) => typeof value === 'string' && value.trim().length > 0
  )
}

function mergeOperatorModules(
  staticModules: StaticOperatorModulesData,
  runtimeModules: StaticOperatorModulesData
): StaticOperatorModulesData {
  if (staticModules.modules.length === 0) {
    return runtimeModules
  }

  const runtimeByName = new Map(runtimeModules.modules.map((module) => [module.name, module]))
  const mergedModules = staticModules.modules.map((staticModule) => {
    const runtimeModule = runtimeByName.get(staticModule.name)

    if (!runtimeModule) {
      return staticModule
    }

    return {
      ...staticModule,
      fields: {
        ...staticModule.fields,
        ...runtimeModule.fields,
      },
    }
  })
  const staticNames = new Set(staticModules.modules.map((module) => module.name))

  for (const runtimeModule of runtimeModules.modules) {
    if (!staticNames.has(runtimeModule.name)) {
      mergedModules.push(runtimeModule)
    }
  }

  return {
    ...staticModules,
    operatorName: staticModules.operatorName ?? runtimeModules.operatorName,
    modules: mergedModules,
  }
}

function mergeOperatorConfidential(
  staticConfidential: StaticOperatorConfidentialData,
  runtimeConfidential: StaticOperatorConfidentialData
): StaticOperatorConfidentialData {
  if (staticConfidential.records.length === 0) {
    return runtimeConfidential
  }

  const runtimeByTitle = new Map(
    runtimeConfidential.records.map((record) => [record.title || record.slug, record])
  )
  const mergedRecords = staticConfidential.records.map((staticRecord) => {
    const runtimeRecord = runtimeByTitle.get(staticRecord.title || staticRecord.slug)

    if (!runtimeRecord) {
      return staticRecord
    }

    return {
      ...staticRecord,
      page: staticRecord.page ?? runtimeRecord.page,
      contentSource: staticRecord.contentSource ?? runtimeRecord.contentSource,
      fields: {
        ...(staticRecord.fields ?? {}),
        ...(runtimeRecord.fields ?? {}),
      },
    }
  })
  const staticTitles = new Set(
    staticConfidential.records.map((record) => record.title || record.slug)
  )

  for (const runtimeRecord of runtimeConfidential.records) {
    if (!staticTitles.has(runtimeRecord.title || runtimeRecord.slug)) {
      mergedRecords.push(runtimeRecord)
    }
  }

  return {
    ...staticConfidential,
    operatorName: staticConfidential.operatorName || runtimeConfidential.operatorName,
    records: mergedRecords,
  }
}

function getOperatorModuleBasicInfo(module: StaticOperatorModuleData): string {
  const exact = module.fields['基础信息']

  if (typeof exact === 'string' && exact.trim().length > 0) {
    return normalizeOperatorText(exact)
  }

  const fallback = Object.entries(module.fields).find(([key, value]) => {
    return key.includes('基础信息') && typeof value === 'string' && value.trim().length > 0
  })

  return fallback ? normalizeOperatorText(fallback[1]) : ''
}

function operatorArchiveToLines(archive: StaticOperatorArchiveData): string[] {
  const lines: string[] = []
  const sectionIndexSet = new Set<number>()

  for (const key of Object.keys(archive.profile)) {
    const match = key.match(/^档案(\d+)(?:文本|条件)?$/)
    if (match) {
      sectionIndexSet.add(Number.parseInt(match[1] ?? '0', 10))
    }
  }

  const orderedSectionIndexes = Array.from(sectionIndexSet).sort((left, right) => left - right)

  for (const index of orderedSectionIndexes) {
    const title = normalizeOperatorText(archive.profile[`档案${index}`])
    const condition = normalizeOperatorText(archive.profile[`档案${index}条件`])
    const body = normalizeOperatorText(archive.profile[`档案${index}文本`])

    if (!title && !body) {
      continue
    }

    lines.push(title || `档案${index}`)
    if (condition) {
      lines.push(condition)
    }
    if (body) {
      lines.push(body)
    }
    lines.push('')
  }

  const remainingEntries = Object.entries(archive.profile).filter(([key, value]) => {
    if (/^档案\d+(?:文本|条件)?$/.test(key)) {
      return false
    }

    return typeof value === 'string' && value.trim().length > 0
  })

  for (const [key, value] of remainingEntries) {
    lines.push(key)
    lines.push(normalizeOperatorText(value))
    lines.push('')
  }

  return lines
}

function operatorRecordFieldsToLines(fields: Record<string, string> | undefined): string[] {
  if (!fields) {
    return []
  }

  return Object.entries(fields)
    .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
    .flatMap(([key, value]) => [key, normalizeOperatorText(value), ''])
}

async function loadChapterExportContent(
  chapter: StaticChapterData,
  runtimeStoryLoader: (contentUrl: string) => Promise<RuntimeWikiStoryPage>
): Promise<StaticChapterData> {
  if (chapter.blocks.length > 0 || !chapter.contentSource?.url) {
    return chapter
  }

  const runtimeContent = await runtimeStoryLoader(chapter.contentSource.url)

  return {
    ...chapter,
    blocks: adaptRuntimeExportBlocks(runtimeContent.blocks),
  }
}

function adaptRuntimeExportBlocks(
  blocks: RuntimeWikiStoryPage['blocks']
): StaticChapterData['blocks'] {
  return blocks.map((block): StaticChapterData['blocks'][number] => {
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

    if (block.type === 'choice') {
      return {
        type: 'choice',
        id: block.id,
        options: block.options,
        values: block.values,
        branches: block.branches?.map((branch) => ({
          id: branch.id,
          predicate: branch.predicate,
          references: branch.references,
          blocks: adaptRuntimeExportBlocks(branch.blocks),
        })),
      }
    }

    if (block.type === 'interaction') {
      return {
        type: 'narration',
        id: block.id,
        text: block.label,
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
  })
}

async function buildStoryExportAlbum(
  repository: StoryRepository,
  selection: ExportSelection,
  item: ExportSelection['items'][number],
  runtimeStoryLoader: (contentUrl: string) => Promise<RuntimeWikiStoryPage>,
  onChapterExported: BuildExportDocumentOptions['onChapterExported'],
  progress: { completedChapters: number; totalChapters: number }
): Promise<{
  album: ExportDocumentAlbum
  chapters: ExportDocumentChapter[]
  completedChapters: number
}> {
  const album = await repository.getAlbum(selection.locale, item.albumId)
  const chapterIdSet = new Set(item.chapterIds)
  const albumChapterIds = new Set(album.chapters.map((chapter) => chapter.id))
  const invalidChapterIds = item.chapterIds.filter((chapterId) => !albumChapterIds.has(chapterId))

  if (invalidChapterIds.length > 0) {
    throw new Error(`导出选择包含不属于曲谱 ${album.id} 的章节：${invalidChapterIds.join(', ')}`)
  }

  const selectedAlbumChapters = album.chapters.filter((chapter) => chapterIdSet.has(chapter.id))
  const exportedChapters: ExportDocumentChapter[] = []
  let completedChapters = progress.completedChapters

  for (const chapterRef of selectedAlbumChapters) {
    const chapter = await loadChapterExportContent(
      await repository.getChapter(selection.locale, chapterRef.id),
      runtimeStoryLoader
    )

    if (chapter.albumId !== album.id) {
      throw new Error(
        `章节 ${chapter.id} 属于曲谱 ${chapter.albumId}，不能导出到曲谱 ${album.id}。`
      )
    }

    const payload = chapterToExportPayload(chapter, selection.locale, selection.doctorName)
    const exportChapter: ExportDocumentChapter = {
      albumId: album.id,
      albumTitle: album.title,
      chapterId: chapter.id,
      chapterTitle: formatExportChapterTitle(chapter),
      chapterCode: chapter.code,
      content: payload.content,
      lines: payload.lines,
      images: payload.images,
      txtContent: payload.txtContent,
    }

    exportedChapters.push(exportChapter)
    completedChapters += 1
    onChapterExported?.({ completedChapters, totalChapters: progress.totalChapters })
  }

  return {
    album: {
      albumId: album.id,
      albumTitle: album.title,
      chapters: exportedChapters,
    },
    chapters: exportedChapters,
    completedChapters,
  }
}

async function buildOperatorExportAlbum(
  repository: StoryRepository,
  selection: ExportSelection,
  item: ExportSelection['items'][number],
  runtimeStoryLoader: (contentUrl: string) => Promise<RuntimeWikiStoryPage>,
  onChapterExported: BuildExportDocumentOptions['onChapterExported'],
  progress: { completedChapters: number; totalChapters: number }
): Promise<{
  album: ExportDocumentAlbum
  chapters: ExportDocumentChapter[]
  completedChapters: number
}> {
  const operatorIndex = await repository.getOperatorIndex()
  const operator = operatorIndex.operators.find((candidate) => candidate.slug === item.albumId)
  const operatorName = operator?.name ?? item.albumId
  const selectedChapterIds = new Set(item.chapterIds)
  const needsArchive = selectedChapterIds.has(`${item.albumId}:archive`)
  const needsModules = item.chapterIds.some((chapterId) =>
    chapterId.startsWith(`${item.albumId}:module:`)
  )
  const needsConfidential = item.chapterIds.some((chapterId) =>
    chapterId.startsWith(`${item.albumId}:confidential:`)
  )
  let archive: StaticOperatorArchiveData = {
    operatorId: item.albumId,
    name: operatorName,
    profile: {},
  }
  let modules: StaticOperatorModulesData = {
    operatorId: item.albumId,
    operatorName,
    modules: [],
  }
  let confidential: StaticOperatorConfidentialData = {
    operatorId: item.albumId,
    operatorName,
    records: [],
  }

  const [staticArchive, staticModules, staticConfidential] = await Promise.all([
    needsArchive
      ? repository.getOperatorArchive(item.albumId, operatorName)
      : Promise.resolve(archive),
    needsModules
      ? repository.getOperatorModules(item.albumId, operatorName)
      : Promise.resolve(modules),
    needsConfidential
      ? repository.getOperatorConfidential(item.albumId, operatorName)
      : Promise.resolve(confidential),
  ])

  archive = staticArchive
  modules = staticModules
  confidential = staticConfidential

  if (operator?.page) {
    if (needsArchive && (needsModules || needsConfidential)) {
      const runtimePage = await loadRuntimeWikiOperatorPage({
        operatorSlug: item.albumId,
        operatorName,
        page: operator.page,
      })
      archive = hasOperatorArchiveContent(runtimePage.archive) ? runtimePage.archive : staticArchive
      modules = needsModules ? mergeOperatorModules(staticModules, runtimePage.modules) : modules
      confidential = needsConfidential
        ? mergeOperatorConfidential(staticConfidential, runtimePage.confidential)
        : confidential
    } else if (needsArchive) {
      const runtimeArchive = await loadRuntimeWikiOperatorArchive({
        operatorSlug: item.albumId,
        operatorName,
        page: operator.page,
      })
      archive = hasOperatorArchiveContent(runtimeArchive) ? runtimeArchive : staticArchive
    } else if (needsModules || needsConfidential) {
      const runtimeExtras = await loadRuntimeWikiOperatorExtras({
        operatorSlug: item.albumId,
        operatorName,
        page: operator.page,
      })
      modules = needsModules ? mergeOperatorModules(staticModules, runtimeExtras.modules) : modules
      confidential = needsConfidential
        ? mergeOperatorConfidential(staticConfidential, runtimeExtras.confidential)
        : confidential
    }
  }

  const availableEntries = new Map<string, () => Promise<ExportDocumentChapter | null>>()

  if (hasOperatorArchiveContent(archive)) {
    availableEntries.set(`${item.albumId}:archive`, async () =>
      createOperatorTextExportChapter({
        operatorSlug: item.albumId,
        operatorName,
        chapterId: `${item.albumId}:archive`,
        chapterTitle: '档案',
        lines: operatorArchiveToLines(archive),
      })
    )
  }

  for (const module of modules.modules) {
    const chapterId = `${item.albumId}:module:${module.id}`
    availableEntries.set(chapterId, async () => {
      const basicInfo = getOperatorModuleBasicInfo(module)
      return createOperatorTextExportChapter({
        operatorSlug: item.albumId,
        operatorName,
        chapterId,
        chapterTitle: `模组 · ${module.name}`,
        lines: basicInfo ? [basicInfo] : operatorRecordFieldsToLines(module.fields),
      })
    })
  }

  for (const record of confidential.records) {
    const chapterId = `${item.albumId}:confidential:${record.id}`
    availableEntries.set(chapterId, async () => {
      if (record.contentSource?.url) {
        const runtimeContent = await runtimeStoryLoader(record.contentSource.url)
        const chapterShell: StaticChapterData = {
          id: chapterId,
          albumId: item.albumId,
          title: record.title || record.slug,
          subtitle: operatorName,
          navigation: {
            previousChapterId: null,
            nextChapterId: null,
          },
          blocks: adaptRuntimeExportBlocks(runtimeContent.blocks),
          citations: [],
          contentSource: record.contentSource,
        }
        const payload = chapterToExportPayload(chapterShell, selection.locale, selection.doctorName)

        return {
          albumId: item.albumId,
          albumTitle: operatorName,
          chapterId,
          chapterTitle: `秘录 · ${record.title || record.slug}`,
          content: payload.content,
          lines: payload.lines,
          images: payload.images,
          txtContent: payload.txtContent,
        }
      }

      return createOperatorTextExportChapter({
        operatorSlug: item.albumId,
        operatorName,
        chapterId,
        chapterTitle: `秘录 · ${record.title || record.slug}`,
        lines: operatorRecordFieldsToLines(record.fields),
      })
    })
  }

  const invalidChapterIds = item.chapterIds.filter((chapterId) => !availableEntries.has(chapterId))

  if (invalidChapterIds.length > 0) {
    throw new Error(
      `导出选择包含不属于干员 ${item.albumId} 的内容：${invalidChapterIds.join(', ')}`
    )
  }

  const exportedChapters: ExportDocumentChapter[] = []
  let completedChapters = progress.completedChapters

  for (const chapterId of item.chapterIds) {
    const createEntry = availableEntries.get(chapterId)
    const exportChapter = createEntry ? await createEntry() : null

    if (!exportChapter) {
      continue
    }

    exportedChapters.push(exportChapter)
    completedChapters += 1
    onChapterExported?.({ completedChapters, totalChapters: progress.totalChapters })
  }

  return {
    album: {
      albumId: item.albumId,
      albumTitle: operatorName,
      chapters: exportedChapters,
    },
    chapters: exportedChapters,
    completedChapters,
  }
}

function createOperatorTextExportChapter(input: {
  operatorSlug: string
  operatorName: string
  chapterId: string
  chapterTitle: string
  lines: string[]
}): ExportDocumentChapter | null {
  const payload = buildTextChapterPayload(input.lines)

  if (!payload.content) {
    return null
  }

  return {
    albumId: input.operatorSlug,
    albumTitle: input.operatorName,
    chapterId: input.chapterId,
    chapterTitle: input.chapterTitle,
    content: payload.content,
    lines: payload.lines,
    images: payload.images,
    txtContent: payload.txtContent,
  }
}

export async function buildExportDocument(
  repository: StoryRepository,
  selection: ExportSelection,
  options: BuildExportDocumentOptions = {}
): Promise<ExportDocument> {
  const manifest = await repository.getManifest(selection.locale)
  const runtimeStoryLoader = options.runtimeStoryLoader ?? loadRuntimeWikiStoryPage
  const albums: ExportDocumentAlbum[] = []
  const flatChapters: ExportDocumentChapter[] = []
  const totalChapters = selection.items.reduce((total, item) => total + item.chapterIds.length, 0)
  let completedChapters = 0

  for (const item of selection.items) {
    const result =
      item.kind === 'operator'
        ? await buildOperatorExportAlbum(
            repository,
            selection,
            item,
            runtimeStoryLoader,
            options.onChapterExported,
            {
              completedChapters,
              totalChapters,
            }
          )
        : await buildStoryExportAlbum(
            repository,
            selection,
            item,
            runtimeStoryLoader,
            options.onChapterExported,
            {
              completedChapters,
              totalChapters,
            }
          )

    completedChapters = result.completedChapters
    flatChapters.push(...result.chapters)
    albums.push(result.album)
  }

  return {
    locale: selection.locale,
    generatedAt: new Date().toISOString(),
    sourceRevision: manifest.source.commitSha,
    albums,
    chapters: flatChapters,
  }
}
