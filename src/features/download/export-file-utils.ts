import JSZip from 'jszip'

export function toSafeFileName(value: string): string {
  return (
    value
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[_-]+|[_-]+$/g, '')
      .slice(0, 80) || 'export'
  )
}

export async function buildZipArtifact(input: {
  fileName: string
  entries: Array<{ path: string; content: Uint8Array | string }>
}): Promise<Uint8Array> {
  const zip = new JSZip()

  for (const entry of input.entries) {
    zip.file(entry.path, entry.content)
  }

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

export function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}
