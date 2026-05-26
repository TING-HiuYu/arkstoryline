import { render, screen, waitFor } from '@testing-library/react'
import { AppProviders } from './providers'
import { DownloadSelectorPanel } from './router'
import { vi } from 'vitest'

function createLazyDownloadFetchMock() {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input)

    if (url.endsWith('/data/zh_CN/timeline.json')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'main_14',
              albumId: 'main_14',
              slug: 'main-14',
              title: '慈悲灯塔',
              albumKind: 'mainline',
              section: 'mainline',
              side: 'left',
              timelineRank: 1,
              gameOrderRank: 10,
              chapterCount: 1,
            },
          ],
        })
      )
    }

    if (url.endsWith('/data/zh_CN/catalog.json')) {
      return new Response(
        JSON.stringify({
          albums: [
            { id: 'main_14', title: '慈悲灯塔', slug: 'main-14' },
            { id: 'main_15', title: '离解复合', slug: 'main-15' },
            { id: 'act36side', title: '泰拉饭', slug: 'act36side' },
          ],
        })
      )
    }

    if (url.endsWith('/data/zh_CN/albums/main_14.json')) {
      return new Response(
        JSON.stringify({
          id: 'main_14',
          title: '慈悲灯塔',
          albumKind: 'mainline',
          chapters: [
            { id: 'main_14-c1', title: '慈悲灯塔-1', code: '14-1' },
            { id: 'main_14-c2', title: '慈悲灯塔-2', code: '14-2' },
          ],
        })
      )
    }

    if (url.endsWith('/data/zh_CN/albums/main_15.json')) {
      return new Response(
        JSON.stringify({
          id: 'main_15',
          title: '离解复合',
          albumKind: 'sidestory',
          chapters: [{ id: 'main_15-c1', title: '离解复合-1', code: '15-1' }],
        })
      )
    }

    if (url.endsWith('/data/zh_CN/albums/act36side.json')) {
      return new Response(
        JSON.stringify({
          id: 'act36side',
          title: '泰拉饭',
          albumKind: 'sidestory',
          chapters: [{ id: 'act36side-c1', title: '泰拉饭-1', code: 'A-1' }],
        })
      )
    }

    if (url.endsWith('/data/operator/index.json')) {
      return new Response(
        JSON.stringify({
          generatedAt: '2026-05-12T00:00:00.000Z',
          operators: [{ name: '可露希尔', slug: 'opr-a' }],
        })
      )
    }

    if (url.endsWith('/data/operator/opr-a/archive.json')) {
      return new Response(
        JSON.stringify({
          operatorId: 'opr-a',
          name: '可露希尔',
          profile: { 代号: '可露希尔' },
        })
      )
    }

    if (url.endsWith('/data/operator/opr-a/modules.json')) {
      return new Response(
        JSON.stringify({
          operatorId: 'opr-a',
          modules: [
            { id: 'mod-a', slug: 'mod-a', name: '给自己的小奖杯', type: 'special', fields: {} },
          ],
        })
      )
    }

    if (url.endsWith('/data/operator/opr-a/confidential.json')) {
      return new Response(
        JSON.stringify({
          operatorId: 'opr-a',
          operatorName: '可露希尔',
          records: [
            {
              id: 'sec-a',
              slug: 'sec-a',
              title: '购物清单',
              contentSource: {
                provider: 'prts',
                url: 'https://prts.wiki/w/购物清单',
                page: '购物清单',
                kind: 'scenario-html',
              },
            },
          ],
        })
      )
    }

    return new Response('not found', { status: 404 })
  })
}

function countFetchCalls(fetchMock: ReturnType<typeof vi.fn>, keyword: string): number {
  return fetchMock.mock.calls.filter((call) => String(call[0]).includes(keyword)).length
}

describe('DownloadSelectorPanel', () => {
  it('does not show unsupported operator export nodes or fetch operator data', async () => {
    const fetchMock = createLazyDownloadFetchMock()

    vi.stubGlobal('fetch', fetchMock)

    render(
      <AppProviders>
        <DownloadSelectorPanel locale="zh_CN" defaultEmpty />
      </AppProviders>
    )

    await waitFor(() => {
      expect(screen.getByText('全部剧情')).toBeInTheDocument()
      expect(screen.getByText('附加档案')).toBeInTheDocument()
    })

    expect(screen.queryByText('干员')).not.toBeInTheDocument()
    expect(countFetchCalls(fetchMock, '/data/operator/index.json')).toBe(0)
    expect(countFetchCalls(fetchMock, '/albums/main_14.json')).toBe(0)
    expect(countFetchCalls(fetchMock, '/albums/main_15.json')).toBe(0)
    expect(countFetchCalls(fetchMock, '/operator/opr-a/archive.json')).toBe(0)

    expect(screen.getByTestId('download-action-top')).toBeDisabled()
    expect(screen.getByTestId('download-action-bottom')).toBeDisabled()

    vi.unstubAllGlobals()
  })

  it('loads album chapters when album branch is expanded for current context', async () => {
    const fetchMock = createLazyDownloadFetchMock()

    vi.stubGlobal('fetch', fetchMock)

    render(
      <AppProviders>
        <DownloadSelectorPanel locale="zh_CN" defaultAlbumId="main_14" />
      </AppProviders>
    )

    await waitFor(() => {
      expect(countFetchCalls(fetchMock, '/albums/main_14.json')).toBe(1)
      expect(screen.getByText('慈悲灯塔-1')).toBeInTheDocument()
    })

    vi.unstubAllGlobals()
  })

  it('enables top and bottom download buttons when default album is preselected', async () => {
    const fetchMock = createLazyDownloadFetchMock()

    vi.stubGlobal('fetch', fetchMock)

    render(
      <AppProviders>
        <DownloadSelectorPanel locale="zh_CN" defaultAlbumId="main_14" />
      </AppProviders>
    )

    await waitFor(() => {
      expect(screen.getByText('已选章节数：2')).toBeInTheDocument()
    })

    expect(screen.getByTestId('download-action-top')).toBeEnabled()
    expect(screen.getByTestId('download-action-bottom')).toBeEnabled()

    vi.unstubAllGlobals()
  })

  it('preselects only the focused chapter in reader context', async () => {
    const fetchMock = createLazyDownloadFetchMock()

    vi.stubGlobal('fetch', fetchMock)

    render(
      <AppProviders>
        <DownloadSelectorPanel
          locale="zh_CN"
          defaultAlbumId="main_14"
          focusedChapterId="main_14-c2"
        />
      </AppProviders>
    )

    await waitFor(() => {
      expect(screen.getByText('慈悲灯塔-2')).toBeInTheDocument()
      expect(screen.getByText('已选章节数：1')).toBeInTheDocument()
    })

    vi.unstubAllGlobals()
  })
})
