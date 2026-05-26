import { describe, expect, it } from 'vitest'

import type { DataSourceProvider, SourceRevision } from './data-source-provider'
import { resolveRemoteSourceRevision, resolveSourceRevision } from './source-revision'

function createSource(id: string, revisionOrError: SourceRevision | Error): DataSourceProvider {
  return {
    id,
    label: id,
    async getText(): Promise<string> {
      return ''
    },
    async getJson<T>(): Promise<T> {
      return {} as T
    },
    async getRevision(): Promise<SourceRevision> {
      if (revisionOrError instanceof Error) {
        throw revisionOrError
      }

      return revisionOrError
    },
  }
}

describe('resolveSourceRevision', () => {
  it('resolves and normalizes revision fields from provider', async () => {
    const source = createSource('github-raw', {
      providerId: ' github-raw ',
      commitSha: ' a1b2c3d4 ',
      committedAt: '2026-05-10T12:00:00.000Z',
    })

    await expect(resolveSourceRevision(source)).resolves.toEqual({
      providerId: 'github-raw',
      commitSha: 'a1b2c3d4',
      committedAt: '2026-05-10T12:00:00.000Z',
    })
  })

  it('fails when provider returns empty commit sha', async () => {
    const source = createSource('story-json', {
      providerId: 'story-json',
      commitSha: ' ',
    })

    await expect(resolveSourceRevision(source)).rejects.toThrow('returned empty "commitSha"')
  })

  it('wraps provider errors with source context', async () => {
    const source = createSource('github-raw', new Error('HTTP 403 Forbidden'))

    await expect(resolveSourceRevision(source)).rejects.toThrow(
      'Failed to resolve revision from provider "github-raw": HTTP 403 Forbidden'
    )
  })
})

describe('resolveRemoteSourceRevision', () => {
  it('accepts git commit sha for remote sources', async () => {
    const source = createSource('github-raw', {
      providerId: 'github-raw',
      commitSha: '8f3a6c2d1beef09',
    })

    await expect(resolveRemoteSourceRevision(source)).resolves.toEqual({
      providerId: 'github-raw',
      commitSha: '8f3a6c2d1beef09',
    })
  })

  it('rejects non-git sha values for remote sources', async () => {
    const source = createSource('github-raw', {
      providerId: 'github-raw',
      commitSha: 'revision-main',
    })

    await expect(resolveRemoteSourceRevision(source)).rejects.toThrow(
      'returned non-git commit sha: "revision-main"'
    )
  })
})
