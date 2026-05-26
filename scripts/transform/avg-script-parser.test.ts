import { describe, expect, it } from 'vitest'

import { parseAvgScript } from './avg-script-parser'

describe('parseAvgScript', () => {
  it('returns empty list for empty source', () => {
    expect(parseAvgScript('')).toEqual([])
  })

  it('normalizes line endings and parses blank lines as empty section breaks', () => {
    const nodes = parseAvgScript('\uFEFF第一行\r\n\r\n第二行\r\n')

    expect(nodes).toEqual([
      {
        id: 'line-1',
        type: 'narration',
        line: 1,
        raw: '第一行',
        text: '第一行',
      },
      {
        id: 'line-2',
        type: 'sectionBreak',
        line: 2,
        raw: '',
        variant: 'empty',
      },
      {
        id: 'line-3',
        type: 'narration',
        line: 3,
        raw: '第二行',
        text: '第二行',
      },
    ])
  })

  it('collapses consecutive blank lines into one empty section break', () => {
    const nodes = parseAvgScript('第一段\n\n\n第二段')

    expect(nodes).toEqual([
      {
        id: 'line-1',
        type: 'narration',
        line: 1,
        raw: '第一段',
        text: '第一段',
      },
      {
        id: 'line-2',
        type: 'sectionBreak',
        line: 2,
        raw: '',
        variant: 'empty',
      },
      {
        id: 'line-4',
        type: 'narration',
        line: 4,
        raw: '第二段',
        text: '第二段',
      },
    ])
  })

  it('preserves unknown bracket-prefixed lines as unknown cue blocks', () => {
    const nodes = parseAvgScript('[bgm="boss"]\n这是一段文本\n[stopmusic]')

    expect(nodes).toEqual([
      {
        id: 'line-1',
        type: 'unknownCue',
        line: 1,
        raw: '[bgm="boss"]',
        prop: 'bgm',
        attributes: {
          cue: 'bgm="boss"',
          args: '',
        },
      },
      {
        id: 'line-2',
        type: 'narration',
        line: 2,
        raw: '这是一段文本',
        text: '这是一段文本',
      },
      {
        id: 'line-3',
        type: 'unknownCue',
        line: 3,
        raw: '[stopmusic]',
        prop: 'stopmusic',
        attributes: {
          cue: 'stopmusic',
          args: '',
        },
      },
    ])
  })

  it('recognizes dialogue text after name cue', () => {
    const nodes = parseAvgScript('[name="阿米娅"]\n博士，醒醒。\n[stopmusic]')

    expect(nodes).toEqual([
      {
        id: 'line-1',
        type: 'cue',
        line: 1,
        raw: '[name="阿米娅"]',
        cue: 'name="阿米娅"',
        args: '',
      },
      {
        id: 'line-2',
        type: 'dialogue',
        line: 2,
        raw: '博士，醒醒。',
        speaker: '阿米娅',
        text: '博士，醒醒。',
      },
      {
        id: 'line-3',
        type: 'unknownCue',
        line: 3,
        raw: '[stopmusic]',
        prop: 'stopmusic',
        attributes: {
          cue: 'stopmusic',
          args: '',
        },
      },
    ])
  })

  it('recognizes narration after clearing speaker with empty name cue', () => {
    const nodes = parseAvgScript('[name="阿米娅"]\n博士。\n[name=""]\n罗德岛的走廊很安静。')

    expect(nodes).toEqual([
      {
        id: 'line-1',
        type: 'cue',
        line: 1,
        raw: '[name="阿米娅"]',
        cue: 'name="阿米娅"',
        args: '',
      },
      {
        id: 'line-2',
        type: 'dialogue',
        line: 2,
        raw: '博士。',
        speaker: '阿米娅',
        text: '博士。',
      },
      {
        id: 'line-3',
        type: 'cue',
        line: 3,
        raw: '[name=""]',
        cue: 'name=""',
        args: '',
      },
      {
        id: 'line-4',
        type: 'narration',
        line: 4,
        raw: '罗德岛的走廊很安静。',
        text: '罗德岛的走廊很安静。',
      },
    ])
  })

  it('parses choice options from [选项] cue', () => {
    const nodes = parseAvgScript('[选项] 进攻 / 撤退 / 观察')

    expect(nodes).toEqual([
      {
        id: 'line-1',
        type: 'choice',
        line: 1,
        raw: '[选项] 进攻 / 撤退 / 观察',
        options: ['进攻', '撤退', '观察'],
      },
    ])
  })

  it('parses choice options from Decision cue parameters', () => {
    const nodes = parseAvgScript('[Decision(options="继续前进;原地待命")]')

    expect(nodes).toEqual([
      {
        id: 'line-1',
        type: 'choice',
        line: 1,
        raw: '[Decision(options="继续前进;原地待命")]',
        options: ['继续前进', '原地待命'],
      },
    ])
  })

  it('parses [Dialog] cue as scene section break', () => {
    const nodes = parseAvgScript('前文\n[Dialog]\n后文')

    expect(nodes).toEqual([
      {
        id: 'line-1',
        type: 'narration',
        line: 1,
        raw: '前文',
        text: '前文',
      },
      {
        id: 'line-2',
        type: 'sectionBreak',
        line: 2,
        raw: '[Dialog]',
        variant: 'scene',
      },
      {
        id: 'line-3',
        type: 'narration',
        line: 3,
        raw: '后文',
        text: '后文',
      },
    ])
  })

  it('parses inline name cue text into dialogue blocks', () => {
    const nodes = parseAvgScript(
      '[Character(name="char_130_doberm_ex")]\n[name="杜宾"]  可恶......\n[name="杜宾"]  这里，究竟怎么了？'
    )

    expect(nodes).toEqual([
      {
        id: 'line-1',
        type: 'unknownCue',
        line: 1,
        raw: '[Character(name="char_130_doberm_ex")]',
        prop: 'Character',
        attributes: {
          cue: 'Character(name="char_130_doberm_ex")',
          args: '',
        },
      },
      {
        id: 'line-2',
        type: 'dialogue',
        line: 2,
        raw: '[name="杜宾"]  可恶......',
        speaker: '杜宾',
        text: '可恶......',
      },
      {
        id: 'line-3',
        type: 'dialogue',
        line: 3,
        raw: '[name="杜宾"]  这里，究竟怎么了？',
        speaker: '杜宾',
        text: '这里，究竟怎么了？',
      },
    ])
  })
})
