import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import sharp from 'sharp'

export type AssetSourceMode = 'disabled' | 'local' | 'remote'

export type AssetSyncStatus = 'ready' | 'missing' | 'disabled'

export interface SyncCoverAssetInput {
  locale: string
  imageId: string
  targetFileName: string
  outputDir: string
}

export interface SyncCoverAssetResult {
  status: AssetSyncStatus
  assetPath?: string
  sourcePath?: string
  width?: number
  height?: number
}

export interface AssetSourceProvider {
  readonly id: string
  readonly label: string
  readonly mode: AssetSourceMode
  syncCoverAsset(input: SyncCoverAssetInput): Promise<SyncCoverAssetResult>
}

export interface LocalAssetSourceProviderOptions {
  roots: string[]
  extensions?: string[]
}

export interface RemoteAssetSourceProviderOptions {
  baseUrls: string[]
  extensions?: string[]
  fetchImpl?: typeof fetch
}

const DEFAULT_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp']
const COVER_OUTPUT_EXTENSION = '.webp'

export class DisabledAssetSourceProvider implements AssetSourceProvider {
  public readonly id = 'asset-source-disabled'
  public readonly label = 'Disabled cover asset source'
  public readonly mode: AssetSourceMode = 'disabled'

  public async syncCoverAsset(_input: SyncCoverAssetInput): Promise<SyncCoverAssetResult> {
    void _input
    return {
      status: 'disabled',
    }
  }
}

export class LocalAssetSourceProvider implements AssetSourceProvider {
  public readonly id = 'asset-source-local'
  public readonly label = 'Local filesystem asset source'
  public readonly mode: AssetSourceMode = 'local'

  private readonly roots: string[]
  private readonly extensions: string[]

  public constructor(options: LocalAssetSourceProviderOptions) {
    this.roots = options.roots.map((root) => resolve(root))
    this.extensions = normalizeExtensions(options.extensions ?? DEFAULT_IMAGE_EXTENSIONS)
  }

  public async syncCoverAsset(input: SyncCoverAssetInput): Promise<SyncCoverAssetResult> {
    const source = await this.findCoverSource(input.imageId)
    if (!source) {
      return {
        status: 'missing',
      }
    }

    const targetDir = join(resolve(input.outputDir), input.locale)
    const targetFileName = `${input.targetFileName}${COVER_OUTPUT_EXTENSION}`
    const targetPath = join(targetDir, targetFileName)
    await mkdir(targetDir, { recursive: true })
    const sourceBuffer = await readFile(source)
    const converted = await convertCoverToWebp(sourceBuffer, targetPath)

    return {
      status: 'ready',
      assetPath: `/assets/covers/${input.locale}/${targetFileName}`,
      sourcePath: source,
      width: converted.width,
      height: converted.height,
    }
  }

  private async findCoverSource(imageId: string): Promise<string | undefined> {
    for (const root of this.roots) {
      for (const extension of this.extensions) {
        const candidate = join(root, `${imageId}${extension}`)

        try {
          await access(candidate)
          return candidate
        } catch {
          continue
        }
      }
    }

    return undefined
  }
}

export class RemoteAssetSourceProvider implements AssetSourceProvider {
  public readonly id = 'asset-source-remote'
  public readonly label = 'Remote mirror asset source'
  public readonly mode: AssetSourceMode = 'remote'

  private readonly baseUrls: string[]
  private readonly extensions: string[]
  private readonly fetchImpl: typeof fetch

  public constructor(options: RemoteAssetSourceProviderOptions) {
    this.baseUrls = options.baseUrls.map((baseUrl) => baseUrl.replace(/\/+$/, '')).filter(Boolean)
    this.extensions = normalizeExtensions(options.extensions ?? DEFAULT_IMAGE_EXTENSIONS)
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  public async syncCoverAsset(input: SyncCoverAssetInput): Promise<SyncCoverAssetResult> {
    for (const baseUrl of this.baseUrls) {
      for (const extension of this.extensions) {
        const sourceUrl = `${baseUrl}/${encodeURIComponent(input.imageId)}${extension}`
        const result = await this.tryFetchCover(input, sourceUrl)
        if (result) {
          return result
        }
      }
    }

    return {
      status: 'missing',
    }
  }

  private async tryFetchCover(
    input: SyncCoverAssetInput,
    sourceUrl: string
  ): Promise<SyncCoverAssetResult | undefined> {
    try {
      const response = await this.fetchImpl(sourceUrl)
      if (!response.ok) {
        return undefined
      }

      const targetDir = join(resolve(input.outputDir), input.locale)
      const targetFileName = `${input.targetFileName}${COVER_OUTPUT_EXTENSION}`
      const targetPath = join(targetDir, targetFileName)
      await mkdir(targetDir, { recursive: true })
      const sourceBuffer = Buffer.from(await response.arrayBuffer())
      const converted = await convertCoverToWebp(sourceBuffer, targetPath)

      return {
        status: 'ready',
        assetPath: `/assets/covers/${input.locale}/${targetFileName}`,
        sourcePath: sourceUrl,
        width: converted.width,
        height: converted.height,
      }
    } catch {
      return undefined
    }
  }
}

async function convertCoverToWebp(
  sourceBuffer: Buffer,
  targetPath: string
): Promise<{ width?: number; height?: number }> {
  const { data, info } = await sharp(sourceBuffer)
    .rotate()
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true })

  await writeFile(targetPath, data)

  return {
    width: info.width,
    height: info.height,
  }
}

export function createAssetSourceProvider(input: {
  mode?: string
  roots?: string[]
  baseUrls?: string[]
}): AssetSourceProvider {
  const normalizedMode = normalizeMode(input.mode)

  if (normalizedMode === 'local') {
    const roots = (input.roots ?? []).map((item) => item.trim()).filter((item) => item.length > 0)
    if (roots.length === 0) {
      return new DisabledAssetSourceProvider()
    }

    return new LocalAssetSourceProvider({ roots })
  }

  if (normalizedMode === 'remote') {
    const baseUrls = (input.baseUrls ?? [])
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
    if (baseUrls.length === 0) {
      return new DisabledAssetSourceProvider()
    }

    return new RemoteAssetSourceProvider({ baseUrls })
  }

  return new DisabledAssetSourceProvider()
}

function normalizeMode(mode: string | undefined): AssetSourceMode {
  if (mode === 'local') {
    return 'local'
  }

  if (mode === 'remote' || mode === 'mirror') {
    return 'remote'
  }

  return 'disabled'
}

function normalizeExtensions(input: string[]): string[] {
  const extensions = new Set<string>()

  for (const value of input) {
    const trimmed = value.trim()
    if (!trimmed) {
      continue
    }

    extensions.add(trimmed.startsWith('.') ? trimmed.toLowerCase() : `.${trimmed.toLowerCase()}`)
  }

  if (extensions.size === 0) {
    return [...DEFAULT_IMAGE_EXTENSIONS]
  }

  return [...extensions]
}
