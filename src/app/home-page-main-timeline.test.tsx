import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppProviders } from './providers'
import App from '../App'
import { useReadingProgressStore } from '../infrastructure/storage/use-reading-progress-store'

function mockHomeFetch() {
  return vi.fn(async (input: string | URL | Request) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url

    if (URL.canParse(url)) {
      const parsedUrl = new URL(url)
      if (parsedUrl.hostname === 'prts.wiki' && parsedUrl.pathname === '/api.php') {
        const page = parsedUrl.searchParams.get('page') ?? ''
        if (page === '购物清单') {
          return buildRuntimeWikiParseResponse({
            title: '购物清单',
            textlog: ['[Image(image="cg_a")]', '秘录正文。'].join('\n'),
            resources: 'cg_a,/assets/storyline/cg-a.png',
          })
        }

        if (page === '加班券') {
          return buildRuntimeWikiParseResponse({
            title: '加班券',
            textlog: [
              '[Background(image="60_g12_rhodesdeck_cloudy")]',
              '伦蒂尼姆的工业产能仍然弥足珍贵。',
              '[name="凯尔希"]亚历山德莉娜议长阁下。',
              '父级后续正文。',
            ].join('\n'),
            resources: '',
          })
        }
      }
    }

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

    if (url.endsWith('/data/zh_CN/catalog.json')) {
      return new Response(
        JSON.stringify({
          albums: [
            { id: 'main-a', title: '主题A', slug: 'main-a' },
            { id: 'main-b', title: '主题B', slug: 'main-b' },
            { id: 'ss-a', title: '别传A', slug: 'ss-a' },
            { id: 'set-a', title: '故事集A', slug: 'set-a' },
            { id: 'archive-a', title: '附加A', slug: 'archive-a' },
            { id: 'opr-a', title: '可露希尔', slug: 'opr-a' },
          ],
        })
      )
    }

    if (url.endsWith('/data/zh_CN/timeline.json')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'main-a-r1',
              albumId: 'main-a',
              slug: 'main-a',
              title: '主题A',
              albumKind: 'mainline',
              section: 'mainline',
              side: 'left',
              timelineRank: 1,
              gameOrderRank: 1,
              chapterCount: 2,
              cover: {
                source: 'auto',
                assetStatus: 'ready',
                assetPath: '/assets/covers/zh_CN/main-a-cover.webp',
                width: 1600,
                height: 900,
              },
              music: {
                movementTitle: '主题曲 为了明日',
                arcTitle: 'Act initium 觉醒',
                tags: [],
                recommended: false,
                sourcePage: '关卡一览/主题曲',
              },
            },
            {
              id: 'main-a-dup',
              albumId: 'main-a',
              slug: 'main-a',
              title: '主题A',
              albumKind: 'mainline',
              section: 'mainline',
              side: 'left',
              timelineRank: 1,
              gameOrderRank: 1,
              chapterCount: 2,
            },
            {
              id: 'main-b-r2',
              albumId: 'main-b',
              slug: 'main-b',
              title: '主题B',
              albumKind: 'mainline',
              section: 'mainline',
              side: 'left',
              timelineRank: 2,
              gameOrderRank: 2,
              chapterCount: 1,
            },
            {
              id: 'ss-a-r3',
              albumId: 'ss-a',
              slug: 'ss-a',
              title: '别传A',
              albumKind: 'intermezzi',
              section: 'mainline',
              side: 'right',
              timelineRank: 3,
              gameOrderRank: 3,
              chapterCount: 1,
            },
            {
              id: 'set-a-r4',
              albumId: 'set-a',
              slug: 'set-a',
              title: '故事集A',
              albumKind: 'sideStory',
              section: 'sideStory',
              timelineRank: 4,
              gameOrderRank: 4,
              chapterCount: 1,
            },
            {
              id: 'opr-a-r5',
              albumId: 'opr-a',
              slug: 'opr-a',
              title: '可露希尔',
              albumKind: 'operatorRecord',
              section: 'operatorRecord',
              timelineRank: 5,
              gameOrderRank: 5,
              chapterCount: 1,
            },
            {
              id: 'archive-a-r6',
              albumId: 'archive-a',
              slug: 'archive-a',
              title: '附加A',
              albumKind: 'otherStory',
              section: 'otherStory',
              timelineRank: 6,
              gameOrderRank: 6,
              chapterCount: 1,
              otherStory: {
                sourcePage: '剧情一览',
                sourceSection: '特殊',
                groupTitle: '特殊',
              },
            },
          ],
        })
      )
    }

    if (url.endsWith('/data/zh_CN/albums/main-a.json')) {
      return new Response(
        JSON.stringify({
          id: 'main-a',
          title: '主题A',
          albumKind: 'mainline',
          chapters: [{ id: 'chapter-1', title: '醒来', code: '0-1' }],
        })
      )
    }

    if (url.endsWith('/data/zh_CN/albums/ss-a.json')) {
      return new Response(
        JSON.stringify({
          id: 'ss-a',
          title: '别传A',
          albumKind: 'intermezzi',
          chapters: [{ id: 'ss-a-c-1', title: '别传序章', code: 'SS-1' }],
        })
      )
    }

    if (url.endsWith('/data/operator/index.json')) {
      return new Response(
        JSON.stringify({
          generatedAt: '2026-05-11T00:00:00.000Z',
          operators: [
            {
              name: '12F',
              slug: 'opr-num',
              profession: '术师',
              rarity: '2',
              faction: '罗德岛',
            },
            {
              name: '阿米娅',
              slug: 'opr-amiya',
              profession: '术师',
              rarity: '5',
              faction: '罗德岛',
            },
            {
              name: '可露希尔',
              slug: 'opr-a',
              profession: '特种',
              rarity: '5',
              faction: '罗德岛',
            },
            {
              name: 'Lancet-2',
              slug: 'opr-lancet',
              profession: '医疗',
              rarity: '1',
              faction: '罗德岛',
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
          profile: {
            性别: '女',
            档案1: '基础档案',
            档案1条件: '初始开放',
            档案1文本: '可露希尔，罗德岛总工程师。',
          },
          metadata: {},
        })
      )
    }

    if (url.endsWith('/data/operator/opr-a/modules.json')) {
      return new Response(
        JSON.stringify({
          modules: [
            {
              id: 'mod-a',
              slug: 'mod-a',
              name: '给自己的小奖杯',
              fields: {
                基础信息: '第一段<br>第二段',
                任务1: '完成一次作战',
              },
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
              id: 'rec-1',
              slug: 'rec-1',
              title: '购物清单',
              contentSource: {
                provider: 'prts',
                url: 'https://prts.wiki/w/购物清单',
                page: '购物清单',
                kind: 'scenario-html',
              },
            },
            {
              id: 'rec-2',
              slug: 'rec-2',
              title: '加班券',
              contentSource: {
                provider: 'prts',
                url: 'https://prts.wiki/w/加班券',
                page: '加班券',
                kind: 'scenario-html',
              },
            },
          ],
        })
      )
    }

    if (url.endsWith('/data/operator/opr-a/confidential/rec-1/content.json')) {
      return new Response(
        JSON.stringify({
          id: 'operator:opr-a:confidential:rec-1',
          title: '购物清单',
          sequence: [
            {
              type: 'image',
              id: 'img-1',
              assetId: 'image-cg-a',
              sourceImageId: 'cg_a',
            },
            { type: 'narration', id: 'n1', text: '秘录正文。' },
          ],
        })
      )
    }

    if (url.endsWith('/data/terra-historicus/index.json')) {
      return new Response(
        JSON.stringify({
          schemaVersion: 1,
          generatedAt: '2026-05-11T00:00:00.000Z',
          comics: [
            {
              cid: 'comic-a',
              kind: 'terraHistoricusComic',
              title: '孤行之人',
              cover: 'https://comic.hypergryph.com/terra-historicus/cover-a.jpg',
              url: 'https://comic.hypergryph.com/terra-historicus/comic-a',
            },
          ],
        })
      )
    }

    if (url.endsWith('/data/operator/opr-a/confidential/rec-2/content.json')) {
      return new Response(
        JSON.stringify({
          id: 'operator:opr-a:confidential:rec-2',
          title: '加班券',
          sequence: [
            {
              type: 'background',
              id: 'bg-1',
              assetId: 'background-rhodesdeck-disabled',
              sourceImageId: '60_g12_rhodesdeck_cloudy',
            },
            { type: 'narration', id: 'intro', text: '伦蒂尼姆的工业产能仍然弥足珍贵。' },
            {
              type: 'choiceGroup',
              id: 'choice-outer',
              options: [{ label: '查看照片', value: '1' }],
              branches: [
                {
                  type: 'branch',
                  id: 'choice-outer-branch-1',
                  predicate: '1',
                  references: ['1'],
                  children: [
                    {
                      type: 'dialogue',
                      id: 'branch-dialogue',
                      speaker: '凯尔希',
                      text: '亚历山德莉娜议长阁下。',
                    },
                    {
                      type: 'choiceGroup',
                      id: 'choice-inner',
                      options: [{ label: '继续追问', value: '1' }],
                      branches: [
                        {
                          type: 'branch',
                          id: 'choice-inner-branch-1',
                          predicate: '1',
                          references: ['1'],
                          children: [
                            {
                              type: 'narration',
                              id: 'inner-done',
                              text: '看照片的人不会知道你怎么称呼维娜。',
                            },
                          ],
                        },
                      ],
                    },
                    { type: 'narration', id: 'branch-after', text: '内层选项后的同级正文。' },
                  ],
                },
              ],
            },
            { type: 'narration', id: 'outer-after', text: '父级后续正文。' },
          ],
        })
      )
    }

    if (
      url.startsWith('/assets/storyline/') ||
      url.startsWith('https://raw.githubusercontent.com/Aceship/Arknight-Images/')
    ) {
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'image/png', 'content-length': '3' },
      })
    }

    return new Response('not found', { status: 404 })
  })
}

