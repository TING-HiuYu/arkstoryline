import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AppProviders } from './providers'
import { AppRouter } from './router'

function createRoutingFetchMock() {
  return vi.fn(async (input: string | URL | Request) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url

    if (url.endsWith('/data/zh_CN/albums/act_test.json')) {
      return new Response(
        JSON.stringify({
          id: 'act_test',
          title: '测试活动',
          albumKind: 'mainline',
          music: {
            movementTitle: '主题曲 为了明日',
            arcTitle: 'Act initium 觉醒',
            tags: [],
            recommended: false,
            sourcePage: '关卡一览/主题曲',
          },
          chapters: [{ id: 'act_test--c1', title: '第一章', code: 'ST-1' }],
        })
      )
    }

    if (url.endsWith('/data/zh_CN/chapters/act_test--c1.json')) {
      return new Response(
        JSON.stringify({
          id: 'act_test--c1',
          albumId: 'act_test',
          title: '第一章',
          subtitle: '测试活动',
          code: 'ST-1',
          avgTag: 'before',
          navigation: { previousChapterId: null, nextChapterId: null },
          blocks: [{ type: 'narration', id: 'b1', text: '测试正文。' }],
          citations: [],
        })
      )
    }

    if (url.endsWith('/data/zh_CN/manifest.json')) {
      return new Response(
        JSON.stringify({
          schemaVersion: 1,
          locale: 'zh_CN',
          generatedAt: '2026-05-10T00:00:00.000Z',
          source: {
            providerId: 'fixture',
            commitSha: 'fixture-rev',
          },
          files: {},
        })
      )
    }

    if (url.endsWith('/data/zh_CN/catalog.json')) {
      return new Response(
        JSON.stringify({
          albums: [{ id: 'act_test', title: '测试活动', slug: 'act-test' }],
        })
      )
    }

    if (url.endsWith('/data/zh_CN/timeline.json')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'act_test',
              albumId: 'act_test',
              slug: 'act-test',
              title: '测试活动',
              albumKind: 'intermezzi',
              section: 'mainline',
              side: 'right',
              timelineRank: 1,
              chapterCount: 1,
            },
            {
              id: 'opr_album',
              albumId: 'opr_album',
              slug: 'opr-a',
              title: '可露希尔',
              albumKind: 'operatorRecord',
              section: 'operatorRecord',
              timelineRank: 2,
              chapterCount: 1,
            },
          ],
        })
      )
    }

    if (url.endsWith('/data/operator/index.json')) {
      return new Response(
        JSON.stringify({
          generatedAt: '2026-05-10T00:00:00.000Z',
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
          operatorName: '可露希尔',
          modules: [],
        })
      )
    }

    if (url.endsWith('/data/operator/opr-a/confidential.json')) {
      return new Response(
        JSON.stringify({
          operatorId: 'opr-a',
          operatorName: '可露希尔',
          records: [],
        })
      )
    }

    return new Response('not found', { status: 404 })
  })
}

describe('Routing breadcrumbs', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses readable breadcrumb titles and upper breadcrumb links avoid placeholder page', async () => {
    vi.stubGlobal('fetch', createRoutingFetchMock())

    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/zh_CN/read/act_test/act_test--c1']}>
          <AppRouter locale="zh_CN" />
        </MemoryRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: '第一章' })
    const homeLinks = screen.getAllByRole('link', { name: '首页' })
    const albumLinks = await screen.findAllByRole('link', { name: '测试活动' })
    expect(homeLinks.length).toBeGreaterThan(0)
    expect(albumLinks.length).toBeGreaterThan(0)
    expect(screen.queryByText('act_test--c1')).not.toBeInTheDocument()

    fireEvent.click(albumLinks[albumLinks.length - 1] as HTMLElement)
    await screen.findByRole('heading', { name: '测试活动' })
    expect(screen.queryByText('页面建设中')).not.toBeInTheDocument()

    const homeLinksAfterAlbum = screen.getAllByRole('link', { name: '首页' })
    fireEvent.click(homeLinksAfterAlbum[homeLinksAfterAlbum.length - 1] as HTMLElement)
    await screen.findByRole('heading', { name: 'ArkStoryline' })
    expect(screen.queryByText('页面建设中')).not.toBeInTheDocument()
  })

  it('shows normalized arc title in album detail and hides generic movement title', async () => {
    vi.stubGlobal('fetch', createRoutingFetchMock())

    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/zh_CN/albums/act_test']}>
          <AppRouter locale="zh_CN" />
        </MemoryRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: '测试活动' })
    expect(screen.getByText('init. 觉醒')).toBeInTheDocument()
    expect(screen.queryByText('主题曲 为了明日')).not.toBeInTheDocument()
  })

  it('navigates from operator detail breadcrumb back to operator section', async () => {
    vi.stubGlobal('fetch', createRoutingFetchMock())

    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/zh_CN/operators/opr-a']}>
          <AppRouter locale="zh_CN" />
        </MemoryRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: '可露希尔' })
    fireEvent.click(screen.getByRole('link', { name: '干员' }))
    await screen.findByRole('heading', { name: 'ArkStoryline' })
    expect(screen.getByRole('group', { name: 'album-section-select' })).toHaveTextContent('干员')
  })
})
