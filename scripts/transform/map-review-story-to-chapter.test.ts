import { describe, expect, it } from 'vitest'

import type { RawInfoUnlockData } from './raw-models/raw-info-unlock-data'
import { mapReviewStoryToChapter } from './map-review-story-to-chapter'

describe('mapReviewStoryToChapter', () => {
  it('maps chapter fields from storyTxt into a stable chapter ref', () => {
    const rawStory: RawInfoUnlockData = {
      storyCode: 'ST-1',
      storyName: 'Dark Ages',
      avgTag: 'before',
      storySort: 10,
      storyTxt: 'story/activities/act9d0/level_act9d0_01_beg.txt',
    }

    const chapter = mapReviewStoryToChapter('act9d0', rawStory)

    expect(chapter).toEqual({
      id: 'act9d0--activities__act9d0__level_act9d0_01_beg',
      albumId: 'act9d0',
      title: 'Dark Ages',
      code: 'ST-1',
      avgTag: 'before',
      sort: 10,
      path: 'chapters/act9d0--activities__act9d0__level_act9d0_01_beg.json',
      infoPath: undefined,
      downloadable: true,
    })
  })

  it('falls back to deterministic id and defaults when storyTxt is missing', () => {
    const chapter = mapReviewStoryToChapter('act9d0', {
      storyCode: 'ST 2',
      storyName: '  ',
      avgTag: 'AFTER',
      storySort: undefined,
    })

    expect(chapter).toEqual({
      id: 'act9d0--st-2-after',
      albumId: 'act9d0',
      title: 'ST 2',
      code: 'ST 2',
      avgTag: 'AFTER',
      sort: 0,
      path: 'chapters/act9d0--st-2-after.json',
      infoPath: undefined,
      downloadable: false,
    })
  })

  it('normalizes slash and extension variants in storyTxt', () => {
    const chapter = mapReviewStoryToChapter('act9d0', {
      storyName: 'Example',
      storyTxt: '\\gamedata\\story\\obt\\main\\avg_story_1',
    })

    expect(chapter.id).toBe('act9d0--obt__main__avg_story_1')
    expect(chapter.path).toBe('chapters/act9d0--obt__main__avg_story_1.json')
    expect(chapter.downloadable).toBe(true)
  })
})
