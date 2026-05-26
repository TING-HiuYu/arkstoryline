import { describe, expect, it } from 'vitest'

import type { RawStoryJson } from '../../../scripts/transform/raw-models/raw-story-json'
import { normalizeAvgJson } from './normalize-avg-json'

describe('normalizeAvgJson', () => {
  it('normalizes RawStoryJson and reuses avg node normalization output', () => {
    const input: RawStoryJson = {
      lang: 'zh_CN',
      eventid: 'act18d0',
      eventName: '黑暗时代',
      storyCode: 'ST-1',
      avgTag: 'before',
      storyName: '黑暗时代 上',
      storyInfo: '测试简介',
      sourcePath: 'story/obt/main/st_1.json',
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
      ],
    }

    const normalized = normalizeAvgJson(input)

    expect(normalized).toMatchObject({
      id: 'storyjson-st-1-before-act18d0',
      albumId: 'storyjson-album-act18d0',
      locale: 'zh_CN',
      title: '黑暗时代 上',
      subtitle: '黑暗时代',
      sourcePath: 'story/obt/main/st_1.json',
      code: 'ST-1',
      avgTag: 'before',
      summary: '测试简介',
      plainText: '阿米娅：博士，醒醒。',
    })

    expect(normalized.blocks).toEqual([
      {
        type: 'unknownCue',
        id: 'story-node-n1',
        prop: 'name="阿米娅"',
        attributes: {
          args: '',
          line: 1,
        },
      },
      {
        type: 'dialogue',
        id: 'story-node-n2',
        speaker: '阿米娅',
        text: '博士，醒醒。',
      },
    ])
  })

  it('uses stable fallback fields when metadata is missing', () => {
    const normalized = normalizeAvgJson({})

    expect(normalized.id).toBe('storyjson-unknown-chapter')
    expect(normalized.albumId).toBe('storyjson-album-unknown')
    expect(normalized.locale).toBe('unknown')
    expect(normalized.title).toBe('Untitled chapter')
    expect(normalized.sourcePath).toBe('storyjson/storyjson-unknown-chapter.json')
    expect(normalized.blocks).toEqual([])
    expect(normalized.plainText).toBe('')
    expect(normalized.navigation).toEqual({
      previousChapterId: null,
      nextChapterId: null,
    })
  })
})
