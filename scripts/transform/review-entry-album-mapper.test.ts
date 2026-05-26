import { describe, expect, it } from 'vitest'

import type { RawStoryReviewEntry } from './raw-models/raw-story-review-entry'
import { mapReviewEntryToAlbum } from './review-entry-album-mapper'

describe('mapReviewEntryToAlbum', () => {
  it('maps RawStoryReviewEntry to StoryAlbum with safe defaults', () => {
    const entry: RawStoryReviewEntry = {
      albumKind: 'ACTIVITY',
      name: ' 黑暗时代 ',
      startTime: 1_650_000_000,
    }

    const album = mapReviewEntryToAlbum('act18d0', entry)

    expect(album).toEqual({
      id: 'act18d0',
      slug: 'act18d0',
      title: '黑暗时代',
      sourceEntryType: 'ACTIVITY',
      albumKind: 'sidestory',
      homeSection: 'sideStory',
      timelineRank: 1_650_000_000,
      gameOrderRank: undefined,
      startTime: 1_650_000_000,
      side: undefined,
      chapters: [],
      source: {
        providerId: 'unknown-provider',
        revision: 'unknown-revision',
        path: 'story_review_table.storyReviewTable.act18d0',
      },
    })
  })

  it('supports extension hooks for unresolved fields and source metadata', () => {
    const entry: RawStoryReviewEntry = {
      albumKind: 'MAINLINE',
      name: 'Episode 14',
    }

    const album = mapReviewEntryToAlbum('main_14', entry, {
      slugify: ({ id, title }) => `${id}-${title.toLowerCase()}`,
      resolveEntryType: () => 'mainline',
      resolveHomeSection: () => 'mainline',
      resolveTimelineRank: () => 14,
      resolveGameOrderRank: () => 1401,
      resolveSide: () => 'left',
      resolveCover: () => ({
        primaryImageId: 'kv_main_14',
        source: 'stage-kv',
        assetStatus: 'disabled',
        assetPath: '/assets/covers/zh_CN/placeholder.svg',
      }),
      source: {
        providerId: 'github-raw',
        revision: 'abc123',
        path: 'zh_CN/gamedata/excel/story_review_table.json',
      },
    })

    expect(album).toEqual({
      id: 'main_14',
      slug: 'main_14-episode 14',
      title: 'Episode 14',
      sourceEntryType: 'MAINLINE',
      albumKind: 'mainline',
      homeSection: 'mainline',
      timelineRank: 14,
      gameOrderRank: 1401,
      cover: {
        primaryImageId: 'kv_main_14',
        source: 'stage-kv',
        assetStatus: 'disabled',
        assetPath: '/assets/covers/zh_CN/placeholder.svg',
      },
      startTime: undefined,
      side: 'left',
      chapters: [],
      source: {
        providerId: 'github-raw',
        revision: 'abc123',
        path: 'zh_CN/gamedata/excel/story_review_table.json',
      },
    })
  })

  it('maps storyline story set type MAINLINE to mainline by default rule', () => {
    const entry: RawStoryReviewEntry = {
      albumKind: 'ACTIVITY',
      name: 'Episode 14',
    }

    const album = mapReviewEntryToAlbum('main_14', entry, {
      resolveStorylineStorySetType: () => 'MAINLINE',
    })

    expect(album.albumKind).toBe('mainline')
    expect(album.homeSection).toBe('mainline')
  })

  it('maps storyline story set type COLLECT to sideStory by default rule', () => {
    const entry: RawStoryReviewEntry = {
      albumKind: 'ACTIVITY',
      name: 'Collection A',
    }

    const album = mapReviewEntryToAlbum('collect_a', entry, {
      resolveStorylineStorySetType: () => 'COLLECT',
    })

    expect(album.albumKind).toBe('sideStory')
    expect(album.homeSection).toBe('sideStory')
  })

  it('maps storyline story set type NONE to operatorRecord by default rule', () => {
    const entry: RawStoryReviewEntry = {
      albumKind: 'ACTIVITY',
      name: 'Operator Record A',
    }

    const album = mapReviewEntryToAlbum('oprec_a', entry, {
      resolveStorylineStorySetType: () => 'NONE',
    })

    expect(album.albumKind).toBe('operatorRecord')
    expect(album.homeSection).toBe('operatorRecord')
  })

  it('maps review entry type NONE to operatorRecord by default rule', () => {
    const entry: RawStoryReviewEntry = {
      albumKind: 'NONE',
      name: 'Operator Record A',
    }

    const album = mapReviewEntryToAlbum('oprec_a', entry)

    expect(album.albumKind).toBe('operatorRecord')
    expect(album.homeSection).toBe('operatorRecord')
  })

  it('maps story-prefixed review entries to operatorRecord when no storyline story set is available', () => {
    const entry: RawStoryReviewEntry = {
      name: '向死寻生',
    }

    const album = mapReviewEntryToAlbum('story_absin_set_1', entry)

    expect(album.albumKind).toBe('operatorRecord')
    expect(album.homeSection).toBe('operatorRecord')
  })

  it('emits diagnosable slug fallback metadata when title slug is unavailable', () => {
    const entry: RawStoryReviewEntry = {
      albumKind: 'ACTIVITY',
      name: '黑暗时代',
    }
    const fallbackDiagnostics: Array<{
      id: string
      title: string
      slug: string
      source: 'stable-id' | 'fallback'
      reason: 'title-unusable' | 'title-and-stable-id-unusable' | 'all-inputs-unusable'
    }> = []

    const album = mapReviewEntryToAlbum('act18d0', entry, {
      onSlugFallback: (diagnostic) => {
        fallbackDiagnostics.push(diagnostic)
      },
    })

    expect(album.slug).toBe('act18d0')
    expect(fallbackDiagnostics).toEqual([
      {
        id: 'act18d0',
        title: '黑暗时代',
        slug: 'act18d0',
        source: 'stable-id',
        reason: 'title-unusable',
      },
    ])
  })
})
