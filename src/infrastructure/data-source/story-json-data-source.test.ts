import { describe, expect, it, vi } from 'vitest'

import { StoryJsonDataSource } from './story-json-data-source'

describe('StoryJsonDataSource', () => {
  it('reads text and json from default story json repository', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)

      if (
        url ===
        'https://raw.githubusercontent.com/050644zf/ArknightsStoryJson/main/zh_CN/gamedata/story/story1.json'
      ) {
        return new Response('{"name":"amiya"}', { status: 200 })
      }

      if (url === 'https://raw.githubusercontent.com/050644zf/ArknightsStoryJson/main/README.md') {
        return new Response('story json source', { status: 200 })
      }

      if (url === 'https://api.github.com/repos/050644zf/ArknightsStoryJson/commits/main') {
        return new Response(
          JSON.stringify({
            sha: 'story-json-sha',
            commit: {
              committer: {
                date: '2026-05-10T10:00:00.000Z',
              },
            },
          }),
          { status: 200 }
        )
      }

      return new Response('not found', { status: 404, statusText: 'Not Found' })
    })

    const source = new StoryJsonDataSource({
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    await expect(source.getText('README.md')).resolves.toBe('story json source')
    await expect(
      source.getJson<{ name: string }>('zh_CN/gamedata/story/story1.json')
    ).resolves.toEqual({ name: 'amiya' })
    await expect(source.getRevision()).resolves.toEqual({
      providerId: 'story-json',
      commitSha: 'story-json-sha',
      committedAt: '2026-05-10T10:00:00.000Z',
    })
  })

  it('lists files with prefix and keeps provider id stable', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)

      if (url === 'https://api.github.com/repos/050644zf/ArknightsStoryJson/commits/main') {
        return new Response(
          JSON.stringify({
            sha: 'story-json-sha-2',
          }),
          { status: 200 }
        )
      }

      if (
        url ===
        'https://api.github.com/repos/050644zf/ArknightsStoryJson/git/trees/story-json-sha-2?recursive=1'
      ) {
        return new Response(
          JSON.stringify({
            tree: [
              {
                path: 'zh_CN/gamedata/story/a.json',
                type: 'blob',
                sha: '1',
                size: 10,
              },
              {
                path: 'zh_CN/gamedata/story/b.json',
                type: 'blob',
                sha: '2',
                size: 20,
              },
              {
                path: 'zh_CN/gamedata/excel/story_review_table.json',
                type: 'blob',
                sha: '3',
                size: 30,
              },
            ],
          }),
          { status: 200 }
        )
      }

      return new Response('not found', { status: 404, statusText: 'Not Found' })
    })

    const source = new StoryJsonDataSource({
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    await expect(source.listFiles('zh_CN/gamedata/story')).resolves.toEqual([
      {
        path: 'zh_CN/gamedata/story/a.json',
        sha: '1',
        size: 10,
      },
      {
        path: 'zh_CN/gamedata/story/b.json',
        sha: '2',
        size: 20,
      },
    ])

    await expect(source.getRevision()).resolves.toEqual({
      providerId: 'story-json',
      commitSha: 'story-json-sha-2',
      committedAt: undefined,
    })
  })

  it('supports overriding owner/repo/ref', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)

      if (url === 'https://raw.githubusercontent.com/custom-owner/custom-repo/dev/path/file.txt') {
        return new Response('ok', { status: 200 })
      }

      return new Response('not found', { status: 404, statusText: 'Not Found' })
    })

    const source = new StoryJsonDataSource({
      owner: 'custom-owner',
      repo: 'custom-repo',
      ref: 'dev',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    await expect(source.getText('path/file.txt')).resolves.toBe('ok')
    expect(source.label).toContain('custom-owner/custom-repo@dev')
  })
})
