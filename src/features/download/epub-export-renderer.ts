import JSZip from 'jszip'
import type { ExportDocumentImage, ExportDocumentLine } from '../../domain/export/export-document'
import type {
  ExportArtifact,
  ExportRenderInput,
  ExportRenderer,
} from '../../domain/export/export-renderer'
import { normalizeTrustedMediaUrl } from '../../infrastructure/storage/trusted-media-url'
import { buildZipArtifact, toSafeFileName } from './export-file-utils'

interface EpubChapterInput {
  albumTitle: string
  title: string
  code?: string
  lines: ExportDocumentLine[]
  images: ExportDocumentImage[]
}

interface EpubAlbumInput {
  title: string
  chapters: EpubChapterInput[]
}

interface PreparedEpubImage {
  id: string
  alt: string
  href: string
  manifestId: string
  mediaType: string
  data: Uint8Array
}

const EPUB_IMAGE_FETCH_TIMEOUT_MS = 15_000
const EPUB_IMAGE_MAX_BYTES = 10 * 1024 * 1024

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function resolveMediaType(path: string): string {
  const normalized = path.toLowerCase().split('?')[0] ?? ''

  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) {
    return 'image/jpeg'
  }

  if (normalized.endsWith('.webp')) {
    return 'image/webp'
  }

  if (normalized.endsWith('.gif')) {
    return 'image/gif'
  }

  if (normalized.endsWith('.svg')) {
    return 'image/svg+xml'
  }

  return 'image/png'
}

function resolveImageExtension(mediaType: string): string {
  if (mediaType === 'image/jpeg') {
    return 'jpg'
  }

  if (mediaType === 'image/webp') {
    return 'webp'
  }

  if (mediaType === 'image/gif') {
    return 'gif'
  }

  if (mediaType === 'image/svg+xml') {
    return 'svg'
  }

  return 'png'
}

function formatEpubChapterTitle(chapter: EpubChapterInput): string {
  return chapter.code ? `${chapter.code} ${chapter.title}` : chapter.title
}

function getEpubTitle(albums: EpubAlbumInput[]): string {
  if (albums.length === 1) {
    return albums[0]?.title ?? '剧情导出'
  }

  return '剧情导出'
}