function buildRuntimeWikiParseResponse({
  title,
  textlog,
  resources,
}: {
  title: string
  textlog: string
  resources: string
}) {
  return new Response(
    JSON.stringify({
      parse: {
        title,
        text: {
          '*': [
            `<pre id="datas_txt">${escapeHtml(textlog)}</pre>`,
            `<pre id="datas_back">${escapeHtml(resources)}</pre>`,
          ].join(''),
        },
      },
    })
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

describe('HomePage 22.6 四分区与干员入口行为', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    window.history.pushState({}, '', '/zh_CN')
    useReadingProgressStore.setState({ byAlbumId: {}, lastRead: undefined })
  })

  const selectHomeSection = async (
    label: '主题曲' | 'SideStory' | '附加档案' | '干员' | '泰拉记事社'
  ) => {
    const sectionSelect = screen.getByRole('combobox', { name: '曲谱分区' })
    fireEvent.mouseDown(sectionSelect)

    await waitFor(() => {
      const option = Array.from(
        document.querySelectorAll<HTMLElement>('.ant-select-item-option')
      ).find((item) => item.textContent?.trim() === label)
      expect(option).toBeDefined()
      fireEvent.click(option as HTMLElement)
    })
  }

  it('removes home inline search入口 and meta language/build texts from main container', async () => {
    vi.stubGlobal('fetch', mockHomeFetch())

    render(
      <AppProviders>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppProviders>
    )

    const main = (await screen.findByRole('heading', { name: 'ArkStoryline' })).closest('main')
    expect(main).not.toBeNull()
    const mainQueries = within(main as HTMLElement)
    expect(mainQueries.queryByPlaceholderText('搜索剧情关键词')).not.toBeInTheDocument()
    expect(mainQueries.queryByRole('button', { name: '剧情搜索入口' })).not.toBeInTheDocument()
    expect(mainQueries.queryByText(/当前语言：/)).not.toBeInTheDocument()
    expect(mainQueries.queryByText(/静态构建版本 v/)).not.toBeInTheDocument()
    expect(mainQueries.getByText('当前收录')).toBeInTheDocument()
    expect(mainQueries.queryByText('当前静态构建')).not.toBeInTheDocument()
  })

  it('shows continue reading as a compact two-line album card', async () => {
    vi.stubGlobal('fetch', mockHomeFetch())
    act(() => {
      useReadingProgressStore.getState().updateProgress({
        albumId: 'main-a',
        chapterId: 'chapter-1',
        progressPercent: 35,
      })
    })

    render(
      <AppProviders>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppProviders>
    )

    const main = (await screen.findByRole('heading', { name: 'ArkStoryline' })).closest('main')
    expect(main).not.toBeNull()
    const continueLink = within(main as HTMLElement).getByRole('link', { name: /继续阅读/ })
    expect(continueLink).toHaveAttribute('href', '/zh_CN/read/main-a/chapter-1')
    expect(within(continueLink).getByText('继续阅读')).toBeInTheDocument()
    expect(within(continueLink).getByText('主题A 0-1')).toBeInTheDocument()
    expect(within(continueLink).queryByText('醒来')).not.toBeInTheDocument()
  })
  afterEach(() => {
    window.history.pushState({}, '', '/zh_CN')
    vi.useRealTimers()
    useReadingProgressStore.setState({ byAlbumId: {}, lastRead: undefined })
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders section selector with four storyline groups plus operator group, dedupes by albumId, and removes lane placeholders', async () => {
    vi.stubGlobal('fetch', mockHomeFetch())

    render(
      <AppProviders>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: 'ArkStoryline' })

    const homeAlbumGrid = screen.getByTestId('home-album-grid')
    expect(homeAlbumGrid).toHaveStyle({ display: 'grid' })
    expect(homeAlbumGrid.getAttribute('style')).toContain('minmax(260px, 1fr)')

    await waitFor(() => {
      expect(within(homeAlbumGrid).getAllByRole('link', { name: /主题A/ })).toHaveLength(1)
      expect(within(homeAlbumGrid).getAllByRole('link', { name: /主题B/ })).toHaveLength(1)
    })
    const mainlineCardLink = within(homeAlbumGrid).getByRole('link', { name: /主题A/ })
    expect(mainlineCardLink).toHaveAttribute('href', '/zh_CN/albums/main-a')
    expect(within(homeAlbumGrid).getByRole('link', { name: /主题B/ })).toHaveAttribute(
      'href',
      '/zh_CN/albums/main-b'
    )
    expect(within(mainlineCardLink).getByText('EP.00')).toBeInTheDocument()
    expect(within(mainlineCardLink).getByText('共2章')).toBeInTheDocument()
    expect(within(mainlineCardLink).getByText('进度 0%')).toBeInTheDocument()
    expect(mainlineCardLink.querySelector('.progress-meter__bar')).toHaveStyle({ width: '0%' })

    const sectionSelect = screen.getByRole('combobox', { name: '曲谱分区' })
    expect(sectionSelect).toBeInTheDocument()
    fireEvent.mouseDown(sectionSelect)
    await waitFor(() => {
      const labels = Array.from(
        document.querySelectorAll<HTMLElement>('.ant-select-item-option-content')
      ).map((item) => item.textContent?.trim())
      expect(labels).toEqual(expect.arrayContaining(['主题曲', 'SideStory', '附加档案', '干员']))
    })

    expect(screen.getAllByText('主题A')).toHaveLength(1)
    expect(screen.queryByText('主题曲 暂无条目')).not.toBeInTheDocument()
    expect(screen.queryByText('SideStory 暂无条目')).not.toBeInTheDocument()
    expect(screen.getByText('init. 觉醒')).toBeInTheDocument()
    expect(screen.queryByText('主题曲 为了明日')).not.toBeInTheDocument()
    expect(screen.getByText('正在加载图片...')).toBeInTheDocument()
    expect(screen.getAllByText('封面暂不可用').length).toBeGreaterThan(0)
  })

  it('keeps archive extra and terra historicus cards on their own render paths', async () => {
    vi.stubGlobal('fetch', mockHomeFetch())

    render(
      <AppProviders>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: 'ArkStoryline' })

    await selectHomeSection('附加档案')
    const archiveGroup = await screen.findByRole('region', { name: '特殊' })
    fireEvent.click(within(archiveGroup).getByRole('button', { name: '展开' }))

    const archiveCardLink = within(archiveGroup).getByRole('link', { name: /附加A/ })
    expect(within(archiveCardLink).getByText('共1章')).toBeInTheDocument()
    expect(within(archiveCardLink).getByText('特殊')).toBeInTheDocument()

    await selectHomeSection('泰拉记事社')
    const terraGrid = await screen.findByTestId('home-terra-historicus-grid')
    const terraComicLink = within(terraGrid).getByRole('link', {
      name: '打开泰拉记事社作品：孤行之人',
    })
    expect(terraComicLink).toHaveAttribute(
      'href',
      'https://comic.hypergryph.com/terra-historicus/comic-a'
    )
    expect(within(terraGrid).queryByText('共1章')).not.toBeInTheDocument()
  })

  it('keeps each section isolated without cross-mixing cards', async () => {
    vi.stubGlobal('fetch', mockHomeFetch())

    render(
      <AppProviders>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: 'ArkStoryline' })

    await waitFor(() => {
      expect(screen.getByText('主题A')).toBeInTheDocument()
      expect(screen.getByText('主题B')).toBeInTheDocument()
    })
    expect(screen.queryByText('别传A')).not.toBeInTheDocument()

    await selectHomeSection('SideStory')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '展开' })).toBeInTheDocument()
    })
    expect(screen.queryByText('别传A')).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: '展开' })[0])
    expect(screen.getByText('别传A')).toBeInTheDocument()
    expect(screen.getByText('故事集A')).toBeInTheDocument()
    expect(screen.queryByText('主题A')).not.toBeInTheDocument()

    await selectHomeSection('干员')
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'K' })).toBeInTheDocument()
    })
    expect(screen.queryByText('可露希尔')).not.toBeInTheDocument()
    expect(screen.queryByText('故事集A')).not.toBeInTheDocument()
  })

  it('lets storyline classification groups collapse and expand their cards', async () => {
    vi.stubGlobal('fetch', mockHomeFetch())

    render(
      <AppProviders>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: 'ArkStoryline' })

    const initGroup = await screen.findByRole('region', { name: 'init. 觉醒' })
    expect(within(initGroup).getByText('主题A')).toBeInTheDocument()
    expect(within(initGroup).getByText('1 个条目')).toBeInTheDocument()

    fireEvent.click(within(initGroup).getByRole('button', { name: '折叠' }))
    expect(within(initGroup).queryByText('主题A')).not.toBeInTheDocument()

    fireEvent.click(within(initGroup).getByRole('button', { name: '展开' }))
    expect(within(initGroup).getByText('主题A')).toBeInTheDocument()
  })

  it('opens the album drawer from mainline and dossier cards without breaking native links', async () => {
    vi.stubGlobal('fetch', mockHomeFetch())

    render(
      <AppProviders>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: 'ArkStoryline' })

    const mainlineCardLink = await screen.findByRole('link', { name: /主题A/ })
    fireEvent.click(mainlineCardLink)
    expect(await screen.findByText('章节目录')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '主题A', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('醒来')).toBeInTheDocument()

    const albumDrawer = document.querySelector('.album-detail-drawer')
    expect(albumDrawer).not.toBeNull()
    fireEvent.click(within(albumDrawer as HTMLElement).getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.queryByText('章节目录')).not.toBeInTheDocument()
    })

    const preventModifiedNavigation = (event: MouseEvent) => {
      if (event.metaKey) {
        event.preventDefault()
      }
    }
    document.addEventListener('click', preventModifiedNavigation, { capture: true })
    fireEvent.click(mainlineCardLink, { metaKey: true })
    document.removeEventListener('click', preventModifiedNavigation, { capture: true })
    expect(screen.queryByText('章节目录')).not.toBeInTheDocument()

    await selectHomeSection('SideStory')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '展开' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getAllByRole('button', { name: '展开' })[0])

    const sideStoryCardLink = await screen.findByRole('link', { name: /别传A/ })
    fireEvent.click(sideStoryCardLink)
    expect(await screen.findByText('章节目录')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '别传A', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('别传序章')).toBeInTheDocument()
  })

  it('renders operator cards as pinyin-grouped dossier entries without portraits', async () => {
    vi.stubGlobal('fetch', mockHomeFetch())

    render(
      <AppProviders>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: 'ArkStoryline' })
    await selectHomeSection('干员')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'K' })).toBeInTheDocument()
    })
    const operatorGroups = screen.getByTestId('home-operator-groups')
    expect(within(operatorGroups).getByRole('heading', { name: 'A' })).toBeInTheDocument()
    expect(within(operatorGroups).getByRole('heading', { name: 'K' })).toBeInTheDocument()
    expect(within(operatorGroups).getByRole('heading', { name: 'L' })).toBeInTheDocument()
    expect(within(operatorGroups).getByRole('heading', { name: '#' })).toBeInTheDocument()

    const orderedGroupLabels = within(operatorGroups)
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent)
    expect(orderedGroupLabels).toEqual(['A', 'K', 'L', '#'])

    const kGroup = screen.getByRole('heading', { name: 'K' }).closest('section')
    expect(kGroup).not.toBeNull()
    fireEvent.click(within(kGroup!).getByRole('button', { name: '展开' }))

    const operatorGrid = screen.getByTestId('home-operator-grid-K')
    expect(operatorGrid).toHaveStyle({ display: 'grid' })
    expect(operatorGrid.getAttribute('style')).toContain('minmax(160px, 1fr)')
    expect(screen.getByRole('link', { name: '查看可露希尔干员详情' })).toHaveAttribute(
      'href',
      '/zh_CN/operators/opr-a'
    )
    expect(screen.queryByText('特种')).not.toBeInTheDocument()
    expect(screen.queryByText('5星')).not.toBeInTheDocument()
    expect(screen.queryByText('罗德岛')).not.toBeInTheDocument()
    expect(screen.queryByAltText(/封面/i)).not.toBeInTheDocument()
  })

  it('renders operator detail menu in archive-module-confidential order and shows rich content', async () => {
    vi.stubGlobal('fetch', mockHomeFetch())

    render(
      <AppProviders>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: 'ArkStoryline' })
    await selectHomeSection('干员')
    const kGroup = screen.getByRole('heading', { name: 'K' }).closest('section')
    expect(kGroup).not.toBeNull()
    fireEvent.click(within(kGroup!).getByRole('button', { name: '展开' }))
    fireEvent.click(screen.getByRole('link', { name: '查看可露希尔干员详情' }))

    await screen.findByRole('heading', { name: '可露希尔' })

    const menuItems = screen.getAllByRole('menuitem')
    expect(menuItems.map((item) => item.textContent)).toEqual([
      '档案',
      '模组 · 给自己的小奖杯',
      '秘录 · 购物清单',
      '秘录 · 加班券',
    ])

    expect(screen.getByText('基础档案')).toBeInTheDocument()
    expect(screen.getByText('可露希尔，罗德岛总工程师。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: '模组 · 给自己的小奖杯' }))
    await waitFor(() => {
      expect(screen.getByText(/第一段/)).toBeInTheDocument()
      expect(screen.getByText(/第二段/)).toBeInTheDocument()
    })
    expect(screen.queryByText('完成一次作战')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: '秘录 · 购物清单' }))
    await waitFor(() => {
      expect(screen.getByText('秘录正文。')).toBeInTheDocument()
      expect(screen.getByAltText('剧情插图 cg_a')).toHaveAttribute(
        'src',
        expect.stringMatching(/^blob:/)
      )
      expect(screen.getByAltText('剧情插图 cg_a')).toHaveAttribute(
        'data-source-url',
        '/assets/storyline/cg-a.png'
      )
    })
  })

  it('renders runtime operator confidential textlog in reading order', async () => {
    vi.stubGlobal('fetch', mockHomeFetch())
    window.history.pushState({}, '', '/zh_CN/operators/opr-a')

    render(
      <AppProviders>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: '可露希尔' })
    fireEvent.click(screen.getByRole('menuitem', { name: '秘录 · 加班券' }))

    expect(await screen.findByText('伦蒂尼姆的工业产能仍然弥足珍贵。')).toBeInTheDocument()
    expect(screen.getByText('亚历山德莉娜议长阁下。')).toBeInTheDocument()
    expect(screen.getByText('父级后续正文。')).toBeInTheDocument()
  })

  it('switches visual cue images only within source-specific candidates and then shows missing placeholder', async () => {
    vi.stubGlobal('fetch', mockHomeFetch())
    window.history.pushState({}, '', '/zh_CN/operators/opr-a')

    render(
      <AppProviders>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: '可露希尔' })
    fireEvent.click(screen.getByRole('menuitem', { name: '秘录 · 加班券' }))

    const image = await screen.findByAltText('剧情背景')
    expect(image).toHaveAttribute(
      'data-source-url',
      'https://raw.githubusercontent.com/Aceship/Arknight-Images/main/avg/backgrounds/60_g12_rhodesdeck_cloudy.png'
    )
    expect(image).toHaveAttribute('src', expect.stringMatching(/^blob:/))

    const expectedCandidateUrls = [
      'https://raw.githubusercontent.com/Aceship/Arknight-Images/main/avg/images/60_g12_rhodesdeck_cloudy.png',
      'https://raw.githubusercontent.com/Aceship/Arknight-Images/main/smallavg/backgrounds/60_g12_rhodesdeck_cloudy.png',
      'https://raw.githubusercontent.com/Aceship/Arknight-Images/main/smallavg/images/60_g12_rhodesdeck_cloudy.png',
    ]

    for (const expectedUrl of expectedCandidateUrls) {
      fireEvent.error(screen.getByAltText('剧情背景'))

      await waitFor(() => {
        expect(screen.getByAltText('剧情背景')).toHaveAttribute('data-source-url', expectedUrl)
      })
      Object.defineProperties(screen.getByAltText('剧情背景'), {
        complete: { configurable: true, value: true },
        naturalWidth: { configurable: true, value: 0 },
        naturalHeight: { configurable: true, value: 0 },
      })
    }

    fireEvent.error(screen.getByAltText('剧情背景'))
    expect(await screen.findByText('资源缺失')).toBeInTheDocument()
    expect(screen.queryByAltText('剧情背景')).not.toBeInTheDocument()
  })

  it('promotes main_15/main_16/main_17 into mainline tab after main_14', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)

      if (url.endsWith('/data/zh_CN/manifest.json')) {
        return new Response(
          JSON.stringify({
            schemaVersion: 1,
            locale: 'zh_CN',
            source: { providerId: 'fixture', commitSha: 'fixture-rev' },
          })
        )
      }

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
                timelineRank: 100,
                gameOrderRank: 100,
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
              { id: 'main_16', title: '反常光谱', slug: 'main-16' },
              { id: 'main_17', title: '相变临界', slug: 'main-17' },
              { id: 'act36side', title: '泰拉饭', slug: 'act36side', albumKind: 'sidestory' },
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
            chapters: Array.from({ length: 25 }, (_, index) => ({
              id: `main_15-c-${index + 1}`,
              title: `第${index + 1}章`,
            })),
          })
        )
      }

      if (url.endsWith('/data/zh_CN/albums/main_16.json')) {
        return new Response(
          JSON.stringify({
            id: 'main_16',
            title: '反常光谱',
            albumKind: 'sidestory',
            chapters: Array.from({ length: 25 }, (_, index) => ({
              id: `main_16-c-${index + 1}`,
              title: `第${index + 1}章`,
            })),
          })
        )
      }

      if (url.endsWith('/data/zh_CN/albums/main_17.json')) {
        return new Response(
          JSON.stringify({
            id: 'main_17',
            title: '相变临界',
            albumKind: 'sidestory',
            chapters: Array.from({ length: 24 }, (_, index) => ({
              id: `main_17-c-${index + 1}`,
              title: `第${index + 1}章`,
            })),
          })
        )
      }

      if (url.endsWith('/data/zh_CN/albums/act36side.json')) {
        return new Response(
          JSON.stringify({
            id: 'act36side',
            title: '泰拉饭',
            albumKind: 'sidestory',
            chapters: [{ id: 'act36side-c-1', title: '序章' }],
          })
        )
      }

      return new Response('not found', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <AppProviders>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: 'ArkStoryline' })

    await waitFor(() => {
      expect(screen.getByText('慈悲灯塔')).toBeInTheDocument()
      expect(screen.getByText('离解复合')).toBeInTheDocument()
      expect(screen.getByText('反常光谱')).toBeInTheDocument()
      expect(screen.getByText('相变临界')).toBeInTheDocument()
    })

    const mainlineHeadings = screen
      .getAllByRole('heading', { level: 5 })
      .map((heading) => heading.textContent)
      .filter((value): value is string => Boolean(value))

    expect(mainlineHeadings).toEqual(['慈悲灯塔', '离解复合', '反常光谱', '相变临界'])

    await selectHomeSection('SideStory')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '展开' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getAllByRole('button', { name: '展开' })[0])
    expect(screen.getByText('泰拉饭')).toBeInTheDocument()
  })

  it('switches visual cue images when the browser reports a completed zero-size image without error', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.stubGlobal('fetch', mockHomeFetch())
    window.history.pushState({}, '', '/zh_CN/operators/opr-a')

    render(
      <AppProviders>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: '可露希尔' })
    fireEvent.click(screen.getByRole('menuitem', { name: '秘录 · 加班券' }))

    const image = (await screen.findByAltText('剧情背景')) as HTMLImageElement
    Object.defineProperties(image, {
      complete: { configurable: true, value: true },
      naturalWidth: { configurable: true, value: 0 },
      naturalHeight: { configurable: true, value: 0 },
    })

    const expectedCandidateUrls = [
      'https://raw.githubusercontent.com/Aceship/Arknight-Images/main/avg/images/60_g12_rhodesdeck_cloudy.png',
      'https://raw.githubusercontent.com/Aceship/Arknight-Images/main/smallavg/backgrounds/60_g12_rhodesdeck_cloudy.png',
      'https://raw.githubusercontent.com/Aceship/Arknight-Images/main/smallavg/images/60_g12_rhodesdeck_cloudy.png',
    ]

    for (const expectedUrl of expectedCandidateUrls) {
      await act(async () => {
        vi.advanceTimersByTime(500)
      })

      await waitFor(() => {
        expect(screen.getByAltText('剧情背景')).toHaveAttribute('data-source-url', expectedUrl)
      })
      Object.defineProperties(screen.getByAltText('剧情背景'), {
        complete: { configurable: true, value: true },
        naturalWidth: { configurable: true, value: 0 },
        naturalHeight: { configurable: true, value: 0 },
      })
    }

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(await screen.findByText('资源缺失')).toBeInTheDocument()
    expect(screen.queryByAltText('剧情背景')).not.toBeInTheDocument()
  })

  it('keeps a visual cue image on the current url after a valid load', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.stubGlobal('fetch', mockHomeFetch())
    window.history.pushState({}, '', '/zh_CN/operators/opr-a')

    render(
      <AppProviders>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: '可露希尔' })
    fireEvent.click(screen.getByRole('menuitem', { name: '秘录 · 加班券' }))

    const image = (await screen.findByAltText('剧情背景')) as HTMLImageElement
    const initialUrl =
      'https://raw.githubusercontent.com/Aceship/Arknight-Images/main/avg/backgrounds/60_g12_rhodesdeck_cloudy.png'
    Object.defineProperties(image, {
      complete: { configurable: true, value: true },
      naturalWidth: { configurable: true, value: 640 },
      naturalHeight: { configurable: true, value: 360 },
    })

    fireEvent.load(image)

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(screen.getByAltText('剧情背景')).toHaveAttribute('data-source-url', initialUrl)
  })

  it('updates URL section query when selecting non-default section from header select', async () => {
    vi.stubGlobal('fetch', mockHomeFetch())

    render(
      <AppProviders>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: 'ArkStoryline' })

    await selectHomeSection('SideStory')

    await waitFor(() => {
      expect(window.location.pathname).toBe('/zh_CN')
      expect(window.location.search).toBe('?section=sideStory')
    })
  })
})
