import { describe, expect, it } from 'vitest'

import type { StoryBlock } from './story-block'
import { buildPlainText } from './build-plain-text'

describe('buildPlainText', () => {
  it('formats dialogue, narration, and choice into plain text lines', () => {
    const blocks: StoryBlock[] = [
      { type: 'dialogue', id: 'd1', speaker: '阿米娅', text: '博士，醒醒。' },
      { type: 'narration', id: 'n1', text: '四周一片寂静。' },
      {
        type: 'choice',
        id: 'c1',
        options: ['继续前进', '原地等待'],
      },
    ]

    expect(buildPlainText(blocks)).toBe(
      ['阿米娅：博士，醒醒。', '四周一片寂静。', '[选项] 继续前进 / 原地等待'].join('\n')
    )
  })

  it('ignores non-text blocks and keeps section breaks as empty line', () => {
    const blocks: StoryBlock[] = [
      { type: 'imageCue', id: 'img1', imageId: 'bg_night' },
      { type: 'dialogue', id: 'd1', speaker: '凯尔希', text: '不要分神。' },
      { type: 'sectionBreak', id: 's1', variant: 'scene' },
      {
        type: 'unknownCue',
        id: 'u1',
        prop: 'CustomFx',
        attributes: { value: 1 },
      },
      { type: 'narration', id: 'n1', text: '你点了点头。' },
    ]

    expect(buildPlainText(blocks)).toBe('凯尔希：不要分神。\n\n你点了点头。')
  })

  it('does not mutate input blocks', () => {
    const blocks: StoryBlock[] = [
      { type: 'dialogue', id: 'd1', speaker: '  W  ', text: '  呵。  ' },
      { type: 'choice', id: 'c1', options: [' A ', ' B '] },
    ]
    const snapshot = JSON.parse(JSON.stringify(blocks)) as StoryBlock[]

    buildPlainText(blocks)

    expect(blocks).toEqual(snapshot)
  })
})
