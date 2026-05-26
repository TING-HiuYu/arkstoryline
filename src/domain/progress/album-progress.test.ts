import { describe, expect, it } from 'vitest'
import { calculateAlbumProgressPercent } from './album-progress'

describe('calculateAlbumProgressPercent', () => {
  it('calculates whole-album progress from the current chapter position', () => {
    const chapterIds = ['c1', 'c2', 'c3', 'c4']

    expect(
      calculateAlbumProgressPercent({
        chapterIds,
        currentChapterId: 'c1',
      })
    ).toBe(25)
    expect(
      calculateAlbumProgressPercent({
        chapterIds,
        currentChapterId: 'c2',
      })
    ).toBe(50)
    expect(
      calculateAlbumProgressPercent({
        chapterIds,
        currentChapterId: 'c4',
      })
    ).toBe(100)
  })

  it('returns zero for empty albums and unknown chapters', () => {
    const chapterIds = ['c1', 'c2']

    expect(
      calculateAlbumProgressPercent({
        chapterIds: [],
        currentChapterId: 'c1',
      })
    ).toBe(0)
    expect(
      calculateAlbumProgressPercent({
        chapterIds,
        currentChapterId: 'missing',
      })
    ).toBe(0)
  })
})
