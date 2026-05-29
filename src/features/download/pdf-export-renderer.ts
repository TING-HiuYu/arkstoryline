import fontkit from '@pdf-lib/fontkit'
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNull,
  rgb,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib'
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

interface PdfAlbumInput {
  albumTitle: string
  chapters: PdfChapterInput[]
}

interface PdfChapterInput {
  albumTitle?: string
  chapterTitle: string
  chapterCode?: string
  content: string
  lines: ExportDocumentLine[]
  images?: ExportDocumentImage[]
}

interface PdfChapterDestination {
  albumTitle: string
  title: string
  page: PDFPage
  y: number
}

const DEFAULT_FONT_URL = '/fonts/NotoSansCJKsc-Regular.otf'
const PDF_IMAGE_FETCH_TIMEOUT_MS = 15_000
const PDF_IMAGE_MAX_BYTES = 10 * 1024 * 1024
const PDF_PAGE_WIDTH = 595.28
const PDF_PAGE_HEIGHT = 841.89
const PDF_MARGIN_X = 48
const PDF_CONTENT_TOP = 800
const PDF_CONTENT_BOTTOM = 60
const PDF_LINE_HEIGHT = 18
const PDF_TOC_LINE_HEIGHT = 18

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

function formatPdfChapterTitle(chapter: PdfChapterInput): string {
  return chapter.chapterCode
    ? `${chapter.chapterCode} ${chapter.chapterTitle}`
    : chapter.chapterTitle
}

function countPdfTableOfContentsRows(albums: PdfAlbumInput[]): number {
  return albums.reduce((total, album) => total + 1 + album.chapters.length, 1)
}

