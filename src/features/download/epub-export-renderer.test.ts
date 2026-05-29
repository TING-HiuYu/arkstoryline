import JSZip from 'jszip'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExportDocument } from '../../domain/export/export-document'
import { EpubExportRenderer } from './epub-export-renderer'

function createDocumentWithImage(sourcePath: string): ExportDocument {
  return {
    locale: 'zh_CN',
    generatedAt: '2026-05-10T00:00:00.000Z',
    sourceRevision: 'rev-epub',
    albums: [
      {
        albumId: 'album_a',
        albumTitle: '曲谱A',
        chapters: [
          {
            albumId: 'album_a',
            albumTitle: '曲谱A',
            chapterId: 'chapter_1',
            chapterTitle: '第一章',
            chapterCode: '1-1',
            content: '剧情插图',
            txtContent: '',
            lines: [{ text: '剧情插图', style: 'image', imageId: 'image-1' }],
            images: [{ id: 'image-1', alt: '剧情插图', sourcePath }],
          },
        ],
      },
    ],
    chapters: [
      {
        albumId: 'album_a',
        albumTitle: '曲谱A',
        chapterId: 'chapter_1',
        chapterTitle: '第一章',
        chapterCode: '1-1',
        content: '剧情插图',
        txtContent: '',
        lines: [{ text: '剧情插图', style: 'image', imageId: 'image-1' }],
        images: [{ id: 'image-1', alt: '剧情插图', sourcePath }],
      },
    ],
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('EpubExportRenderer image safety', () => {
  it('packages fetched local images into the epub spine and manifest', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { 'content-type': 'image/png' },
        })
    )
    vi.stubGlobal('fetch', fetchMock)

    const artifacts = await new EpubExportRenderer().render({
      document: createDocumentWithImage('/data/zh_CN/chapters/assets/chapter/image.png'),
      selection: { locale: 'zh_CN', fileMode: 'single', items: [] },
      includeImages: true,
    })
    const zip = await JSZip.loadAsync(artifacts[0]!.data)
    const files = Object.keys(zip.files)
    const chapter = await zip.file('OEBPS/Text/chapter-1.xhtml')!.async('text')
    const toc = await zip.file('OEBPS/Text/toc.xhtml')!.async('text')
    const ncx = await zip.file('OEBPS/toc.ncx')!.async('text')
    const manifest = await zip.file('OEBPS/content.opf')!.async('text')

    expect(fetchMock).toHaveBeenCalledWith(
      '/data/zh_CN/chapters/assets/chapter/image.png',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(files).toContain('OEBPS/Images/image-1.png')
    expect(files).toContain('OEBPS/Text/toc.xhtml')
    expect(chapter).toContain('<img src="../Images/image-1.png"')
    expect(chapter).toContain('<h1>1-1 第一章</h1>')
    expect(toc).toContain('<h1>目录</h1>')
    expect(toc).toContain('<h2>曲谱A</h2>')
    expect(toc).toContain('<a href="chapter-1.xhtml">1-1 第一章</a>')
    expect(ncx).toContain('<navLabel><text>曲谱A</text></navLabel>')
    expect(ncx).toContain('<navLabel><text>1-1 第一章</text></navLabel>')
    expect(manifest).toContain('id="toc" href="Text/toc.xhtml"')
    expect(manifest).toContain('<itemref idref="toc"/>')
    expect(manifest).toContain('href="Images/image-1.png" media-type="image/png"')
  })

  it('does not fetch unsafe image URLs', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const artifacts = await new EpubExportRenderer().render({
      document: createDocumentWithImage('https://evil.example/image.png'),
      selection: { locale: 'zh_CN', fileMode: 'single', items: [] },
      includeImages: true,
    })
    const zip = await JSZip.loadAsync(artifacts[0]!.data)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(Object.keys(zip.files).some((path) => path.startsWith('OEBPS/Images/'))).toBe(false)
  })

  it('skips images whose declared response size exceeds the EPUB image limit', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'content-length': String(11 * 1024 * 1024) },
        })
    )
    vi.stubGlobal('fetch', fetchMock)

    const artifacts = await new EpubExportRenderer().render({
      document: createDocumentWithImage('/assets/storyline/image.png'),
      selection: { locale: 'zh_CN', fileMode: 'single', items: [] },
      includeImages: true,
    })
    const zip = await JSZip.loadAsync(artifacts[0]!.data)

    expect(fetchMock).toHaveBeenCalledWith(
      '/assets/storyline/image.png',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(Object.keys(zip.files).some((path) => path.startsWith('OEBPS/Images/'))).toBe(false)
  })

  it('omits image fetching and image tags when image export is disabled', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const artifacts = await new EpubExportRenderer().render({
      document: createDocumentWithImage('/data/zh_CN/chapters/assets/chapter/image.png'),
      selection: { locale: 'zh_CN', fileMode: 'single', items: [] },
      includeImages: false,
    })
    const zip = await JSZip.loadAsync(artifacts[0]!.data)
    const chapter = await zip.file('OEBPS/Text/chapter-1.xhtml')!.async('text')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(chapter).not.toContain('<img ')
    expect(Object.keys(zip.files).some((path) => path.startsWith('OEBPS/Images/'))).toBe(false)
  })
})
