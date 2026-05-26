import type {
  ExportArtifact,
  ExportRenderInput,
  ExportRenderer,
} from '../../domain/export/export-renderer'
import { buildZipArtifact, toSafeFileName, utf8Bytes } from './export-file-utils'

function buildAlbumTxtContent(input: ExportRenderInput, albumId: string): string {
  const album = input.document.albums.find((item) => item.albumId === albumId)

  if (!album) {
    return ''
  }

  const sections = album.chapters.map((chapter) => {
    const titleLine = chapter.chapterCode
      ? `# ${chapter.chapterCode} ${chapter.chapterTitle}`
      : `# ${chapter.chapterTitle}`

    return [titleLine, '', chapter.txtContent].join('\n')
  })

  return sections.join('\n\n---\n\n')
}

function buildSingleTxtContent(input: ExportRenderInput): string {
  const sections = input.document.albums.map((album) => {
    const header = `## ${album.albumTitle}`
    const chapterSections = album.chapters.map((chapter) => {
      const titleLine = chapter.chapterCode
        ? `### ${chapter.chapterCode} ${chapter.chapterTitle}`
        : `### ${chapter.chapterTitle}`

      return [titleLine, '', chapter.txtContent].join('\n')
    })

    return [header, '', ...chapterSections].join('\n\n')
  })

  const metadata = [
    `# ArkStoryline 导出`,
    `- locale: ${input.document.locale}`,
    `- sourceRevision: ${input.document.sourceRevision}`,
    `- generatedAt: ${input.document.generatedAt}`,
  ]

  return [metadata.join('\n'), ...sections].join('\n\n')
}

export class TxtExportRenderer implements ExportRenderer {
  public readonly format = 'txt' as const

  public async render(input: ExportRenderInput): Promise<ExportArtifact[]> {
    if (input.selection.fileMode === 'single') {
      return [
        {
          fileName: `arkstoryline-${input.document.locale}.txt`,
          mimeType: 'text/plain;charset=utf-8',
          data: utf8Bytes(buildSingleTxtContent(input)),
        },
      ]
    }

    const zipEntries = input.selection.items.map((item) => {
      const albumTitle =
        input.document.albums.find((album) => album.albumId === item.albumId)?.albumTitle ??
        item.albumId
      const safeName = toSafeFileName(albumTitle)

      return {
        path: `${safeName}.txt`,
        content: buildAlbumTxtContent(input, item.albumId),
      }
    })

    const zipBytes = await buildZipArtifact({
      fileName: `arkstoryline-${input.document.locale}-txt.zip`,
      entries: zipEntries,
    })

    return [
      {
        fileName: `arkstoryline-${input.document.locale}-txt.zip`,
        mimeType: 'application/zip',
        data: zipBytes,
      },
    ]
  }
}
