import { describe, expect, it, vi } from 'vitest'

import { GitHubRawDataSource } from './github-raw-data-source'

describe('GitHubRawDataSource', () => {
  it('reads text and json content from github raw endpoints', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url === 'https://raw.githubusercontent.com/octo/repo/main/zh_CN/gamedata/story/a.txt') {
        return new Response('hello world', { status: 200 })
      }

      if (
        url ===
        'https://raw.githubusercontent.com/octo/repo/main/zh_CN/gamedata/excel/story_review_table.json'
      ) {
        return new Response('{"name":"amiya"}', { status: 200 })
      }

      return new Response('not found', { status: 404, statusText: 'Not Found' })
    })

    const source = new GitHubRawDataSource({
      owner: 'octo',
      repo: 'repo',
      ref: 'main',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    await expect(source.getText('zh_CN/gamedata/story/a.txt')).resolves.toBe('hello world')
    await expect(
      source.getJson<{ name: string }>('zh_CN/gamedata/excel/story_review_table.json')
    ).resolves.toEqual({ name: 'amiya' })
  })

  it('returns revision metadata and list files with prefix', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)

      if (url === 'https://api.github.com/repos/octo/repo/commits/main') {
        return new Response(
          JSON.stringify({
            sha: 'abcdef1234',
            commit: {
              committer: {
                date: '2026-05-10T08:30:00.000Z',
              },
            },
          }),
          { status: 200 }
        )
      }

      if (url === 'https://api.github.com/repos/octo/repo/git/trees/abcdef1234?recursive=1') {
        return new Response(
          JSON.stringify({
            tree: [
              {
                path: 'zh_CN/gamedata/excel/chapter_table.json',
                type: 'blob',
                sha: '1',
                size: 100,
              },
              {
                path: 'zh_CN/gamedata/excel/story_review_table.json',
                type: 'blob',
                sha: '2',
                size: 200,
              },
              {
                path: 'zh_CN/gamedata/story',
                type: 'tree',
              },
              {
                path: 'en_US/gamedata/excel/chapter_table.json',
                type: 'blob',
                sha: '3',
                size: 120,
              },
            ],
          }),
          { status: 200 }
        )
      }

      return new Response('not found', { status: 404, statusText: 'Not Found' })
    })

    const source = new GitHubRawDataSource({
      owner: 'octo',
      repo: 'repo',
      ref: 'main',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    await expect(source.getRevision()).resolves.toEqual({
      providerId: 'github-raw',
      commitSha: 'abcdef1234',
      committedAt: '2026-05-10T08:30:00.000Z',
    })

    await expect(source.listFiles('zh_CN/gamedata/excel')).resolves.toEqual([
      {
        path: 'zh_CN/gamedata/excel/chapter_table.json',
        sha: '1',
        size: 100,
      },
      {
        path: 'zh_CN/gamedata/excel/story_review_table.json',
        sha: '2',
        size: 200,
      },
    ])
  })

  it('provides diagnostics for invalid JSON and empty paths', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response('invalid-json', { status: 200 })
    })

    const source = new GitHubRawDataSource({
      owner: 'octo',
      repo: 'repo',
      ref: 'main',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    await expect(source.getJson('zh_CN/gamedata/excel/table.json')).rejects.toThrow(
      'Invalid JSON at "zh_CN/gamedata/excel/table.json"'
    )
    await expect(source.getText('')).rejects.toThrow('"path" must not be empty')
  })
})
