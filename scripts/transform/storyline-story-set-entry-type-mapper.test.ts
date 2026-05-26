import { describe, expect, it } from 'vitest'

import { mapStorylineStorySetTypeToEntryType } from './storyline-story-set-entry-type-mapper'

describe('mapStorylineStorySetTypeToEntryType', () => {
  it('maps MAINLINE to mainline', () => {
    expect(mapStorylineStorySetTypeToEntryType('MAINLINE')).toBe('mainline')
  })

  it('maps SS to intermezzi', () => {
    expect(mapStorylineStorySetTypeToEntryType('SS')).toBe('intermezzi')
  })

  it('maps COLLECT to sideStory', () => {
    expect(mapStorylineStorySetTypeToEntryType('COLLECT')).toBe('sideStory')
  })

  it('maps NONE to operatorRecord', () => {
    expect(mapStorylineStorySetTypeToEntryType('NONE')).toBe('operatorRecord')
  })

  it('returns undefined for unresolved story set types', () => {
    expect(mapStorylineStorySetTypeToEntryType(undefined)).toBeUndefined()
    expect(mapStorylineStorySetTypeToEntryType('UNKNOWN')).toBeUndefined()
  })
})
