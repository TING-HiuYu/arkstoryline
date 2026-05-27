import { describe, expect, it } from 'vitest'
import {
  loadRuntimeWikiStoryPage,
  normalizeWikiPageTitle,
  parseRuntimeWikiTextlog,
} from './runtime-wiki-story'

describe('runtime wiki story safety', () => {
  it('throws on empty runtime wiki page title instead of using a demo fallback', () => {
    expect(() => normalizeWikiPageTitle('   ')).toThrow(/cannot be empty/)
  })

  it('keeps only trusted media URLs or safe relative paths in parsed runtime resources', () => {
    const textlog = [
      '[Background(image="safe_relative")]',
      '[Image(image="safe_media")]',
      '[Image(image="evil_http")]',
      '[Image(image="localhost")]',
      '[Image(image="script")]',
      '[Image(image="data_uri")]',
      '[Image(image="traversal")]',
    ].join('\n')

    const blocks = parseRuntimeWikiTextlog(textlog, {
      safe_relative: '/assets/storyline/bg.png',
      safe_media: 'https://media.prts.wiki/images/bg.png',
      evil_http: 'https://evil.example/images/bg.png',
      localhost: 'http://localhost:3000/bg.png',
      script: 'javascript:alert(1)',
      data_uri: 'data:image/svg+xml,<svg />',
      traversal: '../private/bg.png',
    })

    expect(blocks.map((block) => (block.type === 'image' ? block.url : undefined))).toEqual([
      '/assets/storyline/bg.png',
      'https://media.prts.wiki/images/bg.png',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ])
  })

  it('requests the mobile wiki API directly to avoid mobile user-agent redirects', async () => {
    let requestedUrl = ''
    const fetchImpl = (async (url: RequestInfo | URL) => {
      requestedUrl = String(url)
      return new Response(
        JSON.stringify({
          parse: {
            title: '1-1 孤岛/BEG',
            text: {
              '*': '<pre id="datas_txt">[name="阿米娅"]博士，醒一醒。</pre><pre id="datas_back"></pre>',
            },
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    }) as typeof fetch

    const page = await loadRuntimeWikiStoryPage('1-1 孤岛/BEG', fetchImpl)

    expect(new URL(requestedUrl).hostname).toBe('m.prts.wiki')
    expect(page.blocks[0]).toMatchObject({
      type: 'dialogue',
      speaker: '阿米娅',
      text: '博士，醒一醒。',
    })
  })
})
