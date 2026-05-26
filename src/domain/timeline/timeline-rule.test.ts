import { describe, expect, expectTypeOf, it } from 'vitest'

import type { HomeSection } from '../catalog/home-section'
import type { TimelineRule, TimelineRuleReason } from './timeline-rule'

describe('timeline-rule', () => {
  it('uses the documented reason union', () => {
    const reason: TimelineRuleReason = 'storyline-story-set'

    expect(reason).toBe('storyline-story-set')
  })

  it('keeps section bound to HomeSection and optional side', () => {
    const rule: TimelineRule = {
      albumId: 'main_00',
      timelineRank: 10,
      section: 'mainline',
      side: 'left',
      reason: 'manual-override',
    }

    expect(rule.side).toBe('left')
    expectTypeOf(rule.section).toEqualTypeOf<HomeSection>()
    expectTypeOf(rule.side).toEqualTypeOf<'left' | 'right' | undefined>()
  })
})
