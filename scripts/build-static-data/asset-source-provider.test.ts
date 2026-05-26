import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { RemoteAssetSourceProvider, createAssetSourceProvider } from './asset-source-provider'

const TEST_IMAGE_1X1 = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="#fff"/></svg>'
)

describe('createAssetSourceProvider', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.map((directory) => rm(directory, { recursive: true, force: true })))
    tempDirs.length = 0
  })

  it('uses configured local roots and copies cover as ready asset', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ark-asset-provider-'))
    tempDirs.push(root)

    const sourceRoot = join(root, 'cover-source')
    const outputRoot = join(root, 'public-assets/covers')
    const imageId = 'kv_darknights_memoir'

    await mkdir(sourceRoot, { recursive: true })
    await writeFile(join(sourceRoot, `${imageId}.png`), TEST_IMAGE_1X1)

    const provider = createAssetSourceProvider({
      mode: 'local',
      roots: [sourceRoot],
    })

    const result = await provider.syncCoverAsset({
      locale: 'zh_CN',
      imageId,
      targetFileName: 'album_test-cover',
      outputDir: outputRoot,
    })

    expect(provider.mode).toBe('local')
    expect(result.status).toBe('ready')
    expect(result.assetPath).toBe('/assets/covers/zh_CN/album_test-cover.webp')
    expect(result.width).toBe(1)
    expect(result.height).toBe(1)

    const copiedAsset = await readFile(join(outputRoot, 'zh_CN/album_test-cover.webp'))
    expect(copiedAsset.subarray(0, 4).toString('ascii')).toBe('RIFF')
  })

  it('uses configured remote mirrors and writes downloaded covers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ark-asset-provider-'))
    tempDirs.push(root)

    const outputRoot = join(root, 'public-assets/covers')
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === 'https://mirror.example/assets/kv_darknights_memoir.png') {
        return new Response(TEST_IMAGE_1X1)
      }

      return new Response('not found', { status: 404 })
    }) as unknown as typeof fetch

    const provider = new RemoteAssetSourceProvider({
      baseUrls: ['https://mirror.example/assets/'],
      fetchImpl: fetchMock,
    })

    const result = await provider.syncCoverAsset({
      locale: 'zh_CN',
      imageId: 'kv_darknights_memoir',
      targetFileName: 'album_test-cover',
      outputDir: outputRoot,
    })

    expect(provider.mode).toBe('remote')
    expect(result.status).toBe('ready')
    expect(result.assetPath).toBe('/assets/covers/zh_CN/album_test-cover.webp')
    expect(result.sourcePath).toBe('https://mirror.example/assets/kv_darknights_memoir.png')
    expect(result.width).toBe(1)
    expect(result.height).toBe(1)

    const copiedAsset = await readFile(join(outputRoot, 'zh_CN/album_test-cover.webp'))
    expect(copiedAsset.subarray(0, 4).toString('ascii')).toBe('RIFF')
  })

  it('keeps remote mirror failures non-blocking', async () => {
    const provider = new RemoteAssetSourceProvider({
      baseUrls: ['https://mirror.example/assets'],
      fetchImpl: vi.fn(async () => {
        throw new Error('network unavailable')
      }),
    })

    const result = await provider.syncCoverAsset({
      locale: 'zh_CN',
      imageId: 'missing_cover',
      targetFileName: 'missing-cover',
      outputDir: '/tmp/arkstoryline-missing-covers',
    })

    expect(result).toEqual({ status: 'missing' })
  })
})
