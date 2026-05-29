import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
            {
              id: 'main_14',
              title: '慈悲灯塔',
              slug: 'main-14',
              chapterCount: 2,
            },
            {
              id: 'main_15',
              title: '离解复合',
              slug: 'main-15',
              chapterCount: 1,
            },
            {
              id: 'act36side',
              title: '泰拉饭',
              slug: 'act36side',
              albumKind: 'sideStory',
              chapterCount: 1,
            },
            {
              id: 'archive_extra',
              title: '附加档案',
              slug: 'archive-extra',
              albumKind: 'otherStory',
              chapterCount: 3,
            },
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
            { id: 'main_14-c1', title: '慈悲灯塔-1', code: '14-1', avgTag: '行动前' },
            { id: 'main_14-c2', title: '慈悲灯塔-1', code: '14-1', avgTag: '行动后' },
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
          operators: [
            {
              name: '可露希尔',
              slug: 'opr-a',
              exportManifest: {
                archive: [{ id: 'opr-a:archive', kind: 'archive', title: '档案' }],
                modules: [
                  {
                    id: 'opr-a:module:opr-a:module:1',
                    kind: 'module',
                    title: '给自己的小奖杯',
                  },
                ],
                confidential: [
                  {
                    id: 'opr-a:confidential:opr-a:confidential:1',
                    kind: 'confidential',
                    title: '购物清单',
                  },
                ],
              },
            },
          ],
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
            {
              id: 'mod-a',
              slug: 'mod-a',
              name: '给自己的小奖杯',
              type: 'special',
              fields: { 基础信息: '采购中心纪念品。' },
            },
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

async function checkTreeNode(
  user: ReturnType<typeof userEvent.setup>,
  container: HTMLElement,
  label: string
) {
  const treeNode = Array.from(container.querySelectorAll<HTMLElement>('.ant-tree-treenode')).find(
    (node) => node.textContent?.includes(label)
  )
  const checkbox = treeNode?.querySelector<HTMLElement>('.ant-tree-checkbox')
  if (!checkbox) {
    throw new Error(`Missing checkbox for tree node: ${label}`)
  }

  await user.click(checkbox)
}

describe('DownloadSelectorPanel', () => {
  it('shows operator export nodes from metadata without loading every operator page on expand', async () => {
    const fetchMock = createLazyDownloadFetchMock()
    const user = userEvent.setup()

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

    expect(screen.getByText('干员')).toBeInTheDocument()
    expect(countFetchCalls(fetchMock, '/data/operator/index.json')).toBe(1)
    expect(countFetchCalls(fetchMock, '/albums/main_14.json')).toBe(0)
    expect(countFetchCalls(fetchMock, '/albums/main_15.json')).toBe(0)
    expect(countFetchCalls(fetchMock, '/operator/opr-a/archive.json')).toBe(0)

    await user.click(screen.getByText('干员'))

    await waitFor(() => {
      expect(screen.getByText('K')).toBeInTheDocument()
      expect(screen.queryByText('可露希尔')).not.toBeInTheDocument()
    })

    await user.click(screen.getByText('K'))

    await waitFor(() => {
      expect(screen.getByText('可露希尔')).toBeInTheDocument()
    })

    await user.click(screen.getByText('可露希尔'))

    await waitFor(() => {
      expect(screen.getByText('档案')).toBeInTheDocument()
      expect(screen.getByText('模组 · 给自己的小奖杯')).toBeInTheDocument()
      expect(screen.getByText('秘录 · 购物清单')).toBeInTheDocument()
    })

    expect(countFetchCalls(fetchMock, '/operator/opr-a/archive.json')).toBe(0)
    expect(countFetchCalls(fetchMock, '/operator/opr-a/modules.json')).toBe(0)
    expect(countFetchCalls(fetchMock, '/operator/opr-a/confidential.json')).toBe(0)

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
      expect(screen.getByText('14-1 慈悲灯塔-1 行动前')).toBeInTheDocument()
      expect(screen.getByText('14-1 慈悲灯塔-1 行动后')).toBeInTheDocument()
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
      expect(screen.getByText('已选内容数：2')).toBeInTheDocument()
    })

    expect(screen.getByTestId('download-action-top')).toBeEnabled()
    expect(screen.getByTestId('download-action-bottom')).toBeEnabled()

    vi.unstubAllGlobals()
  })

  it('counts timeline and other-story group selections from catalog metadata', async () => {
    const fetchMock = createLazyDownloadFetchMock()
    const user = userEvent.setup()

    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(
      <AppProviders>
        <DownloadSelectorPanel locale="zh_CN" defaultEmpty />
      </AppProviders>
    )

    await waitFor(() => {
      expect(screen.getByText('主时间线')).toBeInTheDocument()
      expect(screen.getByText('附加档案')).toBeInTheDocument()
      expect(screen.getByText('已选内容数：0')).toBeInTheDocument()
    })

    await checkTreeNode(user, container, '主时间线')

    await waitFor(() => {
      expect(screen.getByText('已选内容数：4')).toBeInTheDocument()
    })

    await checkTreeNode(user, container, '附加档案')

    await waitFor(() => {
      expect(screen.getByText('已选内容数：7')).toBeInTheDocument()
    })

    expect(countFetchCalls(fetchMock, '/albums/main_14.json')).toBe(0)
    expect(countFetchCalls(fetchMock, '/albums/archive_extra.json')).toBe(0)

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
      expect(screen.getByText('14-1 慈悲灯塔-1 行动后')).toBeInTheDocument()
      expect(screen.getByText('已选内容数：1')).toBeInTheDocument()
    })

    vi.unstubAllGlobals()
  })
})
