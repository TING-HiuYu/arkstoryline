import { test } from 'node:test'
import assert from 'node:assert/strict'
import worker from './portal.mjs'

const env = { ASSETS: { fetch: async (request) => new Response(new URL(request.url).pathname) } }
const request = (url, navigate = false) =>
  new Request(url, { headers: navigate ? { 'sec-fetch-mode': 'navigate' } : {} })

test('serves the navigation page only at the apex root', async () => {
  assert.equal(await (await worker.fetch(request('https://thy.icu/'), env)).text(), '/_portal/')
  assert.equal(await (await worker.fetch(request('https://example.workers.dev/'), env)).text(), '/')
})

test('routes deep story navigation to its own SPA while preserving assets', async () => {
  const nav = await worker.fetch(
    request('https://thy.icu/ark/storyline/zh_CN/albums/main_0', true),
    env
  )
  assert.equal(await nav.text(), '/ark/storyline/')
  const data = await worker.fetch(
    request('https://thy.icu/ark/storyline/data/zh_CN/catalog.json'),
    env
  )
  assert.equal(await data.text(), '/ark/storyline/data/zh_CN/catalog.json')
  const redirect = await worker.fetch(request('https://thy.icu/ark/storyline?x=1'), env)
  assert.equal(redirect.status, 308)
  assert.equal(redirect.headers.get('location'), 'https://thy.icu/ark/storyline/?x=1')
})
