import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

loadEnvFiles()

export const SCRIPT_CONFIG = {
  locale: envString('ARK_LOCALE', 'zh_CN'),
  dataDir: envString('ARK_DATA_DIR', 'public/data'),
  arkDataCacheDir: envString('ARK_DATA_CACHE_DIR', '.cache/ark-data'),
}

function loadEnvFiles(): void {
  for (const envPath of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '.env.local')]) {
    if (!existsSync(envPath)) {
      continue
    }

    for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#') || !line.includes('=')) {
        continue
      }

      const [key, ...valueParts] = line.split('=')
      const value = valueParts
        .join('=')
        .trim()
        .replace(/^['"]|['"]$/g, '')
      process.env[key!.trim()] ??= value
    }
  }
}

function envString(name: string, fallback: string): string {
  const value = process.env[name]
  return value && value.trim().length > 0 ? value : fallback
}
