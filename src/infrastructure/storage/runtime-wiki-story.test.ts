import { describe, expect, it } from 'vitest'
import {
  loadRuntimeWikiStoryPage,
  normalizeWikiPageTitle,
  parseRuntimeWikiTextlog,
} from './runtime-wiki-story'

describe('runtime wiki story safety', () => {
  it('throws on empty runtime wiki page title instead of using a demo fallback', () => {
    expect(() => normalizeWikiPageTitle('   ')).toThrow(/cannot be empty/)
  })

  it('keeps only trusted media URLs or safe relative paths in parsed runtime resources', () => {
    const textlog = [
      '[Background(image="safe_relative")]',
      '[Image(image="safe_media")]',
      '[Image(image="evil_http")]',
      '[Image(image="localhost")]',
      '[Image(image="script")]',
      '[Image(image="data_uri")]',
      '[Image(image="traversal")]',
    ].join('\n')

    const blocks = parseRuntimeWikiTextlog(textlog, {
      safe_relative: '/assets/storyline/bg.png',
      safe_media: 'https://media.prts.wiki/images/bg.png',
      evil_http: 'https://evil.example/images/bg.png',
      localhost: 'http://localhost:3000/bg.png',
      script: 'javascript:alert(1)',
      data_uri: 'data:image/svg+xml,<svg />',
      traversal: '../private/bg.png',
    })

    expect(blocks.map((block) => (block.type === 'image' ? block.url : undefined))).toEqual([
      '/assets/storyline/bg.png',
      'https://media.prts.wiki/images/bg.png',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ])
  })

  it('keeps runtime interaction cues that affect reading flow', () => {
    const blocks = parseRuntimeWikiTextlog(
      [
        '[name="模糊的声音"]又让你受苦了。',
        '[Dialog]',
        '[name=""]  600小时前',
        '[StartBattle(stageId="guide/level_guide_1")]',
        '[Tutorial(waitForSignal="battle_start")]',
        '[Decision(options="继续前进;原地待命", values="1;2")]',
        '[Predicate(references="1")]',
        '[name="阿米娅"]第一条分支。',
        '[Predicate(references="2")]',
        '[name="阿米娅"]第二条分支。',
        '[Predicate(references="1;2")]',
        '[name="阿米娅"]共同后续。',
      ].join('\n'),
      {}
    )

    expect(blocks).toContainEqual(
      expect.objectContaining({
        type: 'narration',
        text: '600小时前',
      })
    )
    expect(blocks).toContainEqual(
      expect.objectContaining({
        type: 'interaction',
        command: 'StartBattle',
        label: '进入战斗：guide/level_guide_1',
      })
    )
    expect(blocks).toContainEqual(
      expect.objectContaining({
        type: 'interaction',
        command: 'Tutorial',
        label: '教程提示：battle_start',
      })
    )
    const choice = blocks.find((block) => block.type === 'choice')

    expect(choice).toMatchObject({
      type: 'choice',
      options: ['继续前进', '原地待命'],
      values: ['1', '2'],
    })
    expect(choice?.type === 'choice' ? choice.branches : undefined).toEqual([
      expect.objectContaining({
        predicate: '1',
        references: ['1'],
        blocks: [
          expect.objectContaining({ type: 'dialogue', text: '第一条分支。' }),
          expect.objectContaining({ type: 'dialogue', text: '共同后续。' }),
        ],
      }),
      expect.objectContaining({
        predicate: '2',
        references: ['2'],
        blocks: [
          expect.objectContaining({ type: 'dialogue', text: '第二条分支。' }),
          expect.objectContaining({ type: 'dialogue', text: '共同后续。' }),
        ],
      }),
    ])
    expect(blocks).not.toContainEqual(expect.objectContaining({ text: '第一条分支。' }))
    expect(blocks).not.toContainEqual(expect.objectContaining({ text: '第二条分支。' }))
    const includesPredicateInteraction = blocks.some(
      (block) => block.type === 'interaction' && block.command === 'Predicate'
    )
    expect(includesPredicateInteraction).toBe(false)
  })

  it('requests the mobile wiki API directly to avoid mobile user-agent redirects', async () => {
    let requestedUrl = ''
    const fetchImpl = (async (url: RequestInfo | URL) => {
      requestedUrl = String(url)
      return new Response(
        JSON.stringify({
          parse: {
            title: '1-1 孤岛/BEG',
            text: {
              '*': '<pre id="datas_txt">[name="阿米娅"]博士，醒一醒。</pre><pre id="datas_back"></pre>',
            },
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    }) as typeof fetch

    const page = await loadRuntimeWikiStoryPage('1-1 孤岛/BEG', fetchImpl)

    expect(new URL(requestedUrl).hostname).toBe('m.prts.wiki')
    expect(page.blocks[0]).toMatchObject({
      type: 'dialogue',
      speaker: '阿米娅',
      text: '博士，醒一醒。',
    })
  })
})
