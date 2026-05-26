import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { FileSystemArkDataCache } from './ark-data-cache'

describe('FileSystemArkDataCache', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(
      tempDirs.map(async (dir) => {
        await rm(dir, { recursive: true, force: true })
      })
    )
    tempDirs.length = 0
  })

  it('creates .cache/ark-data/{locale}/{revision} layout and writes files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ark-cache-'))
    tempDirs.push(root)

    const cache = new FileSystemArkDataCache({ baseDir: root })

    const location = await cache.ensureRevisionDir('zh_CN', 'rev-001')
    expect(location.revisionDir).toBe(join(root, 'zh_CN', 'rev-001'))

    const textPath = await cache.writeText(
      'zh_CN',
      'rev-001',
      'gamedata/excel/story_review_table.json',
      '{"ok":true}'
    )
    expect(textPath).toBe(join(root, 'zh_CN', 'rev-001', 'gamedata/excel/story_review_table.json'))

    await expect(
      readFile(join(root, 'zh_CN', 'rev-001', 'gamedata/excel/story_review_table.json'), 'utf8')
    ).resolves.toBe('{"ok":true}')
  })

  it('writes and reads JSON payloads', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ark-cache-'))
    tempDirs.push(root)

    const cache = new FileSystemArkDataCache({ baseDir: root })

    await cache.writeJson('zh_CN', 'rev-002', 'meta/manifest.json', {
      revision: 'rev-002',
      files: 3,
    })

    await expect(
      cache.readJson<{ revision: string; files: number }>('zh_CN', 'rev-002', 'meta/manifest.json')
    ).resolves.toEqual({ revision: 'rev-002', files: 3 })

    await expect(cache.exists('zh_CN', 'rev-002')).resolves.toBe(true)
    await expect(cache.exists('zh_CN', 'rev-002', 'meta/manifest.json')).resolves.toBe(true)
    await expect(cache.exists('zh_CN', 'rev-002', 'meta/missing.json')).resolves.toBe(false)
  })

  it('rejects invalid locale, revision and path traversal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ark-cache-'))
    tempDirs.push(root)

    const cache = new FileSystemArkDataCache({ baseDir: root })

    expect(() => cache.resolveLocation('', 'rev-001')).toThrow('locale must not be empty')
    expect(() => cache.resolveLocation('zh_CN', '../rev')).toThrow(
      'revision must not contain path separators'
    )

    await expect(cache.writeText('zh_CN', 'rev-001', '../escape.txt', 'bad')).rejects.toThrow(
      'relativePath must stay within revision directory'
    )
  })
})
