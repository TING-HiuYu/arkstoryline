import { describe, expect, it } from 'vitest'

import { buildUrlSlug } from './url-slug'

describe('buildUrlSlug', () => {
  it('uses title when title can be normalized into a slug', () => {
    const result = buildUrlSlug({
      title: 'Episode 14: Absolved Will Be the Seekers',
      stableId: 'main_14',
    })

    expect(result).toEqual({
      slug: 'episode-14-absolved-will-be-the-seekers',
      source: 'title',
    })
  })

  it('falls back to stable id when title is unusable', () => {
    const result = buildUrlSlug({
      title: '黑暗时代',
      stableId: 'act18d0',
    })

    expect(result).toEqual({
      slug: 'act18d0',
      source: 'stable-id',
      reason: 'title-unusable',
    })
  })

  it('falls back to default slug when title and stable id are unusable', () => {
    const result = buildUrlSlug({
      title: '###',
      stableId: '___',
    })

    expect(result).toEqual({
      slug: 'album-unknown',
      source: 'fallback',
      reason: 'title-and-stable-id-unusable',
    })
  })
})
