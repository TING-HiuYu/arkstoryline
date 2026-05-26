import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppRouter } from './router'
import { AppProviders } from './providers'
import { vi } from 'vitest'

function createImageResponse(): Response {
  return new Response(new Uint8Array([1, 2, 3]), {
    headers: { 'content-type': 'image/png', 'content-length': '3' },
  })
}

describe('Reader citation rendering', () => {
  it('renders dialogue as plain text and centers doctor lines', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
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
            albumKind: 'intermezzi',
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
            code: 'ST-1',
            navigation: { previousChapterId: null, nextChapterId: null },
            blocks: [
              { type: 'dialogue', id: 'b1', speaker: '阿米娅', text: '博士，醒醒。' },
              { type: 'dialogue', id: 'b2', speaker: '博士', text: '我来决定。' },
              {
                type: 'backgroundCue',
                id: 'bg1',
                assetId: 'background-test',
                assetStatus: 'ready',
                localPath: '/assets/storyline/background-test.png',
              },
              { type: 'narration', id: 'b3', text: '四周一片寂静。' },
              {
                type: 'unknownCue',
                id: 'b4',
                prop: 'Delay',
                attributes: {
                  cue: 'Delay(time=1)',
                },
              },
              { type: 'dialogue', id: 'b5', speaker: '杜宾', text: 'Dr.{@nickname}，调集队伍吧。' },
              {
                type: 'choice',
                id: 'c1',
                options: ['早就该交给我了！', '......', '简单，我会轻松解决的。'],
                values: ['1', '2', '3'],
                branches: [
                  {
                    id: 'c1-b1',
                    predicate: '1',
                    references: ['1'],
                    blocks: [{ type: 'narration', id: 'c1-b1-n1', text: '第一条分支。' }],
                  },
                ],
              },
            ],
            citations: [],
          })
        )
      }

      if (url.startsWith('/assets/storyline/')) {
        return createImageResponse()
      }

      return new Response('not found', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/zh_CN/read/act_test/act_test--c1']}>
          <AppRouter locale="zh_CN" />
        </MemoryRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: '第一章' })
    expect(screen.getByText('博士，醒醒。')).toHaveStyle({ textAlign: 'left' })
    expect(screen.getByText('阿米娅')).toHaveStyle({ textAlign: 'right' })
    expect(screen.getByText('我来决定。')).toHaveStyle({ textAlign: 'center', fontStyle: 'italic' })
    const background = await screen.findByAltText('剧情背景')
    expect(background).toHaveAttribute('src', expect.stringMatching(/^blob:/))
    expect(background).toHaveAttribute('data-source-url', '/assets/storyline/background-test.png')
    expect(screen.queryByText(/插图统计/)).not.toBeInTheDocument()
    expect(screen.getByText('四周一片寂静。')).toBeInTheDocument()
    expect(screen.getByText('Dr.{@nickname}，调集队伍吧。')).toHaveStyle({ textAlign: 'left' })
    expect(screen.getByText('杜宾')).toHaveStyle({ textAlign: 'right' })
    expect(screen.queryByText('选项')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '早就该交给我了！' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '......' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '简单，我会轻松解决的。' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '早就该交给我了！' }))
    expect(screen.getByText('早就该交给我了！')).toHaveStyle({
      textAlign: 'center',
      fontStyle: 'italic',
      fontWeight: 'bold',
    })
    expect(screen.getByText('第一条分支。')).toBeInTheDocument()
    expect(screen.queryByText(/已省略 \d+ 条演出控制指令。/)).not.toBeInTheDocument()
    expect(screen.queryByText(/背景资源暂不可用/)).not.toBeInTheDocument()

    vi.unstubAllGlobals()
  })

  it('renders knowledge related index entries for the current content id', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
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
            albumKind: 'intermezzi',
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
            code: 'ST-1',
            avgTag: '行动前',
            navigation: { previousChapterId: null, nextChapterId: null },
            blocks: [{ type: 'narration', id: 'b1', text: '正文。' }],
            citations: [],
          })
        )
      }

      if (url.endsWith('/data/zh_CN/knowledge/related-index.json')) {
        return new Response(
          JSON.stringify({
            schemaVersion: 1,
            generatedAt: '2026-05-18T00:00:00Z',
            items: {
              'storyline:sidestory:st-1:st-1:beg': [
                {
                  id: 'rel-1',
                  targetId: 'storyline:sidestory:wd-8:wd-8:end',
                  targetType: 'chapter',
                  targetAlbumId: 'act18d0',
                  targetTitle: 'WD-8 大雪将至 行动后',
                  relationType: 'same-character-event',
                  relevance: 0.82,
                  reason: '同一角色事件在更早章节中展开。',
                },
              ],
            },
          })
        )
      }

      if (url.endsWith('/data/zh_CN/albums/act18d0.json')) {
        return new Response(
          JSON.stringify({
            id: 'act18d0',
            title: '遗尘漫步',
            albumKind: 'sideStory',
            chapters: [
              {
                id: 'act18d0--activities__act18d0__level_act18d0_08_end',
                title: '大雪将至',
                code: 'WD-8',
                avgTag: '行动后',
              },
            ],
          })
        )
      }

      if (url.startsWith('/assets/storyline/')) {
        return createImageResponse()
      }

      return new Response('not found', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/zh_CN/read/act_test/act_test--c1']}>
          <AppRouter locale="zh_CN" />
        </MemoryRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: '第一章' })
    const relatedLink = await screen.findByRole('link', {
      name: /\[1\]\s*大雪将至\s*《遗尘漫步》\s*WD-8\s*行动后/,
    })
    expect(relatedLink).toHaveAttribute(
      'href',
      '/zh_CN/read/act18d0/act18d0--activities__act18d0__level_act18d0_08_end'
    )
    expect(relatedLink).toHaveAttribute('target', '_blank')
    expect(screen.getByText(/同一角色事件在更早章节中展开。/)).toBeInTheDocument()

    vi.unstubAllGlobals()
  })

  it('opens digit-prefixed mainline related stage codes as concrete read pages', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url

      if (url.endsWith('/data/zh_CN/albums/main_11.json')) {
        return new Response(
          JSON.stringify({
            id: 'main_11',
            title: '淬火尘霾',
            albumKind: 'mainline',
            chapters: [
              {
                id: 'main_11--obt__main__level_main_11-02_beg',
                title: '一丝光亮',
                code: '11-2',
                avgTag: '行动前',
              },
            ],
          })
        )
      }

      if (url.endsWith('/data/zh_CN/chapters/main_11--obt__main__level_main_11-02_beg.json')) {
        return new Response(
          JSON.stringify({
            id: 'main_11--obt__main__level_main_11-02_beg',
            albumId: 'main_11',
            title: '一丝光亮',
            code: '11-2',
            avgTag: '行动前',
            navigation: { previousChapterId: null, nextChapterId: null },
            blocks: [{ type: 'narration', id: 'b1', text: '正文。' }],
            citations: [],
          })
        )
      }

      if (url.endsWith('/data/zh_CN/knowledge/related-index.json')) {
        return new Response(
          JSON.stringify({
            schemaVersion: 1,
            generatedAt: '2026-05-18T00:00:00Z',
            items: {
              'storyline:mainline:11-2:11-2:beg': [
                {
                  id: 'rel-jt8',
                  targetId: 'storyline:mainline:jt8-2:jt8-2:beg',
                  targetType: 'chapter',
                  targetAlbumId: 'main_8',
                  targetTitle: 'JT8-2 睁眼，便是日暮 行动前',
                  relationType: 'same-character-event',
                  relevance: 0.82,
                  reason: '同一角色事件在更早章节中展开。',
                },
              ],
            },
          })
        )
      }

      if (url.endsWith('/data/zh_CN/albums/main_8.json')) {
        return new Response(
          JSON.stringify({
            id: 'main_8',
            title: '怒号光明',
            albumKind: 'mainline',
            chapters: [
              {
                id: 'main_8--obt__main__level_main_08-16_beg',
                title: '睁眼，便是日暮',
                code: 'JT8-2',
                avgTag: '行动前',
              },
              {
                id: 'main_8--obt__main__level_main_08-16_end',
                title: '睁眼，便是日暮',
                code: 'JT8-2',
                avgTag: '行动后',
              },
            ],
          })
        )
      }

      if (url.startsWith('/assets/storyline/')) {
        return createImageResponse()
      }

      return new Response('not found', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <AppProviders>
        <MemoryRouter
          initialEntries={['/zh_CN/read/main_11/main_11--obt__main__level_main_11-02_beg']}
        >
          <AppRouter locale="zh_CN" />
        </MemoryRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: '一丝光亮' })
    const relatedLink = await screen.findByRole('link', {
      name: /\[1\]\s*睁眼，便是日暮\s*《怒号光明》\s*JT8-2\s*行动前/,
    })
    expect(relatedLink).toHaveAttribute(
      'href',
      '/zh_CN/read/main_8/main_8--obt__main__level_main_08-16_beg'
    )
    expect(relatedLink).toHaveAttribute('target', '_blank')

    vi.unstubAllGlobals()
  })

  it('stops parent sequence while a nested choice in the selected branch is unresolved', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url

      if (url.endsWith('/data/zh_CN/albums/act_nested.json')) {
        return new Response(
          JSON.stringify({
            id: 'act_nested',
            title: '嵌套选项测试',
            albumKind: 'mainline',
            chapters: [{ id: 'act_nested--c1', title: '嵌套章节', code: 'TR-1' }],
          })
        )
      }

      if (url.endsWith('/data/zh_CN/chapters/act_nested--c1.json')) {
        return new Response(
          JSON.stringify({
            id: 'act_nested--c1',
            albumId: 'act_nested',
            title: '嵌套章节',
            code: 'TR-1',
            navigation: { previousChapterId: null, nextChapterId: null },
            blocks: [
              { type: 'narration', id: 'intro', text: '睁开眼。' },
              {
                type: 'choice',
                id: 'choice-outer',
                options: ['你们......是谁？'],
                values: ['1'],
                branches: [
                  {
                    id: 'choice-outer-branch-1',
                    predicate: '1',
                    references: ['1'],
                    blocks: [
                      {
                        type: 'choice',
                        id: 'choice-inner',
                        options: ['......我是......？'],
                        values: ['1'],
                        branches: [
                          {
                            id: 'choice-inner-branch-1',
                            predicate: '1',
                            references: ['1'],
                            blocks: [
                              { type: 'narration', id: 'inner-after', text: '内层分支完成。' },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                type: 'dialogue',
                id: 'outer-sibling-line',
                speaker: '阿米娅',
                text: '至少，对我来说...',
              },
              {
                type: 'choice',
                id: 'choice-next',
                options: ['下一个按钮'],
                values: ['1'],
                branches: [],
              },
            ],
            citations: [],
          })
        )
      }

      if (url.startsWith('/assets/storyline/')) {
        return createImageResponse()
      }

      return new Response('not found', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/zh_CN/read/act_nested/act_nested--c1']}>
          <AppRouter locale="zh_CN" />
        </MemoryRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: '嵌套章节' })
    expect(screen.getByText('睁开眼。')).toBeInTheDocument()
    expect(screen.queryByText('至少，对我来说...')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '下一个按钮' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '你们......是谁？' }))
    expect(screen.getByRole('button', { name: '......我是......？' })).toBeInTheDocument()
    expect(screen.queryByText('至少，对我来说...')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '下一个按钮' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '......我是......？' }))
    expect(screen.getByText('内层分支完成。')).toBeInTheDocument()
    expect(screen.getByText('至少，对我来说...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下一个按钮' })).toBeInTheDocument()

    vi.unstubAllGlobals()
  })

  it('dedupes only consecutive repeated visual cues in reader blocks', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
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
            albumKind: 'intermezzi',
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
            code: 'ST-1',
            navigation: { previousChapterId: null, nextChapterId: null },
            blocks: [
              {
                type: 'imageCue',
                id: 'img-1',
                imageId: 'cg_a',
                assetStatus: 'ready',
                localPath: '/assets/storyline/cg-a.png',
              },
              {
                type: 'imageCue',
                id: 'img-2',
                imageId: 'cg_a',
                assetStatus: 'ready',
                localPath: '/assets/storyline/cg-a.png',
              },
              { type: 'narration', id: 'n1', text: '分隔正文。' },
              {
                type: 'imageCue',
                id: 'img-3',
                imageId: 'cg_a',
                assetStatus: 'ready',
                localPath: '/assets/storyline/cg-a.png',
              },
            ],
            citations: [],
          })
        )
      }

      if (url.startsWith('/assets/storyline/')) {
        return createImageResponse()
      }

      return new Response('not found', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/zh_CN/read/act_test/act_test--c1']}>
          <AppRouter locale="zh_CN" />
        </MemoryRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: '第一章' })
    expect(screen.queryByText(/插图统计/)).not.toBeInTheDocument()
    expect(await screen.findAllByAltText('剧情插图 cg_a')).toHaveLength(2)

    vi.unstubAllGlobals()
  })

  it('defers visual cue image fetching until the frame approaches the viewport', async () => {
    let triggerIntersection: (() => void) | null = null
    const observeMock = vi.fn()
    const unobserveMock = vi.fn()
    const disconnectMock = vi.fn()

    class MockIntersectionObserver implements IntersectionObserver {
      public readonly root = null
      public readonly rootMargin = ''
      public readonly scrollMargin = ''
      public readonly thresholds = []

      public constructor(callback: IntersectionObserverCallback) {
        triggerIntersection = () => {
          callback(
            [{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry],
            this
          )
        }
      }

      public observe(target: Element): void {
        observeMock(target)
      }

      public unobserve(target: Element): void {
        unobserveMock(target)
      }

      public disconnect(): void {
        disconnectMock()
      }

      public takeRecords(): IntersectionObserverEntry[] {
        return []
      }
    }

    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url

      if (url.endsWith('/data/zh_CN/albums/act_lazy.json')) {
        return new Response(
          JSON.stringify({
            id: 'act_lazy',
            title: '测试活动',
            albumKind: 'intermezzi',
            chapters: [{ id: 'act_lazy--c1', title: '第一章', code: 'ST-1' }],
          })
        )
      }

      if (url.endsWith('/data/zh_CN/chapters/act_lazy--c1.json')) {
        return new Response(
          JSON.stringify({
            id: 'act_lazy--c1',
            albumId: 'act_lazy',
            title: '第一章',
            code: 'ST-1',
            navigation: { previousChapterId: null, nextChapterId: null },
            blocks: [
              { type: 'narration', id: 'n1', text: '图片前正文。' },
              {
                type: 'imageCue',
                id: 'img-lazy',
                imageId: 'cg_lazy',
                assetStatus: 'ready',
                localPath: '/assets/storyline/cg-lazy.png',
              },
            ],
            citations: [],
          })
        )
      }

      if (url.endsWith('/assets/storyline/cg-lazy.png')) {
        return createImageResponse()
      }

      return new Response('not found', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/zh_CN/read/act_lazy/act_lazy--c1']}>
          <AppRouter locale="zh_CN" />
        </MemoryRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: '第一章' })
    await waitFor(() => expect(observeMock).toHaveBeenCalled())

    expect(screen.queryByAltText('剧情插图 cg_lazy')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith('/assets/storyline/cg-lazy.png', expect.anything())

    act(() => {
      triggerIntersection?.()
    })

    expect(await screen.findByAltText('剧情插图 cg_lazy')).toHaveAttribute(
      'data-source-url',
      '/assets/storyline/cg-lazy.png'
    )
    expect(disconnectMock).toHaveBeenCalled()

    vi.unstubAllGlobals()
  })

  it('renders underlined text for cited block in reader page', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
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
            albumKind: 'intermezzi',
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
            code: 'ST-1',
            navigation: { previousChapterId: null, nextChapterId: null },
            blocks: [{ type: 'narration', id: 'b1', text: '这段文字应有 citation 下划线。' }],
            citations: [{ id: 'c1', blockId: 'b1', marker: 1 }],
          })
        )
      }

      return new Response('not found', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(
      <AppProviders>
        <MemoryRouter initialEntries={['/zh_CN/read/act_test/act_test--c1']}>
          <AppRouter locale="zh_CN" />
        </MemoryRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: '第一章' })
    expect(container.querySelector('u')?.textContent).toContain('这段文字应有 citation 下划线。')

    vi.unstubAllGlobals()
  })

  it('shows explicit error state when chapter has missing story text diagnostics', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
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
            albumKind: 'intermezzi',
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
            code: 'ST-1',
            navigation: { previousChapterId: null, nextChapterId: null },
            blocks: [],
            citations: [],
            buildDiagnostics: [
              {
                code: 'missing-story-text',
                message: 'Required chapter story text file was not found.',
                sourcePath: 'gamedata/story/activities/act_test/level_missing_01.txt',
              },
            ],
          })
        )
      }

      return new Response('not found', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/zh_CN/read/act_test/act_test--c1']}>
          <AppRouter locale="zh_CN" />
        </MemoryRouter>
      </AppProviders>
    )

    await screen.findByText(
      '章节正文缺失，暂无法阅读（gamedata/story/activities/act_test/level_missing_01.txt）。'
    )

    vi.unstubAllGlobals()
  })

  it('shows stable missing placeholder when all visual cue candidates fail and never switches to generic bg', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url

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
                timelineRank: 1,
                chapterCount: 1,
              },
            ],
          })
        )
      }

      if (url.endsWith('/data/zh_CN/albums/act_test.json')) {
        return new Response(
          JSON.stringify({
            id: 'act_test',
            title: '测试活动',
            albumKind: 'intermezzi',
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
            code: 'ST-1',
            navigation: { previousChapterId: null, nextChapterId: null },
            blocks: [
              {
                type: 'backgroundCue',
                id: 'bg1',
                sourceImageId: '60_g12_rhodesdeck_cloudy',
                sourceUrl:
                  'https://raw.githubusercontent.com/Aceship/Arknight-Images/main/avg/backgrounds/60_g12_rhodesdeck_cloudy.png',
              },
              { type: 'narration', id: 'b3', text: '正文仍然可读。' },
            ],
            citations: [],
          })
        )
      }

      return new Response('not found', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/zh_CN/read/act_test/act_test--c1']}>
          <AppRouter locale="zh_CN" />
        </MemoryRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: '第一章' })
    expect(await screen.findByText('资源缺失')).toBeInTheDocument()
    expect(screen.queryByAltText('剧情背景')).not.toBeInTheDocument()
    expect(screen.getByText('正文仍然可读。')).toBeInTheDocument()

    vi.unstubAllGlobals()
  })

  it('renders bottom chapter navigation links in reader page', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url

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
                timelineRank: 1,
                chapterCount: 3,
              },
            ],
          })
        )
      }

      if (url.endsWith('/data/zh_CN/albums/act_test.json')) {
        return new Response(
          JSON.stringify({
            id: 'act_test',
            title: '测试活动',
            albumKind: 'intermezzi',
            chapters: [
              { id: 'act_test--c1', title: '第一章', code: 'ST-1' },
              { id: 'act_test--c2', title: '第二章', code: 'ST-2' },
              { id: 'act_test--c3', title: '第三章', code: 'ST-3' },
            ],
          })
        )
      }

      if (url.endsWith('/data/zh_CN/chapters/act_test--c2.json')) {
        return new Response(
          JSON.stringify({
            id: 'act_test--c2',
            albumId: 'act_test',
            title: '第二章',
            code: 'ST-2',
            navigation: { previousChapterId: 'act_test--c1', nextChapterId: 'act_test--c3' },
            blocks: [{ type: 'narration', id: 'n1', text: '章节正文。' }],
            citations: [],
          })
        )
      }

      if (url.endsWith('/data/zh_CN/chapters/act_test--c3.json')) {
        return new Response(
          JSON.stringify({
            id: 'act_test--c3',
            albumId: 'act_test',
            title: '第三章',
            code: 'ST-3',
            navigation: { previousChapterId: 'act_test--c2', nextChapterId: null },
            blocks: [{ type: 'narration', id: 'n3', text: '预取章节。' }],
            citations: [],
          })
        )
      }

      return new Response('not found', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/zh_CN/read/act_test/act_test--c2']}>
          <AppRouter locale="zh_CN" />
        </MemoryRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: '第二章' })
    const bottomNavigation = screen.getByLabelText('正文末尾导航')
    expect(bottomNavigation).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: '上一章' }).at(-1)).toHaveAttribute(
      'href',
      '/zh_CN/read/act_test/act_test--c1'
    )
    expect(screen.getAllByRole('link', { name: '下一章' }).at(-1)).toHaveAttribute(
      'href',
      '/zh_CN/read/act_test/act_test--c3'
    )

    vi.unstubAllGlobals()
  })

  it('resets window scroll to top after chapter navigation', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url

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
                timelineRank: 1,
                chapterCount: 3,
              },
            ],
          })
        )
      }

      if (url.endsWith('/data/zh_CN/albums/act_test.json')) {
        return new Response(
          JSON.stringify({
            id: 'act_test',
            title: '测试活动',
            albumKind: 'intermezzi',
            chapters: [
              { id: 'act_test--c1', title: '第一章', code: 'ST-1' },
              { id: 'act_test--c2', title: '第二章', code: 'ST-2' },
              { id: 'act_test--c3', title: '第三章', code: 'ST-3' },
            ],
          })
        )
      }

      if (url.endsWith('/data/zh_CN/chapters/act_test--c2.json')) {
        return new Response(
          JSON.stringify({
            id: 'act_test--c2',
            albumId: 'act_test',
            title: '第二章',
            code: 'ST-2',
            navigation: { previousChapterId: 'act_test--c1', nextChapterId: 'act_test--c3' },
            blocks: [{ type: 'narration', id: 'n1', text: '章节正文。' }],
            citations: [],
          })
        )
      }

      if (url.endsWith('/data/zh_CN/chapters/act_test--c3.json')) {
        return new Response(
          JSON.stringify({
            id: 'act_test--c3',
            albumId: 'act_test',
            title: '第三章',
            code: 'ST-3',
            navigation: { previousChapterId: 'act_test--c2', nextChapterId: null },
            blocks: [{ type: 'narration', id: 'n2', text: '下一章正文。' }],
            citations: [],
          })
        )
      }

      return new Response('not found', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)
    const scrollToMock = vi.fn()
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      value: scrollToMock,
      writable: true,
    })

    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/zh_CN/read/act_test/act_test--c2']}>
          <AppRouter locale="zh_CN" />
        </MemoryRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: '第二章' })
    scrollToMock.mockClear()

    fireEvent.click(screen.getAllByRole('link', { name: '下一章' }).at(-1)!)
    await screen.findByRole('heading', { name: '第三章' })

    expect(scrollToMock).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' })

    vi.unstubAllGlobals()
  })

  it('renders cross-album navigation for first and last chapter in mainline albums', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url

      if (url.endsWith('/data/zh_CN/timeline.json')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'main-prev',
                albumId: 'main-prev',
                slug: 'main-prev',
                title: '主题前篇',
                albumKind: 'mainline',
                section: 'mainline',
                timelineRank: 1,
                chapterCount: 2,
              },
              {
                id: 'main-cur',
                albumId: 'main-cur',
                slug: 'main-cur',
                title: '当前主题',
                albumKind: 'mainline',
                section: 'mainline',
                timelineRank: 2,
                chapterCount: 2,
              },
              {
                id: 'main-next',
                albumId: 'main-next',
                slug: 'main-next',
                title: '主题后篇',
                albumKind: 'mainline',
                section: 'mainline',
                timelineRank: 3,
                chapterCount: 2,
              },
            ],
          })
        )
      }

      if (url.endsWith('/data/zh_CN/albums/main-prev.json')) {
        return new Response(
          JSON.stringify({
            id: 'main-prev',
            title: '主题前篇',
            albumKind: 'mainline',
            chapters: [
              { id: 'main-prev--c1', title: '前篇一', code: 'P-1' },
              { id: 'main-prev--c2', title: '前篇二', code: 'P-2' },
            ],
          })
        )
      }

      if (url.endsWith('/data/zh_CN/albums/main-next.json')) {
        return new Response(
          JSON.stringify({
            id: 'main-next',
            title: '主题后篇',
            albumKind: 'mainline',
            chapters: [
              { id: 'main-next--c1', title: '后篇一', code: 'N-1' },
              { id: 'main-next--c2', title: '后篇二', code: 'N-2' },
            ],
          })
        )
      }

      if (url.endsWith('/data/zh_CN/albums/main-cur.json')) {
        return new Response(
          JSON.stringify({
            id: 'main-cur',
            title: '当前主题',
            albumKind: 'mainline',
            chapters: [
              { id: 'main-cur--c1', title: '当前一', code: 'C-1' },
              { id: 'main-cur--c2', title: '当前二', code: 'C-2' },
            ],
          })
        )
      }

      if (url.endsWith('/data/zh_CN/chapters/main-cur--c1.json')) {
        return new Response(
          JSON.stringify({
            id: 'main-cur--c1',
            albumId: 'main-cur',
            title: '当前一',
            code: 'C-1',
            navigation: { previousChapterId: null, nextChapterId: 'main-cur--c2' },
            blocks: [{ type: 'narration', id: 'n1', text: '首章正文。' }],
            citations: [],
          })
        )
      }

      if (url.endsWith('/data/zh_CN/chapters/main-cur--c2.json')) {
        return new Response(
          JSON.stringify({
            id: 'main-cur--c2',
            albumId: 'main-cur',
            title: '当前二',
            code: 'C-2',
            navigation: { previousChapterId: 'main-cur--c1', nextChapterId: null },
            blocks: [{ type: 'narration', id: 'n2', text: '末章正文。' }],
            citations: [],
          })
        )
      }

      return new Response('not found', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    const firstRender = render(
      <AppProviders>
        <MemoryRouter initialEntries={['/zh_CN/read/main-cur/main-cur--c1']}>
          <AppRouter locale="zh_CN" />
        </MemoryRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: '当前一' })
    expect(await screen.findByRole('link', { name: '上一曲谱' })).toHaveAttribute(
      'href',
      '/zh_CN/read/main-prev/main-prev--c2'
    )

    firstRender.unmount()

    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/zh_CN/read/main-cur/main-cur--c2']}>
          <AppRouter locale="zh_CN" />
        </MemoryRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: '当前二' })
    expect(await screen.findByRole('link', { name: '下一曲谱' })).toHaveAttribute(
      'href',
      '/zh_CN/read/main-next/main-next--c1'
    )

    vi.unstubAllGlobals()
  })

  it('continues cross-album navigation into catalog-only mainline albums', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url

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
                timelineRank: 14,
                gameOrderRank: 5011,
                chapterCount: 2,
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
              { id: 'main_14--c1', title: '慈悲灯塔一', code: '14-1' },
              { id: 'main_14--c2', title: '慈悲灯塔二', code: '14-2' },
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
            chapters: [{ id: 'main_15--c1', title: '离解复合一', code: '15-1' }],
          })
        )
      }

      if (url.endsWith('/data/zh_CN/chapters/main_14--c2.json')) {
        return new Response(
          JSON.stringify({
            id: 'main_14--c2',
            albumId: 'main_14',
            title: '慈悲灯塔二',
            code: '14-2',
            navigation: { previousChapterId: 'main_14--c1', nextChapterId: null },
            blocks: [{ type: 'narration', id: 'n1', text: '十四章末尾。' }],
            citations: [],
          })
        )
      }

      if (url.endsWith('/data/zh_CN/chapters/main_15--c1.json')) {
        return new Response(
          JSON.stringify({
            id: 'main_15--c1',
            albumId: 'main_15',
            title: '离解复合一',
            code: '15-1',
            navigation: { previousChapterId: null, nextChapterId: null },
            blocks: [{ type: 'narration', id: 'n2', text: '十五章开头。' }],
            citations: [],
          })
        )
      }

      return new Response('not found', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    const lastChapterRender = render(
      <AppProviders>
        <MemoryRouter initialEntries={['/zh_CN/read/main_14/main_14--c2']}>
          <AppRouter locale="zh_CN" />
        </MemoryRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: '慈悲灯塔二' })
    expect(await screen.findByRole('link', { name: '下一曲谱' })).toHaveAttribute(
      'href',
      '/zh_CN/read/main_15/main_15--c1'
    )

    lastChapterRender.unmount()

    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/zh_CN/read/main_15/main_15--c1']}>
          <AppRouter locale="zh_CN" />
        </MemoryRouter>
      </AppProviders>
    )

    await screen.findByRole('heading', { name: '离解复合一' })
    expect(await screen.findByRole('link', { name: '上一曲谱' })).toHaveAttribute(
      'href',
      '/zh_CN/read/main_14/main_14--c2'
    )

    vi.unstubAllGlobals()
  })
})
