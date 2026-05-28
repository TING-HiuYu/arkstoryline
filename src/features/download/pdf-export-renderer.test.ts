import { describe, expect, it, vi } from 'vitest'
import { PdfExportRenderer } from './pdf-export-renderer'
import type { ExportRenderInput } from '../../domain/export/export-renderer'

const drawText = vi.fn()
const drawImage = vi.fn()
const embedFont = vi.fn(async () => ({ widthOfTextAtSize: () => 64 }))

vi.mock('@pdf-lib/fontkit', () => ({
  default: {},
}))

vi.mock('pdf-lib', () => ({
  rgb: () => ({ r: 0.1, g: 0.1, b: 0.1 }),
  PDFDocument: {
    create: async () => ({
      registerFontkit: vi.fn(),
      embedFont,
      embedPng: vi.fn(async () => ({ width: 320, height: 180 })),
      embedJpg: vi.fn(async () => ({ width: 320, height: 180 })),
      addPage: () => ({ drawText, drawImage }),
      save: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
    }),
  },
}))

function createInput(includeImage = false): ExportRenderInput {
  const lines = includeImage
    ? [
        { text: '剧情背景', style: 'image' as const, imageId: 'image-1' },
        { text: '阿米娅：博士，醒醒。', style: 'normal' as const },
      ]
    : [{ text: '阿米娅：博士，醒醒。', style: 'normal' as const }]
  const images = includeImage
    ? [{ id: 'image-1', alt: '剧情背景', sourcePath: '/data/zh_CN/chapters/assets/bg.png' }]
    : undefined

  return {
    document: {
      locale: 'zh_CN',
      generatedAt: '2026-05-10T12:00:00.000Z',
      sourceRevision: 'rev-pdf',
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
              content: '阿米娅：博士，醒醒。',
              lines,
              images,
              txtContent: '阿米娅：博士，醒醒。',
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
          content: '阿米娅：博士，醒醒。',
          lines,
          images,
          txtContent: '阿米娅：博士，醒醒。',
        },
      ],
    },
    selection: {
      locale: 'zh_CN',
      fileMode: 'single',
      items: [{ albumId: 'album_a', chapterIds: ['chapter_1'] }],
    },
    includeImages: false,
  }
}

describe('PdfExportRenderer', () => {
  it('renders Chinese chapter into a pdf artifact', async () => {
    drawText.mockReset()
    drawImage.mockReset()
    embedFont.mockClear()

    const renderer = new PdfExportRenderer({
      fetchImpl: async () =>
        new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
        }),
    })

    const artifacts = await renderer.render(createInput())

    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]?.fileName.endsWith('.pdf')).toBe(true)
    expect(artifacts[0]?.mimeType).toBe('application/pdf')
    expect((artifacts[0]?.data.byteLength ?? 0) > 0).toBe(true)
    expect(
      drawText.mock.calls.some((call) => String(call[0]).includes('阿米娅：博士，醒醒。'))
    ).toBe(true)
    expect(embedFont).toHaveBeenCalledWith(expect.any(Uint8Array), { subset: false })
  })

  it('embeds trusted PNG images when image export is enabled', async () => {
    drawImage.mockReset()
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)

      if (url.endsWith('/fonts/NotoSansCJKsc-Regular.otf')) {
        return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 })
      }

      return new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    })

    const renderer = new PdfExportRenderer({ fetchImpl })
    const artifacts = await renderer.render({
      ...createInput(true),
      includeImages: true,
    })

    expect(artifacts).toHaveLength(1)
    expect(fetchImpl).toHaveBeenCalledWith(
      '/data/zh_CN/chapters/assets/bg.png',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(drawImage).toHaveBeenCalled()
  })

  it('throws clear error when Chinese font subset is missing', async () => {
    const renderer = new PdfExportRenderer({
      fetchImpl: async () => new Response('missing', { status: 404 }),
    })

    await expect(renderer.render(createInput())).rejects.toThrow('PDF 导出缺少中文字体子集')
  })
})
