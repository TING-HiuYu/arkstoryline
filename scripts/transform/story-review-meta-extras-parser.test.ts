import { describe, expect, it } from 'vitest'
import { parseStoryReviewMetaOtherStorys } from './story-review-meta-extras-parser'

describe('parseStoryReviewMetaOtherStorys', () => {
  it('parses timeline/log/news/challengeBook/landmark extras and keeps image/music metadata', () => {
    const result = parseStoryReviewMetaOtherStorys({
      storyReviewMetaTable: {
        album_a: {
          timeline: [{ title: '时间线条目', path: 'timeline/a' }],
          log: [{ name: '日志条目', file: 'log/a' }],
          news: [{ caption: '新闻条目', url: 'news/a', imageId: 'img_a' }],
          challengeBook: [{ id: 'challenge-a', bgmId: 'music_a' }],
          landmark: [{ title: '地标条目' }],
        },
      },
    })

    const extras = result.byAlbumId.album_a

    expect(extras).toHaveLength(5)
    expect(extras?.every((item) => item.distributeMusic === false)).toBe(true)
    expect(extras?.some((item) => item.type === 'timeline')).toBe(true)
    expect(extras?.some((item) => item.type === 'log')).toBe(true)
    expect(extras?.some((item) => item.type === 'news' && item.imageId === 'img_a')).toBe(true)
    expect(
      extras?.some((item) => item.type === 'challengeBook' && item.musicId === 'music_a')
    ).toBe(true)
    expect(extras?.some((item) => item.type === 'landmark')).toBe(true)
  })
})
