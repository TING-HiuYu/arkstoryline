import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, type PDFImage } from 'pdf-lib'
import type { ExportDocumentImage, ExportDocumentLine } from '../../domain/export/export-document'
import type {
  ExportArtifact,
  ExportRenderInput,
  ExportRenderer,
} from '../../domain/export/export-renderer'
import { normalizeTrustedMediaUrl } from '../../infrastructure/storage/trusted-media-url'
import { buildZipArtifact, toSafeFileName } from './export-file-utils'

interface PdfExportRendererOptions {
  fetchImpl?: typeof fetch
  fontUrl?: string
}

const DEFAULT_FONT_URL = '/fonts/NotoSansCJKsc-Regular.otf'
const PDF_IMAGE_FETCH_TIMEOUT_MS = 15_000
const PDF_IMAGE_MAX_BYTES = 10 * 1024 * 1024
const PDF_PAGE_WIDTH = 595.28
const PDF_PAGE_HEIGHT = 841.89

function splitLines(value: string): string[] {
  return value.split('\n').flatMap((line) => (line.length > 0 ? [line] : [' ']))
}

function wrapLineByWidth(line: string, maxCharsPerLine: number): string[] {
  if (line.length <= maxCharsPerLine) {
    return [line]
  }

  const lines: string[] = []

  for (let start = 0; start < line.length; start += maxCharsPerLine) {
    lines.push(line.slice(start, start + maxCharsPerLine))
  }

  return lines
}

function resolvePdfImageMediaType(
  path: string,
  response: Response
): 'image/png' | 'image/jpeg' | null {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  const normalizedPath = path.toLowerCase().split('?')[0] ?? ''

  if (
    contentType.includes('image/jpeg') ||
    normalizedPath.endsWith('.jpg') ||
    normalizedPath.endsWith('.jpeg')
  ) {
    return 'image/jpeg'
  }

  if (contentType.includes('image/png') || normalizedPath.endsWith('.png')) {
    return 'image/png'
  }

  return null
}

export class PdfExportRenderer implements ExportRenderer {
  public readonly format = 'pdf' as const

  private readonly fetchImpl: typeof fetch
  private readonly fontUrl: string

  public constructor(options: PdfExportRendererOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.fontUrl = options.fontUrl ?? DEFAULT_FONT_URL
  }

  public async render(input: ExportRenderInput): Promise<ExportArtifact[]> {
    if (input.selection.fileMode === 'single') {
      const bytes = await this.buildPdf(
        'ArkStoryline 导出',
        input.document.chapters,
        input.includeImages
      )

      return [
        {
          fileName: `arkstoryline-${input.document.locale}.pdf`,
          mimeType: 'application/pdf',
          data: bytes,
        },
      ]
    }

    const entries: Array<{ path: string; content: Uint8Array }> = []

    for (const album of input.document.albums) {
      entries.push({
        path: `${toSafeFileName(album.albumTitle)}.pdf`,
        content: await this.buildPdf(album.albumTitle, album.chapters, input.includeImages),
      })
    }

    const zipBytes = await buildZipArtifact({
      fileName: `arkstoryline-${input.document.locale}-pdf.zip`,
      entries,
    })

    return [
      {
        fileName: `arkstoryline-${input.document.locale}-pdf.zip`,
        mimeType: 'application/zip',
        data: zipBytes,
      },
    ]
  }

