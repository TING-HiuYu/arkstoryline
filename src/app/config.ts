const DEFAULT_STATIC_DATA_BASE_URL = '/data'

export const STATIC_DATA_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_ARK_DATA_BASE_URL ?? DEFAULT_STATIC_DATA_BASE_URL
)

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '/') {
    return ''
  }
  return trimmed.replace(/\/+$/, '')
}
