import { test } from 'node:test'
import assert from 'node:assert/strict'
import worker from './subpath.mjs'

const env = {
  SITE_BASE_PATH: '/test/reader',
  ASSETS: { fetch: async (request) => new Response(new URL(request.url).pathname) },
}
const request = (url, navigate = false) =>
  new Request(url, { headers: navigate ? { 'sec-fetch-mode': 'navigate' } : {} })

test('preserves the path and query when adding the trailing slash', async () => {
  const result = await worker.fetch(request('https://example.test/test/reader?x=1'), env)
  assert.equal(result.status, 308)
  assert.equal(result.headers.get('location'), 'https://example.test/test/reader/?x=1')
})

test('serves the SPA shell for story navigation and preserves asset paths', async () => {
  const nav = await worker.fetch(
    request('https://example.test/test/reader/zh_CN/albums/main_0', true),
    env
  )
  assert.equal(await nav.text(), '/test/reader/')
  const data = await worker.fetch(
    request('https://example.test/test/reader/data/zh_CN/catalog.json'),
    env
  )
  assert.equal(await data.text(), '/test/reader/data/zh_CN/catalog.json')
})
