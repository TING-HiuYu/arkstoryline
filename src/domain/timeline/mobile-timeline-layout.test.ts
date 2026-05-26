import { describe, expect, it } from 'vitest'

import type { TimelineItem } from './timeline-item'
import { buildTimelineMobileGroups, buildTimelineMobileLayoutPlan } from './mobile-timeline-layout'

function createTimelineItem(
  input: Pick<TimelineItem, 'id' | 'section'> & {
    side?: TimelineItem['side']
  }
): TimelineItem {
  return {
    id: input.id,
    albumId: input.id,
    slug: input.id,
    title: input.id,
    albumKind: 'mainline',
    section: input.section,
    timelineRank: 1,
    side: input.side,
    chapterCount: 1,
  }
}

describe('mobile-timeline-layout', () => {
  it('disables mobile fallback outside mobile breakpoint', () => {
    const items: TimelineItem[] = [
      createTimelineItem({ id: 'main_1', section: 'mainline', side: 'left' }),
      createTimelineItem({ id: 'ss_1', section: 'mainline', side: 'right' }),
    ]

    expect(buildTimelineMobileLayoutPlan(items, 1024)).toEqual({
      enabled: false,
      control: 'tabs',
      groups: [
        {
          key: 'mainline',
          label: '主题曲',
          itemIds: ['main_1'],
        },
        {
          key: 'intermezzi',
          label: '别传',
          itemIds: ['ss_1'],
        },
      ],
    })
  })

  it('uses segmented control when mobile only has mainline and intermezzi groups', () => {
    const items: TimelineItem[] = [
      createTimelineItem({ id: 'main_1', section: 'mainline', side: 'left' }),
      createTimelineItem({ id: 'main_2', section: 'mainline', side: 'left' }),
      createTimelineItem({ id: 'ss_1', section: 'mainline', side: 'right' }),
    ]

    expect(buildTimelineMobileLayoutPlan(items, 375)).toEqual({
      enabled: true,
      control: 'segmented',
      groups: [
        {
          key: 'mainline',
          label: '主题曲',
          itemIds: ['main_1', 'main_2'],
        },
        {
          key: 'intermezzi',
          label: '别传',
          itemIds: ['ss_1'],
        },
      ],
    })
  })

  it('uses tabs when mobile includes additional timeline sections', () => {
    const items: TimelineItem[] = [
      createTimelineItem({ id: 'main_1', section: 'mainline', side: 'left' }),
      createTimelineItem({ id: 'ss_1', section: 'mainline', side: 'right' }),
      createTimelineItem({ id: 'story_set_1', section: 'sideStory' }),
    ]

    expect(buildTimelineMobileLayoutPlan(items, 375)).toEqual({
      enabled: true,
      control: 'tabs',
      groups: [
        {
          key: 'mainline',
          label: '主题曲',
          itemIds: ['main_1'],
        },
        {
          key: 'intermezzi',
          label: '别传',
          itemIds: ['ss_1'],
        },
        {
          key: 'sideStory',
          label: '故事集',
          itemIds: ['story_set_1'],
        },
      ],
    })
  })

  it('allows forcing tabs on mobile for custom UI strategy', () => {
    const items: TimelineItem[] = [
      createTimelineItem({ id: 'main_1', section: 'mainline', side: 'left' }),
      createTimelineItem({ id: 'ss_1', section: 'mainline', side: 'right' }),
    ]

    expect(
      buildTimelineMobileLayoutPlan(items, 375, {
        forceControl: 'tabs',
      })
    ).toEqual({
      enabled: true,
      control: 'tabs',
      groups: [
        {
          key: 'mainline',
          label: '主题曲',
          itemIds: ['main_1'],
        },
        {
          key: 'intermezzi',
          label: '别传',
          itemIds: ['ss_1'],
        },
      ],
    })
  })

  it('builds ordered non-empty groups only', () => {
    const items: TimelineItem[] = [
      createTimelineItem({ id: 'record_1', section: 'operatorRecord' }),
      createTimelineItem({ id: 'story_set_1', section: 'sideStory' }),
      createTimelineItem({ id: 'main_1', section: 'mainline', side: 'left' }),
    ]

    expect(buildTimelineMobileGroups(items)).toEqual([
      {
        key: 'mainline',
        label: '主题曲',
        itemIds: ['main_1'],
      },
      {
        key: 'sideStory',
        label: '故事集',
        itemIds: ['story_set_1'],
      },
      {
        key: 'operatorRecord',
        label: '干员',
        itemIds: ['record_1'],
      },
    ])
  })
})
