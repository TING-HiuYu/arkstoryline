import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import { AppProviders } from './app/providers'
import App from './App'

function createDataFetchMock() {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input)

    if (url.endsWith('/data/zh_CN/manifest.json')) {
      return new Response(
        JSON.stringify({
          schemaVersion: 1,
          locale: 'zh_CN',
          source: {
            providerId: 'fixture',
            commitSha: 'fixture-rev',
          },
        })
      )
    }

    if (url.endsWith('/data/zh_CN/timeline.json')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'album-1',
              albumId: 'album-1',
              slug: 'album-1',
              title: 'album-1',
              albumKind: 'mainline',
              section: 'mainline',
              timelineRank: 1,
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
              id: 'album-1',
              title: 'album-1',
              slug: 'album-1',
            },
          ],
        })
      )
    }

    if (url.endsWith('/data/zh_CN/search-index.json')) {
      return new Response(
        JSON.stringify({
          generatedAt: '2026-05-10T00:00:00.000Z',
          locale: 'zh_CN',
          entries: [
            {
              id: 'search-album-1',
              kind: 'chapter',
              displayTitle: '1-7 黑暗时代',
              displaySecondary: '黑暗时代·上',
              albumId: 'album-1',
              albumTitle: '黑暗时代·上',
              chapterId: 'chapter-1',
              chapterTitle: '黑暗时代',
              stageCode: '1-7',
              type: 'mainline',
              match: {
                title: '1-7 黑暗时代',
                albumTitle: '黑暗时代·上',
                chapterTitle: '黑暗时代',
                stageCode: '1-7',
                aliases: ['1-7'],
                tokens: ['1-7', '黑暗时代'],
                exactIds: ['1-7'],
              },
              target: { route: 'chapter', albumId: 'album-1', chapterId: 'chapter-1' },
            },
          ],
        })
      )
    }

    if (url.endsWith('/data/operator/index.json')) {
      return new Response(
        JSON.stringify({
          generatedAt: '2026-05-10T00:00:00.000Z',
          operators: [],
        })
      )
    }

    return new Response('not found', { status: 404 })
  })
}

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not keep legacy fixed-width root shell styles', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

    expect(css).not.toMatch(/#root[\s\S]*?\bwidth:\s*1126px\b/i)
    expect(css).not.toMatch(/#root[\s\S]*?\btext-align:\s*center\b/i)
    expect(css).not.toMatch(/#root[\s\S]*?\bborder-inline\s*:/i)
  })

  it('renders header controls without visible reading-settings text and keeps theme/font/line controls', async () => {
    vi.stubGlobal('fetch', createDataFetchMock())
    window.history.pushState({}, '', '/zh_CN')

    render(
      <AppProviders>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppProviders>
    )

    expect(await screen.findByRole('heading', { name: 'ArkStoryline' })).toBeInTheDocument()

    const header = screen.getByRole('banner')
    const headerQueries = within(header)

    expect(header).toHaveStyle({ position: 'sticky' })
    expect(headerQueries.getByRole('searchbox')).toBeInTheDocument()
    expect(headerQueries.queryByText('⌘ K')).not.toBeInTheDocument()
    expect(headerQueries.getByText('曲谱')).toBeInTheDocument()
    expect(headerQueries.queryByText('曲谱：')).not.toBeInTheDocument()
    expect(headerQueries.queryByText(/阅读设置/)).not.toBeInTheDocument()
    expect(headerQueries.getByText('主题')).toBeInTheDocument()
    expect(headerQueries.getByText('字号')).toBeInTheDocument()
    expect(headerQueries.getByText('行距')).toBeInTheDocument()
    expect(headerQueries.getByText('下载')).toBeInTheDocument()
    expect(headerQueries.getByText('关于数据')).toBeInTheDocument()
    expect(header.style.background).not.toMatch(/#fff|#ffffff/i)
  })

  it('uses a section Select/combobox and navigates to otherStory on selection', async () => {
    window.history.pushState({}, '', '/zh_CN')
    vi.stubGlobal('fetch', createDataFetchMock())

    render(
      <AppProviders>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppProviders>
    )

    const header = await screen.findByRole('banner')
    const sectionCombobox = within(header).getByRole('combobox', { name: '曲谱分区' })

    fireEvent.mouseDown(sectionCombobox)

    await waitFor(() => {
      const dropdownOptions = Array.from(
        document.querySelectorAll<HTMLElement>('.ant-select-item-option-content')
      )
      const optionLabels = dropdownOptions.map((option) => option.textContent?.trim() ?? '')
      expect(optionLabels).toEqual(
        expect.arrayContaining(['主题曲', 'SideStory', '附加档案', '干员'])
      )
    })

    const archiveOption = Array.from(
      document.querySelectorAll<HTMLElement>('.ant-select-item-option')
    ).find((option) => option.textContent?.trim() === '附加档案')
    expect(archiveOption).toBeDefined()
    fireEvent.click(archiveOption as HTMLElement)

    await waitFor(() => {
      expect(window.location.pathname).toBe('/zh_CN')
      expect(window.location.search).toBe('?section=otherStory')
    })
  })

  it('navigates to search route with query after entering header search keyword', async () => {
    window.history.pushState({}, '', '/zh_CN')
    vi.stubGlobal('fetch', createDataFetchMock())

    render(
      <AppProviders>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppProviders>
    )

    const header = await screen.findByRole('banner')
    const searchInput = within(header).getByRole('searchbox')
    expect(within(header).queryByRole('button', { name: '进入搜索页' })).not.toBeInTheDocument()
    fireEvent.change(searchInput, { target: { value: '黑暗时代' } })

    expect(within(header).getByRole('button', { name: '进入搜索页' })).toBeInTheDocument()
    expect(await within(header).findByText('最佳匹配 · 章节')).toBeInTheDocument()
    expect(within(header).getByText('1-7 黑暗时代')).toBeInTheDocument()
    expect(within(header).getByText('点击查看更多结果')).toBeInTheDocument()

    fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(window.location.pathname).toBe('/zh_CN/search')
      expect(window.location.search).toBe('?q=%E9%BB%91%E6%9A%97%E6%97%B6%E4%BB%A3')
    })

    await waitFor(() => {
      expect(searchInput).toHaveValue('')
    })
  })

  it('shows other-story option in search type dropdown', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404 }))
    )

    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/zh_CN/search']}>
          <App />
        </MemoryRouter>
      </AppProviders>
    )

    const searchMain = screen.getByRole('heading', { name: '剧情搜索' }).closest('main')
    expect(searchMain).not.toBeNull()
    const combobox = await within(searchMain as HTMLElement).findByRole('combobox')
    fireEvent.mouseDown(combobox)

    await waitFor(() => {
      const dropdownOptions = Array.from(
        document.querySelectorAll<HTMLElement>('.ant-select-item-option-content')
      )
      expect(dropdownOptions.some((option) => option.textContent?.trim() === '附加档案')).toBe(true)
    })
  })

  it('records Ant Design target version 6.3.7 in package manifest', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
    ) as {
      dependencies?: Record<string, string>
    }

    expect(packageJson.dependencies?.antd).toContain('6.3.7')
  })
})
