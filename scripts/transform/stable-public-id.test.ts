import { describe, expect, it } from 'vitest'

import {
  buildStableReviewChapterId,
  buildStableStoryJsonChapterId,
  buildStableStoryNodeId,
  createStableNodeIdState,
  normalizeStableAlbumId,
} from './stable-public-id'

describe('stable-public-id', () => {
  it('normalizes review album id with safe fallback', () => {
    expect(normalizeStableAlbumId('  act9d0  ')).toBe('act9d0')
    expect(normalizeStableAlbumId('')).toBe('album-unknown')
    expect(normalizeStableAlbumId(undefined)).toBe('album-unknown')
  })

  it('builds stable review chapter id from storyTxt path', () => {
    const chapterId = buildStableReviewChapterId({
      albumId: 'act9d0',
      storyTxt: 'story/activities/act9d0/level_act9d0_01_beg.txt',
      storyCode: 'ST-1',
      avgTag: 'before',
      storyName: 'Dark Ages',
    })

    expect(chapterId).toBe('act9d0--activities__act9d0__level_act9d0_01_beg')
  })

  it('builds stable storyjson chapter id with deterministic fallback', () => {
    expect(
      buildStableStoryJsonChapterId({
        storyCode: 'ST-1',
        avgTag: 'before',
        storyName: 'Dark Ages',
        eventId: 'act18d0',
      })
    ).toBe('storyjson-st-1-before-dark-ages-act18d0')

    expect(
      buildStableStoryJsonChapterId({
        storyCode: undefined,
        avgTag: undefined,
        storyName: undefined,
        eventId: undefined,
      })
    ).toBe('storyjson-unknown-chapter')
  })

  it('builds stable story node id without relying on line index fallback', () => {
    const state = createStableNodeIdState()
    const first = buildStableStoryNodeId(undefined, { prop: 'Dialog' }, state)
    const second = buildStableStoryNodeId(undefined, { prop: 'Dialog' }, state)

    expect(first).toMatch(/^story-node-hash-[a-z0-9]+$/)
    expect(second).toBe(`${first}-2`)
    expect(first.includes('line')).toBe(false)
    expect(second.includes('line')).toBe(false)
  })
})
