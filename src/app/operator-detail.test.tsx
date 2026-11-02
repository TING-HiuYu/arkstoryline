import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppProviders } from './providers'
import { AppRouter } from './router'

describe('Operator detail runtime content', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each(['wrapped', 'empty', 'failure'] as const)(
    'preserves existing information while handling %s PRTS content',
    async (result) => {
      let finishRuntime!: (response: Response) => void
      const runtimeResponse = new Promise<Response>((resolve) => {
        finishRuntime = resolve
      })
      const fetchMock = vi.fn(async (input: string | URL | Request) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        if (url.endsWith('/data/operator/index.json')) {
          return new Response(
            JSON.stringify({
              operators: [
                { slug: 'operator-test', name: '测试干员', page: '测试干员', profession: '辅助' },
              ],
            })
          )
        }
        if (url.startsWith('https://m.prts.wiki/api.php')) {
          const response = await runtimeResponse
          return response.clone()
        }
        return new Response('not found', { status: 404 })
      })
      vi.stubGlobal('fetch', fetchMock)

      render(
        <AppProviders>
          <MemoryRouter initialEntries={['/zh_CN/operators/operator-test']}>
            <AppRouter locale="zh_CN" />
          </MemoryRouter>
        </AppProviders>
      )

      expect(await screen.findByRole('heading', { name: '基础档案' })).toBeInTheDocument()
      expect(screen.getByText('正在从 PRTS 加载干员正文...')).toBeInTheDocument()
      finishRuntime(
        result === 'failure'
          ? new Response('unavailable', { status: 503 })
          : new Response(
              JSON.stringify({
                parse: {
                  text: {
                    '*':
                      result === 'wrapped'
                        ? `<div class="mw-heading mw-heading2"><h2 id="干员档案">干员档案</h2></div>
                           <table><tr><th>档案资料一</th></tr><tr><td>完整档案正文</td></tr></table>`
                        : '<p>没有可解析的档案</p>',
                  },
                },
              })
            )
      )

      if (result === 'wrapped') {
        expect(await screen.findByText('完整档案正文')).toBeInTheDocument()
      } else {
        const message =
          result === 'empty'
            ? '未能从 PRTS 解析干员档案，已保留现有信息。'
            : 'PRTS 干员档案加载失败，已保留现有信息，请稍后重试。'
        expect(await screen.findByText(message, {}, { timeout: 4000 })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: '基础档案' })).toBeInTheDocument()
      }
      await waitFor(() => {
        expect(screen.queryByText('正在从 PRTS 加载干员正文...')).not.toBeInTheDocument()
      })
      expect(screen.queryByText('该干员暂无可展示内容。')).not.toBeInTheDocument()
    }
  )
})
