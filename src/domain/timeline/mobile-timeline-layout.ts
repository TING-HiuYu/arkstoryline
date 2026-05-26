import type { TimelineItem } from './timeline-item'

export type TimelineMobileControl = 'segmented' | 'tabs'

export type TimelineMobileGroupKey =
  | 'mainline'
  | 'intermezzi'
  | 'sideStory'
  | 'operatorRecord'
  | 'other'

export interface TimelineMobileGroup {
  key: TimelineMobileGroupKey
  label: string
  itemIds: string[]
}

export interface TimelineMobileLayoutPlan {
  enabled: boolean
  control: TimelineMobileControl
  groups: TimelineMobileGroup[]
}

export interface TimelineMobileLayoutOptions {
  mobileBreakpoint?: number
  forceControl?: TimelineMobileControl
}

const DEFAULT_MOBILE_BREAKPOINT = 768

const GROUP_ORDER: TimelineMobileGroupKey[] = [
  'mainline',
  'intermezzi',
  'sideStory',
  'operatorRecord',
  'other',
]

const GROUP_LABEL: Record<TimelineMobileGroupKey, string> = {
  mainline: '主题曲',
  intermezzi: '别传',
  sideStory: '故事集',
  operatorRecord: '干员',
  other: '其他',
}

export function buildTimelineMobileLayoutPlan(
  items: TimelineItem[],
  viewportWidth: number,
  options: TimelineMobileLayoutOptions = {}
): TimelineMobileLayoutPlan {
  const mobileBreakpoint = options.mobileBreakpoint ?? DEFAULT_MOBILE_BREAKPOINT
  const groups = buildTimelineMobileGroups(items)
  const isMobileViewport = viewportWidth < mobileBreakpoint

  if (!isMobileViewport || groups.length <= 1) {
    return {
      enabled: false,
      control: options.forceControl ?? 'tabs',
      groups,
    }
  }

  return {
    enabled: true,
    control: options.forceControl ?? inferControl(groups),
    groups,
  }
}

export function buildTimelineMobileGroups(items: TimelineItem[]): TimelineMobileGroup[] {
  const itemIdsByGroup = new Map<TimelineMobileGroupKey, string[]>()

  for (const item of items) {
    const key = resolveGroupKey(item)
    const itemIds = itemIdsByGroup.get(key) ?? []
    itemIds.push(item.id)
    itemIdsByGroup.set(key, itemIds)
  }

  return GROUP_ORDER.flatMap((groupKey) => {
    const itemIds = itemIdsByGroup.get(groupKey)

    if (!itemIds || itemIds.length === 0) {
      return []
    }

    return [
      {
        key: groupKey,
        label: GROUP_LABEL[groupKey],
        itemIds,
      },
    ]
  })
}

function inferControl(groups: TimelineMobileGroup[]): TimelineMobileControl {
  if (groups.length === 2 && groups[0]?.key === 'mainline' && groups[1]?.key === 'intermezzi') {
    return 'segmented'
  }

  return 'tabs'
}

function resolveGroupKey(item: TimelineItem): TimelineMobileGroupKey {
  if (item.section === 'mainline') {
    if (item.side === 'left') {
      return 'mainline'
    }

    if (item.side === 'right') {
      return 'intermezzi'
    }
  }

  if (item.section === 'sideStory') {
    return 'sideStory'
  }

  if (item.section === 'operatorRecord') {
    return 'operatorRecord'
  }

  return 'other'
}
