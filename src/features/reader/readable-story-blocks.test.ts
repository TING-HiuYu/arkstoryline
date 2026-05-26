import { describe, expect, it } from 'vitest'

import { getReadableStoryBlocks } from './readable-story-blocks'

describe('getReadableStoryBlocks', () => {
  it('filters unknownCue blocks and keeps readable blocks in order', () => {
    const result = getReadableStoryBlocks([
      {
        type: 'unknownCue',
        id: 'u1',
        prop: 'Character',
        attributes: { cue: 'Character' },
      },
      {
        type: 'dialogue',
        id: 'd1',
        speaker: '博士',
        text: '阿米娅，汇报情况。',
      },
      {
        type: 'narration',
        id: 'n1',
        text: '夜色压在切尔诺伯格上空。',
      },
      {
        type: 'narration',
        id: 'legacy-cue-1',
        text: '[Dialog]',
      },
      {
        type: 'narration',
        id: 'legacy-cue-2',
        text: '[gridbg]',
      },
      {
        type: 'unknownCue',
        id: 'u2',
        prop: 'Blocker',
        attributes: { cue: 'Blocker(a=1)' },
      },
    ])

    expect(result.hiddenUnknownCueCount).toBe(4)
    expect(result.blocks).toEqual([
      {
        type: 'dialogue',
        id: 'd1',
        speaker: '博士',
        text: '阿米娅，汇报情况。',
      },
      {
        type: 'narration',
        id: 'n1',
        text: '夜色压在切尔诺伯格上空。',
      },
    ])
  })
})
