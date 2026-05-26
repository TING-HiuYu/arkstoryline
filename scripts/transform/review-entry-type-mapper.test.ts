import { describe, expect, it } from 'vitest'

import { mapReviewEntryTypeToEntryType } from './review-entry-type-mapper'

describe('mapReviewEntryTypeToEntryType', () => {
  it('maps NONE to operatorRecord', () => {
    expect(mapReviewEntryTypeToEntryType('NONE')).toBe('operatorRecord')
  })

  it('returns undefined for unsupported values', () => {
    expect(mapReviewEntryTypeToEntryType('ACTIVITY')).toBeUndefined()
    expect(mapReviewEntryTypeToEntryType(undefined)).toBeUndefined()
  })
})