function compactPdfDictionary<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
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
        input.document.albums.map((album) => ({
          albumTitle: album.albumTitle,
          chapters: album.chapters,
        })),
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
        content: await this.buildPdf(
          [
            {
              albumTitle: album.albumTitle,
              chapters: album.chapters,
            },
          ],
          input.includeImages
        ),
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

  private async buildPdf(albums: PdfAlbumInput[], includeImages: boolean): Promise<Uint8Array> {
    const fontBytes = await this.fetchFontBytes()

    const pdf = await PDFDocument.create()
    pdf.registerFontkit(fontkit)
    const font = await pdf.embedFont(fontBytes, { subset: false })

    const tocPages = Array.from(
      { length: Math.max(1, Math.ceil(countPdfTableOfContentsRows(albums) / 38)) },
      () => pdf.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT])
    )

    let page = pdf.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT])
    let cursorY = PDF_CONTENT_TOP
    const maxCharsPerLine = 42
    const chapterDestinations: PdfChapterDestination[] = []

    const drawLine = (text: string, size = 12) => {
      if (cursorY < PDF_CONTENT_BOTTOM) {
        page = pdf.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT])
        cursorY = PDF_CONTENT_TOP
      }

      page.drawText(text, {
        x: PDF_MARGIN_X,
        y: cursorY,
        size,
        font,
        color: rgb(0.1, 0.1, 0.1),
      })

      cursorY -= PDF_LINE_HEIGHT
    }

    const drawImage = async (image: ExportDocumentImage) => {
      const embeddedImage = await this.fetchAndEmbedImage(pdf, image.sourcePath)
      if (!embeddedImage) {
        return
      }

      const maxWidth = PDF_PAGE_WIDTH - PDF_MARGIN_X * 2
      const maxHeight = 260
      const scale = Math.min(maxWidth / embeddedImage.width, maxHeight / embeddedImage.height, 1)
      const width = embeddedImage.width * scale
      const height = embeddedImage.height * scale

      if (cursorY - height < PDF_CONTENT_BOTTOM) {
        page = pdf.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT])
        cursorY = PDF_CONTENT_TOP
      }

      page.drawImage(embeddedImage, {
        x: PDF_MARGIN_X,
        y: cursorY - height,
        width,
        height,
      })
      cursorY -= height + 14
    }

    for (const album of albums) {
      for (const chapter of album.chapters) {
        const chapterTitle = formatPdfChapterTitle(chapter)

        chapterDestinations.push({
          albumTitle: album.albumTitle,
          title: chapterTitle,
          page,
          y: cursorY,
        })

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
                const centeredX = Math.max(PDF_MARGIN_X, (595.28 - textWidth) / 2)

                if (cursorY < PDF_CONTENT_BOTTOM) {
                  page = pdf.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT])
                  cursorY = PDF_CONTENT_TOP
                }

                page.drawText(line, {
                  x: centeredX,
                  y: cursorY,
                  size: 12,
                  font,
                  color: rgb(0.1, 0.1, 0.1),
                })

                cursorY -= PDF_LINE_HEIGHT
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
          if (cursorY < PDF_CONTENT_BOTTOM) {
            page = pdf.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT])
            cursorY = PDF_CONTENT_TOP
          }
        }

        drawLine('')
      }
    }

    this.drawTableOfContents(pdf, tocPages, albums, chapterDestinations, font)
    this.addDocumentOutline(pdf, albums, chapterDestinations)

    return new Uint8Array(await pdf.save())
  }

  private drawTableOfContents(
    pdf: PDFDocument,
    tocPages: PDFPage[],
    albums: PdfAlbumInput[],
    chapterDestinations: PdfChapterDestination[],
    font: Awaited<ReturnType<PDFDocument['embedFont']>>
  ): void {
    let tocPageIndex = 0
    let tocPage = tocPages[tocPageIndex]!
    let cursorY = PDF_CONTENT_TOP
    const destinationByKey = new Map(
      chapterDestinations.map((destination) => [
        `${destination.albumTitle}\u0000${destination.title}`,
        destination,
      ])
    )

    const ensureTocSpace = () => {
      if (cursorY >= PDF_CONTENT_BOTTOM) {
        return
      }

      tocPageIndex += 1
      tocPage = tocPages[tocPageIndex] ?? pdf.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT])
      cursorY = PDF_CONTENT_TOP
    }

    tocPage.drawText('目录', {
      x: PDF_MARGIN_X,
      y: cursorY,
      size: 18,
      font,
      color: rgb(0.1, 0.1, 0.1),
    })
    cursorY -= PDF_TOC_LINE_HEIGHT * 1.6

    for (const album of albums) {
      ensureTocSpace()
      tocPage.drawText(album.albumTitle, {
        x: PDF_MARGIN_X,
        y: cursorY,
        size: 13,
        font,
        color: rgb(0.1, 0.1, 0.1),
      })
      cursorY -= PDF_TOC_LINE_HEIGHT

      for (const chapter of album.chapters) {
        ensureTocSpace()
        const chapterTitle = formatPdfChapterTitle(chapter)
        const destination = destinationByKey.get(`${album.albumTitle}\u0000${chapterTitle}`)
        const text = `  ${chapterTitle}`
        const pageNumber = destination ? pdf.getPages().indexOf(destination.page) + 1 : 0
        const pageText = pageNumber > 0 ? String(pageNumber) : ''

        tocPage.drawText(text, {
          x: PDF_MARGIN_X,
          y: cursorY,
          size: 11,
          font,
          color: rgb(0.1, 0.1, 0.1),
        })

        if (pageText) {
          const pageTextWidth = font.widthOfTextAtSize(pageText, 11)
          tocPage.drawText(pageText, {
            x: PDF_PAGE_WIDTH - PDF_MARGIN_X - pageTextWidth,
            y: cursorY,
            size: 11,
            font,
            color: rgb(0.1, 0.1, 0.1),
          })
        }

        if (destination) {
          this.addPageLink(pdf, tocPage, {
            x: PDF_MARGIN_X,
            y: cursorY - 2,
            width: PDF_PAGE_WIDTH - PDF_MARGIN_X * 2,
            height: PDF_TOC_LINE_HEIGHT,
            destination,
          })
        }

        cursorY -= PDF_TOC_LINE_HEIGHT
      }

      cursorY -= PDF_TOC_LINE_HEIGHT * 0.4
    }
  }

  private addPageLink(
    pdf: PDFDocument,
    sourcePage: PDFPage,
    options: {
      x: number
      y: number
      width: number
      height: number
      destination: PdfChapterDestination
    }
  ): void {
    if (!('context' in pdf) || !('node' in sourcePage)) {
      return
    }

    const annotation = pdf.context.obj({
      Type: PDFName.of('Annot'),
      Subtype: PDFName.of('Link'),
      Rect: [options.x, options.y, options.x + options.width, options.y + options.height],
      Border: [0, 0, 0],
      A: {
        Type: PDFName.of('Action'),
        S: PDFName.of('GoTo'),
        D: [
          options.destination.page.ref,
          PDFName.of('XYZ'),
          PDFNull,
          options.destination.y,
          PDFNull,
        ],
      },
    })
    sourcePage.node.addAnnot(pdf.context.register(annotation))
  }

  private addDocumentOutline(
    pdf: PDFDocument,
    albums: PdfAlbumInput[],
    chapterDestinations: PdfChapterDestination[]
  ): void {
    if (!('context' in pdf) || !('catalog' in pdf)) {
      return
    }

    if (albums.length === 0) {
      return
    }

    const destinationByKey = new Map(
      chapterDestinations.map((destination) => [
        `${destination.albumTitle}\u0000${destination.title}`,
        destination,
      ])
    )
    const outlineRootRef = pdf.context.nextRef()
    const albumRefs = albums.map(() => pdf.context.nextRef())
    const chapterRefsByAlbum = albums.map((album) =>
      album.chapters.map(() => pdf.context.nextRef())
    )

    albums.forEach((album, albumIndex) => {
      const chapterRefs = chapterRefsByAlbum[albumIndex] ?? []
      const childCount = chapterRefs.length
      const firstChapterTitle = album.chapters[0] ? formatPdfChapterTitle(album.chapters[0]) : ''
      const firstDestination = destinationByKey.get(`${album.albumTitle}\u0000${firstChapterTitle}`)
      const albumDict = pdf.context.obj(
        compactPdfDictionary({
          Title: PDFHexString.fromText(album.albumTitle),
          Parent: outlineRootRef,
          Prev: albumRefs[albumIndex - 1],
          Next: albumRefs[albumIndex + 1],
          First: childCount > 0 ? chapterRefs[0] : undefined,
          Last: childCount > 0 ? chapterRefs[childCount - 1] : undefined,
          Count: childCount,
          Dest: firstDestination
            ? [firstDestination.page.ref, PDFName.of('XYZ'), PDFNull, firstDestination.y, PDFNull]
            : undefined,
        })
      )
      pdf.context.assign(albumRefs[albumIndex]!, albumDict)

      album.chapters.forEach((chapter, chapterIndex) => {
        const title = formatPdfChapterTitle(chapter)
        const destination = destinationByKey.get(`${album.albumTitle}\u0000${title}`)
        if (!destination) {
          return
        }

        const chapterDict = pdf.context.obj(
          compactPdfDictionary({
            Title: PDFHexString.fromText(title),
            Parent: albumRefs[albumIndex],
            Prev: chapterRefs[chapterIndex - 1],
            Next: chapterRefs[chapterIndex + 1],
            Dest: [destination.page.ref, PDFName.of('XYZ'), PDFNull, destination.y, PDFNull],
          })
        )
        pdf.context.assign(chapterRefs[chapterIndex]!, chapterDict)
      })
    })

    pdf.context.assign(
      outlineRootRef,
      pdf.context.obj({
        Type: PDFName.of('Outlines'),
        First: albumRefs[0],
        Last: albumRefs[albumRefs.length - 1],
        Count: albums.length + albums.reduce((total, album) => total + album.chapters.length, 0),
      })
    )
    pdf.catalog.set(PDFName.of('Outlines'), outlineRootRef)
    pdf.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'))
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