async function readResponseBytesWithLimit(response: Response): Promise<Uint8Array | null> {
  const contentLength = Number(response.headers.get('content-length') ?? 0)

  if (Number.isFinite(contentLength) && contentLength > EPUB_IMAGE_MAX_BYTES) {
    return null
  }

  if (!response.body) {
    const buffer = await response.arrayBuffer()

    if (buffer.byteLength > EPUB_IMAGE_MAX_BYTES) {
      return null
    }

    return new Uint8Array(buffer)
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    totalBytes += value.byteLength
    if (totalBytes > EPUB_IMAGE_MAX_BYTES) {
      await reader.cancel()
      return null
    }

    chunks.push(value)
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0

  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  return bytes
}

async function fetchImageBytes(sourcePath: string): Promise<Uint8Array | null> {
  const trustedSourcePath = normalizeTrustedMediaUrl(sourcePath)

  if (!trustedSourcePath) {
    return null
  }

  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), EPUB_IMAGE_FETCH_TIMEOUT_MS)

  try {
    const response = await globalThis.fetch(trustedSourcePath, { signal: controller.signal })
    if (!response.ok) {
      return null
    }

    return await readResponseBytesWithLimit(response)
  } catch {
    return null
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

function chapterXhtml(
  title: string,
  lines: ExportDocumentLine[],
  imagesById: Map<string, PreparedEpubImage>
): string {
  const contentLines = (lines.length > 0 ? lines : [{ text: '', style: 'normal' as const }])
    .map((line) => {
      if (line.style === 'image' && line.imageId) {
        const image = imagesById.get(line.imageId)
        if (!image) {
          return ''
        }

        return `<figure class="story-image"><img src="../${escapeXml(image.href)}" alt="${escapeXml(image.alt)}"/></figure>`
      }

      if (line.style === 'choiceSelected') {
        return `<p class="choice-selected">${escapeXml(line.text)}</p>`
      }

      return `<p>${escapeXml(line.text)}</p>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="zh-CN">
  <head>
    <title>${escapeXml(title)}</title>
    <link rel="stylesheet" type="text/css" href="../styles.css"/>
  </head>
  <body>
    <h1>${escapeXml(title)}</h1>
    ${contentLines}
  </body>
</html>`
}

function tocXhtml(albums: EpubAlbumInput[]): string {
  const albumItems = albums
    .map((album, albumIndex) => {
      const chapterItems = album.chapters
        .map((chapter, chapterIndex) => {
          const chapterNumber =
            albums.slice(0, albumIndex).reduce((total, item) => total + item.chapters.length, 0) +
            chapterIndex +
            1

          return `<li><a href="chapter-${chapterNumber}.xhtml">${escapeXml(formatEpubChapterTitle(chapter))}</a></li>`
        })
        .join('\n          ')

      return `<section id="album-${albumIndex + 1}">
        <h2>${escapeXml(album.title)}</h2>
        <ol>
          ${chapterItems}
        </ol>
      </section>`
    })
    .join('\n      ')

  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="zh-CN">
  <head>
    <title>目录</title>
    <link rel="stylesheet" type="text/css" href="../styles.css"/>
  </head>
  <body>
    <h1>目录</h1>
    ${albumItems}
  </body>
</html>`
}

function getEpubChapterLines(
  lines: ExportDocumentLine[],
  includeImages: boolean
): ExportDocumentLine[] {
  if (includeImages) {
    return lines
  }

  return lines.filter((line) => line.style !== 'image')
}

async function buildEpubBytes(input: {
  revision: string
  generatedAt: string
  albums: EpubAlbumInput[]
}): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  const title = getEpubTitle(input.albums)
  const chapters = input.albums.flatMap((album) => album.chapters)

  const preparedImagesById = new Map<string, PreparedEpubImage>()
  let imageIndex = 0

  for (const chapter of chapters) {
    for (const image of chapter.images ?? []) {
      if (preparedImagesById.has(image.id)) {
        continue
      }

      const data = await fetchImageBytes(image.sourcePath)
      if (!data) {
        continue
      }

      imageIndex += 1
      const mediaType = resolveMediaType(image.sourcePath)
      const extension = resolveImageExtension(mediaType)
      const fileName = `image-${imageIndex}.${extension}`

      preparedImagesById.set(image.id, {
        ...image,
        href: `Images/${fileName}`,
        manifestId: `image-${imageIndex}`,
        mediaType,
        data,
      })
    }
  }

  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  )

  const manifestItems = chapters
    .map(
      (_chapter, index) =>
        `<item id="chapter-${index + 1}" href="Text/chapter-${index + 1}.xhtml" media-type="application/xhtml+xml"/>`
    )
    .join('\n    ')

  const imageManifestItems = Array.from(preparedImagesById.values())
    .map(
      (image) =>
        `<item id="${escapeXml(image.manifestId)}" href="${escapeXml(image.href)}" media-type="${escapeXml(image.mediaType)}"/>`
    )
    .join('\n    ')

  const spineItems = chapters
    .map((_chapter, index) => `<itemref idref="chapter-${index + 1}"/>`)
    .join('\n    ')

  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>zh-CN</dc:language>
    <dc:identifier id="book-id">arkstoryline-${escapeXml(input.revision)}</dc:identifier>
    <dc:description>sourceRevision=${escapeXml(input.revision)} generatedAt=${escapeXml(input.generatedAt)}</dc:description>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="style" href="styles.css" media-type="text/css"/>
    <item id="toc" href="Text/toc.xhtml" media-type="application/xhtml+xml"/>
    ${manifestItems}
    ${imageManifestItems}
  </manifest>
  <spine toc="ncx">
    <itemref idref="toc"/>
    ${spineItems}
  </spine>
</package>`
  )

  let playOrder = 1
  let chapterOffset = 0
  const navPoints = input.albums
    .map((album, albumIndex) => {
      const albumPlayOrder = playOrder
      playOrder += 1
      const chapterNavPoints = album.chapters
        .map((chapter, chapterIndex) => {
          const chapterNumber = chapterOffset + chapterIndex + 1
          const chapterPlayOrder = playOrder
          playOrder += 1

          return `<navPoint id="chapter-${chapterNumber}" playOrder="${chapterPlayOrder}">
        <navLabel><text>${escapeXml(formatEpubChapterTitle(chapter))}</text></navLabel>
        <content src="Text/chapter-${chapterNumber}.xhtml"/>
      </navPoint>`
        })
        .join('\n      ')

      chapterOffset += album.chapters.length

      return `<navPoint id="album-${albumIndex + 1}" playOrder="${albumPlayOrder}">
      <navLabel><text>${escapeXml(album.title)}</text></navLabel>
      <content src="Text/toc.xhtml#album-${albumIndex + 1}"/>
      ${chapterNavPoints}
    </navPoint>`
    })
    .join('\n    ')

  zip.file(
    'OEBPS/toc.ncx',
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="arkstoryline-${escapeXml(input.revision)}"/>
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
    ${navPoints}
  </navMap>
</ncx>`
  )

  zip.file(
    'OEBPS/styles.css',
    'body { font-family: serif; line-height: 1.7; } h1 { font-size: 1.4em; } h2 { font-size: 1.15em; margin-top: 1.4em; } p { margin: 0.6em 0; } p.choice-selected { text-align: center; font-style: italic; } figure.story-image { margin: 1em 0; text-align: center; } figure.story-image img { max-width: 100%; height: auto; }'
  )

  for (const image of preparedImagesById.values()) {
    zip.file(`OEBPS/${image.href}`, image.data)
  }

  zip.file('OEBPS/Text/toc.xhtml', tocXhtml(input.albums))

  chapters.forEach((chapter, index) => {
    zip.file(
      `OEBPS/Text/chapter-${index + 1}.xhtml`,
      chapterXhtml(formatEpubChapterTitle(chapter), chapter.lines, preparedImagesById)
    )
  })

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

export class EpubExportRenderer implements ExportRenderer {
  public readonly format = 'epub' as const

  public async render(input: ExportRenderInput): Promise<ExportArtifact[]> {
    if (input.selection.fileMode === 'single') {
      const bytes = await buildEpubBytes({
        revision: input.document.sourceRevision,
        generatedAt: input.document.generatedAt,
        albums: input.document.albums.map((album) => ({
          title: album.albumTitle,
          chapters: album.chapters.map((chapter) => ({
            albumTitle: album.albumTitle,
            title: chapter.chapterTitle,
            code: chapter.chapterCode,
            lines: getEpubChapterLines(chapter.lines, input.includeImages),
            images: input.includeImages ? (chapter.images ?? []) : [],
          })),
        })),
      })

      return [
        {
          fileName: `arkstoryline-${input.document.locale}.epub`,
          mimeType: 'application/epub+zip',
          data: bytes,
        },
      ]
    }

    const entries: Array<{ path: string; content: Uint8Array }> = []

    for (const album of input.document.albums) {
      entries.push({
        path: `${toSafeFileName(album.albumTitle)}.epub`,
        content: await buildEpubBytes({
          revision: input.document.sourceRevision,
          generatedAt: input.document.generatedAt,
          albums: [
            {
              title: album.albumTitle,
              chapters: album.chapters.map((chapter) => ({
                albumTitle: album.albumTitle,
                title: chapter.chapterTitle,
                code: chapter.chapterCode,
                lines: getEpubChapterLines(chapter.lines, input.includeImages),
                images: input.includeImages ? (chapter.images ?? []) : [],
              })),
            },
          ],
        }),
      })
    }

    const zipBytes = await buildZipArtifact({
      fileName: `arkstoryline-${input.document.locale}-epub.zip`,
      entries,
    })

    return [
      {
        fileName: `arkstoryline-${input.document.locale}-epub.zip`,
        mimeType: 'application/zip',
        data: zipBytes,
      },
    ]
  }
}
