import { describe, expect, it } from 'vitest'

import { LocalFixtureDataSource } from './local-fixture-data-source'

describe('LocalFixtureDataSource', () => {
  it('reads text and json fixtures from memory', async () => {
    const source = new LocalFixtureDataSource({
      'gamedata/story/a.txt': 'hello',
      'gamedata/excel/table.json': '{"name":"amiya"}',
      'gamedata/excel/object.json': { value: 1 },
    })

    await expect(source.getText('gamedata/story/a.txt')).resolves.toBe('hello')
    await expect(source.getJson<{ name: string }>('gamedata/excel/table.json')).resolves.toEqual({
      name: 'amiya',
    })
    await expect(source.getJson<{ value: number }>('gamedata/excel/object.json')).resolves.toEqual({
      value: 1,
    })
  })

  it('returns sorted file list by prefix', async () => {
    const source = new LocalFixtureDataSource({
      'z/path.json': '{}',
      'a/path.json': '{}',
      'a/next.json': '{}',
    })

    await expect(source.listFiles('a/')).resolves.toEqual([
      { path: 'a/next.json' },
      { path: 'a/path.json' },
    ])
  })

  it('provides basic diagnostics for missing and invalid fixtures', async () => {
    const source = new LocalFixtureDataSource({
      'gamedata/excel/bad.json': '{not-json',
    })

    await expect(source.getText('missing/file.txt')).rejects.toThrow(
      'Fixture not found for path "missing/file.txt"'
    )
    await expect(source.getJson('gamedata/excel/bad.json')).rejects.toThrow(
      'Invalid JSON fixture at "gamedata/excel/bad.json"'
    )
  })

  it('returns configured revision metadata', async () => {
    const source = new LocalFixtureDataSource(
      { 'foo.json': '{}' },
      { revision: 'fixture-rev-1', committedAt: '2026-05-10T00:00:00.000Z' }
    )

    await expect(source.getRevision()).resolves.toEqual({
      providerId: 'local-fixture',
      commitSha: 'fixture-rev-1',
      committedAt: '2026-05-10T00:00:00.000Z',
    })
  })
})
