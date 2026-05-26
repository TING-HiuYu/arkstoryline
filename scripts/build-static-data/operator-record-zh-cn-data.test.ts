import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('zh_CN operatorRecord data snapshot', () => {
  it('has operatorRecord albums greater than zero in real zh_CN catalog', async () => {
    const catalogPath = join(process.cwd(), 'public/data/zh_CN/catalog.json')
    const rawCatalog = await readFile(catalogPath, 'utf8')
    const catalog = JSON.parse(rawCatalog) as {
      albums?: Array<{ albumKind?: string }>
    }

    const operatorRecordCount = (catalog.albums ?? []).filter(
      (album) => album.albumKind === 'operatorRecord'
    ).length

    expect(operatorRecordCount).toBeGreaterThan(0)
  })
})
