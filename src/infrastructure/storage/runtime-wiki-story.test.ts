import { describe, expect, it } from 'vitest'
import { normalizeWikiPageTitle, parseRuntimeWikiTextlog } from './runtime-wiki-story'

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
})
