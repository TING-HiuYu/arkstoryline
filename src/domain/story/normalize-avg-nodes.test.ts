import { describe, expect, it } from 'vitest'

import type { AvgNode } from '../../../scripts/transform/avg-script-parser'
import type { CitationRef } from '../catalog/citation-ref'
import { normalizeAvgNodes } from './normalize-avg-nodes'

describe('normalizeAvgNodes', () => {
  it('maps avg nodes into story blocks and builds plain text', () => {
    const input: AvgNode[] = [
      {
        type: 'dialogue',
        id: 'line-1',
        line: 1,
        raw: '[name="阿米娅"]',
        speaker: '阿米娅',
        text: '博士，醒醒。',
      },
      {
        type: 'narration',
        id: 'line-2',
        line: 2,
        raw: '四周一片寂静。',
        text: '四周一片寂静。',
      },
      {
        type: 'choice',
        id: 'line-3',
        line: 3,
        raw: '[Decision(options="前进/撤退")]',
        options: ['前进', '撤退'],
      },
      {
        type: 'sectionBreak',
        id: 'line-4',
        line: 4,
        raw: '[Dialog]',
        variant: 'scene',
      },
      {
        type: 'cue',
        id: 'line-5',
        line: 5,
        raw: '[character(1)]',
        cue: 'character(1)',
        args: 'fade=0.5',
      },
      {
        type: 'unknownCue',
        id: 'line-6',
        line: 6,
        raw: '[CustomFx]',
        prop: 'CustomFx',
        attributes: {
          cue: 'CustomFx',
          args: 'value=1',
        },
      },
    ]

    const document = normalizeAvgNodes(input, {
      id: 'chapter-1',
      albumId: 'album-main-01',
      locale: 'zh_CN',
      title: '黑暗时代·上',
      sourcePath: 'gamedata/story/obt/main/level_main_01.txt',
      code: '1-1',
      avgTag: '主线',
      summary: '序章',
    })

    expect(document.id).toBe('chapter-1')
    expect(document.blocks).toHaveLength(6)
    expect(document.blocks[4]).toMatchObject({
      type: 'unknownCue',
      id: 'line-5',
      prop: 'character(1)',
      attributes: {
        args: 'fade=0.5',
        line: 5,
      },
    })
    expect(document.plainText).toBe(
      ['阿米娅：博士，醒醒。', '四周一片寂静。', '[选项] 前进 / 撤退'].join('\n')
    )
  })

  it('fills default navigation and optional arrays when context does not provide them', () => {
    const document = normalizeAvgNodes([], {
      id: 'chapter-2',
      albumId: 'album-main-02',
      locale: 'zh_CN',
      title: '黑暗时代·下',
      sourcePath: 'gamedata/story/obt/main/level_main_02.txt',
    })

    expect(document.navigation).toEqual({
      previousChapterId: null,
      nextChapterId: null,
    })
    expect(document.citations).toEqual([])
  })

  it('copies mutable arrays to avoid side effects', () => {
    const input: AvgNode[] = [
      {
        type: 'choice',
        id: 'line-1',
        line: 1,
        raw: '[Decision(options="A/B")]',
        options: ['A', 'B'],
      },
    ]
    const citations: CitationRef[] = [
      {
        id: 'cite-1',
        referenceId: 'ref-1',
        blockId: 'line-1',
        marker: 1,
      },
    ]
    const document = normalizeAvgNodes(input, {
      id: 'chapter-3',
      albumId: 'album-main-03',
      locale: 'zh_CN',
      title: '测试章节',
      sourcePath: 'gamedata/story/test/chapter_03.txt',
      citations,
    })

    document.citations.push({
      id: 'cite-2',
      referenceId: 'ref-2',
      blockId: 'line-1',
      marker: 2,
    })
    const choiceBlock = document.blocks[0]

    if (choiceBlock.type === 'choice') {
      choiceBlock.options.push('C')
    }

    expect(citations).toHaveLength(1)
    expect((input[0] as Extract<AvgNode, { type: 'choice' }>).options).toEqual(['A', 'B'])
  })
})
