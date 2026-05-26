import { describe, expect, it } from 'vitest'

import type { RawStoryJson } from './raw-models/raw-story-json'
import { normalizeStoryJsonChapter } from './story-json-chapter-normalizer'

describe('normalizeStoryJsonChapter', () => {
  it('normalizes StoryJson chapter metadata and storyList nodes into unified chapter nodes', () => {
    const rawStoryJson: RawStoryJson = {
      lang: 'zh_CN',
      eventid: 'act18d0',
      eventName: '黑暗时代',
      albumKind: 'ACTIVITY',
      storyCode: 'ST-1',
      avgTag: 'before',
      storyName: '黑暗时代 上',
      storyInfo: '测试简介',
      OPTIONTRACE: ['A', 'B'],
      storyList: [
        {
          id: 'n1',
          prop: 'name',
          attributes: {
            name: '阿米娅',
          },
        },
        {
          id: 'n2',
          prop: 'name',
          attributes: {
            name: '阿米娅',
            text: '博士，醒醒。',
          },
        },
        {
          id: 'n3',
          prop: 'Dialog',
        },
        {
          id: 'n4',
          prop: 'Decision',
          attributes: {
            options: '继续前进 / 原地待命',
          },
        },
        {
          id: 'n5',
          prop: 'ShakeScreen',
          attributes: {
            intensity: 2,
          },
        },
        {
          id: 'n6',
          attributes: {
            text: '走廊里很安静。',
          },
        },
      ],
    }

    const normalized = normalizeStoryJsonChapter(rawStoryJson)

    expect(normalized).toMatchObject({
      id: 'storyjson-st-1-before-act18d0',
      locale: 'zh_CN',
      sourceType: 'storyJson',
      albumKind: 'ACTIVITY',
      eventId: 'act18d0',
      eventName: '黑暗时代',
      storyCode: 'ST-1',
      avgTag: 'before',
      title: '黑暗时代 上',
      summary: '测试简介',
      optionTrace: ['A', 'B'],
    })

    expect(normalized.nodes).toEqual([
      {
        id: 'story-node-n1',
        type: 'cue',
        line: 1,
        raw: '{"id":"n1","prop":"name","attributes":{"name":"阿米娅"}}',
        cue: 'name="阿米娅"',
        args: '',
      },
      {
        id: 'story-node-n2',
        type: 'dialogue',
        line: 2,
        raw: '{"id":"n2","prop":"name","attributes":{"name":"阿米娅","text":"博士，醒醒。"}}',
        speaker: '阿米娅',
        text: '博士，醒醒。',
      },
      {
        id: 'story-node-n3',
        type: 'sectionBreak',
        line: 3,
        raw: '{"id":"n3","prop":"Dialog"}',
        variant: 'scene',
      },
      {
        id: 'story-node-n4',
        type: 'choice',
        line: 4,
        raw: '{"id":"n4","prop":"Decision","attributes":{"options":"继续前进 / 原地待命"}}',
        options: ['继续前进', '原地待命'],
      },
      {
        id: 'story-node-n5',
        type: 'unknownCue',
        line: 5,
        raw: '{"id":"n5","prop":"ShakeScreen","attributes":{"intensity":2}}',
        prop: 'ShakeScreen',
        attributes: {
          intensity: '2',
        },
      },
      {
        id: 'story-node-n6',
        type: 'narration',
        line: 6,
        raw: '{"id":"n6","attributes":{"text":"走廊里很安静。"}}',
        text: '走廊里很安静。',
      },
    ])
  })

  it('falls back to safe defaults when chapter fields are missing', () => {
    const normalized = normalizeStoryJsonChapter({})

    expect(normalized).toEqual({
      id: 'storyjson-unknown-chapter',
      locale: 'unknown',
      sourceType: 'storyJson',
      albumKind: undefined,
      eventId: undefined,
      eventName: undefined,
      storyCode: undefined,
      avgTag: undefined,
      title: 'Untitled chapter',
      summary: undefined,
      nodes: [],
      optionTrace: null,
    })
  })

  it('normalizes Decision options from array values', () => {
    const normalized = normalizeStoryJsonChapter({
      storyCode: 'ST-2',
      storyList: [
        {
          id: 42,
          prop: 'Decision',
          attributes: {
            options: [' 同意 ', '拒绝', 3],
          },
        },
      ],
    })

    expect(normalized.nodes).toEqual([
      {
        id: 'story-node-42',
        type: 'choice',
        line: 1,
        raw: '{"id":42,"prop":"Decision","attributes":{"options":[" 同意 ","拒绝",3]}}',
        options: ['同意', '拒绝', '3'],
      },
    ])
  })

  it('uses stable hash fallback for nodes without raw id', () => {
    const normalized = normalizeStoryJsonChapter({
      storyCode: 'ST-3',
      storyList: [
        {
          prop: 'Dialog',
        },
        {
          prop: 'Dialog',
        },
      ],
    })

    const [first, second] = normalized.nodes

    expect(first?.id).toMatch(/^story-node-hash-[a-z0-9]+$/)
    expect(second?.id).toBe(`${first?.id}-2`)
  })
})
