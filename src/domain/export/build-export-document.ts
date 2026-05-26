import type { ExportDocument, ExportDocumentChapter, ExportDocumentAlbum } from './export-document'
import type { ExportSelection } from './export-selection'
import { applyDoctorName } from '../story/doctor-name'
import type {
  StaticChapterData,
  StoryRepository,
} from '../../infrastructure/storage/static-story-repository'

export interface BuildExportDocumentOptions {
  onChapterExported?: (progress: { completedChapters: number; totalChapters: number }) => void
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

export async function buildExportDocument(
  repository: StoryRepository,
  selection: ExportSelection,
  options: BuildExportDocumentOptions = {}
): Promise<ExportDocument> {
  const manifest = await repository.getManifest(selection.locale)
  const albums: ExportDocumentAlbum[] = []
  const flatChapters: ExportDocumentChapter[] = []
  const totalChapters = selection.items.reduce((total, item) => total + item.chapterIds.length, 0)
  let completedChapters = 0

  for (const item of selection.items) {
    const album = await repository.getAlbum(selection.locale, item.albumId)
    const chapterIdSet = new Set(item.chapterIds)
    const albumChapterIds = new Set(album.chapters.map((chapter) => chapter.id))
    const invalidChapterIds = item.chapterIds.filter((chapterId) => !albumChapterIds.has(chapterId))

    if (invalidChapterIds.length > 0) {
      throw new Error(`导出选择包含不属于曲谱 ${album.id} 的章节：${invalidChapterIds.join(', ')}`)
    }

    const selectedAlbumChapters = album.chapters.filter((chapter) => chapterIdSet.has(chapter.id))

    const exportedChapters: ExportDocumentChapter[] = []

    for (const chapterRef of selectedAlbumChapters) {
      const chapter = await repository.getChapter(selection.locale, chapterRef.id)

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
        chapterTitle: chapter.title,
        chapterCode: chapter.code,
        content: payload.content,
        lines: payload.lines,
        images: payload.images,
        txtContent: payload.txtContent,
      }

      exportedChapters.push(exportChapter)
      flatChapters.push(exportChapter)
      completedChapters += 1
      options.onChapterExported?.({ completedChapters, totalChapters })
    }

    albums.push({
      albumId: album.id,
      albumTitle: album.title,
      chapters: exportedChapters,
    })
  }

  return {
    locale: selection.locale,
    generatedAt: new Date().toISOString(),
    sourceRevision: manifest.source.commitSha,
    albums,
    chapters: flatChapters,
  }
}
