import { describe, expect, expectTypeOf, it } from 'vitest'

import type { HomeSection } from '../catalog/home-section'
import type { StoryEntryType } from '../catalog/story-album'
import type { TimelineItem } from './timeline-item'

describe('timeline-item', () => {
  it('keeps timeline card fields aligned with catalog types', () => {
    const item: TimelineItem = {
      id: 'main_00',
      albumId: 'main_00',
      slug: 'ep00-dark-age',
      title: '黑暗时代·上',
      albumKind: 'mainline',
      section: 'mainline',
      timelineRank: 10,
      gameOrderRank: 10,
      side: 'left',
      chapterCount: 4,
    }

    expect(item.chapterCount).toBe(4)
    expectTypeOf(item.section).toEqualTypeOf<HomeSection>()
    expectTypeOf(item.albumKind).toEqualTypeOf<StoryEntryType>()
    expectTypeOf(item.side).toEqualTypeOf<'left' | 'right' | undefined>()
  })
})
