import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppProviders } from './providers'
import { AppRouter } from './router'

describe('Album detail layout', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders album chapters as responsive card grid instead of list', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url

      if (url.endsWith('/data/zh_CN/albums/album-1.json')) {
        return new Response(
          JSON.stringify({
            id: 'album-1',
            title: '测试曲谱',
            albumKind: 'mainline',
            chapters: [
              { id: 'album-1--c1', title: '第一章', code: 'TR-1', avgTag: '普通' },
              { id: 'album-1--c2', title: '第二章', code: 'TR-2', avgTag: '普通' },
            ],
            extras: [],
          })
        )
      }

      return new Response('not found', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/zh_CN/albums/album-1']}>
          <AppRouter locale="zh_CN" />
        </MemoryRouter>
      </AppProviders>
    )

    expect(await screen.findByRole('heading', { name: '测试曲谱' })).toBeInTheDocument()

    const chapterGrid = screen.getByTestId('album-chapter-grid')
    expect(chapterGrid).toHaveStyle({ display: 'grid' })
    expect(chapterGrid.getAttribute('style')).toContain('minmax(220px, 1fr)')
    expect((await screen.findAllByRole('link', { name: '进入阅读页' })).length).toBe(2)
  })
})