  private async buildPdf(
    title: string,
    chapters: Array<{
      albumTitle?: string
      chapterTitle: string
      chapterCode?: string
      content: string
      lines: ExportDocumentLine[]
      images?: ExportDocumentImage[]
    }>,
    includeImages: boolean
  ): Promise<Uint8Array> {
    const fontBytes = await this.fetchFontBytes()

    const pdf = await PDFDocument.create()
    pdf.registerFontkit(fontkit)
    const font = await pdf.embedFont(fontBytes, { subset: true })

    let page = pdf.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT])
    let cursorY = 800
    const marginX = 48
    const lineHeight = 18
    const maxCharsPerLine = 42

    const drawLine = (text: string, size = 12) => {
      if (cursorY < 60) {
        page = pdf.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT])
        cursorY = 800
      }

      page.drawText(text, {
        x: marginX,
        y: cursorY,
        size,
        font,
        color: rgb(0.1, 0.1, 0.1),
      })

      cursorY -= lineHeight
    }

    const drawImage = async (image: ExportDocumentImage) => {
      const embeddedImage = await this.fetchAndEmbedImage(pdf, image.sourcePath)
      if (!embeddedImage) {
        return
      }

      const maxWidth = PDF_PAGE_WIDTH - marginX * 2
      const maxHeight = 260
      const scale = Math.min(maxWidth / embeddedImage.width, maxHeight / embeddedImage.height, 1)
      const width = embeddedImage.width * scale
      const height = embeddedImage.height * scale

      if (cursorY - height < 60) {
        page = pdf.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT])
        cursorY = 800
      }

      page.drawImage(embeddedImage, {
        x: marginX,
        y: cursorY - height,
        width,
        height,
      })
      cursorY -= height + 14
    }

    drawLine(title, 16)
    drawLine('')

    for (const chapter of chapters) {
      const chapterTitle = chapter.chapterCode
        ? `${chapter.chapterCode} ${chapter.chapterTitle}`
        : chapter.chapterTitle

      drawLine(chapterTitle, 14)

      const chapterLines: ExportDocumentLine[] =
        chapter.lines.length > 0 ? chapter.lines : [{ text: chapter.content, style: 'normal' }]
      const imagesById = new Map((chapter.images ?? []).map((image) => [image.id, image]))

      for (const chapterLine of chapterLines) {
        if (chapterLine.style === 'image') {
          if (includeImages && chapterLine.imageId) {
            const image = imagesById.get(chapterLine.imageId)
            if (image) {
              await drawImage(image)
            }
          }
          continue
        }

        const rawLines = splitLines(chapterLine.text)
        for (const rawLine of rawLines) {
          const wrapped = wrapLineByWidth(rawLine, maxCharsPerLine)
          for (const line of wrapped) {
            if (chapterLine.style === 'choiceSelected') {
              const textWidth = font.widthOfTextAtSize(line, 12)
              const centeredX = Math.max(marginX, (595.28 - textWidth) / 2)

              if (cursorY < 60) {
                page = pdf.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT])
                cursorY = 800
              }

              page.drawText(line, {
                x: centeredX,
                y: cursorY,
                size: 12,
                font,
                color: rgb(0.1, 0.1, 0.1),
              })

              cursorY -= lineHeight
              continue
            }

            drawLine(line, 12)
          }
        }

        if (chapterLine.style === 'choiceSelected') {
          continue
        }

        if (chapterLine.text.trim().length === 0) {
          continue
        }

        // Keep normal paragraph spacing for readability.
        if (cursorY < 60) {
          page = pdf.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT])
          cursorY = 800
        }
      }

      drawLine('')
    }

    return new Uint8Array(await pdf.save())
  }

  private async fetchAndEmbedImage(pdf: PDFDocument, sourcePath: string): Promise<PDFImage | null> {
    const trustedSourcePath = normalizeTrustedMediaUrl(sourcePath)
    if (!trustedSourcePath) {
      return null
    }

    const controller = new AbortController()
    const timeoutId = globalThis.setTimeout(() => controller.abort(), PDF_IMAGE_FETCH_TIMEOUT_MS)

    try {
      const response = await this.fetchImpl(trustedSourcePath, { signal: controller.signal })
      if (!response.ok) {
        return null
      }

      const contentLength = Number(response.headers.get('content-length') ?? 0)
      if (Number.isFinite(contentLength) && contentLength > PDF_IMAGE_MAX_BYTES) {
        return null
      }

      const mediaType = resolvePdfImageMediaType(trustedSourcePath, response)
      if (!mediaType) {
        return null
      }

      const buffer = await response.arrayBuffer()
      if (buffer.byteLength > PDF_IMAGE_MAX_BYTES) {
        return null
      }

      const bytes = new Uint8Array(buffer)
      return mediaType === 'image/jpeg' ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes)
    } catch {
      return null
    } finally {
      globalThis.clearTimeout(timeoutId)
    }
  }

  private async fetchFontBytes(): Promise<Uint8Array> {
    const response = await this.fetchImpl(this.fontUrl)

    if (!response.ok) {
      throw new Error(
        `PDF 导出缺少中文字体子集，请提供可分发字体文件（${this.fontUrl}）。HTTP ${response.status}`
      )
    }

    return new Uint8Array(await response.arrayBuffer())
  }
}
