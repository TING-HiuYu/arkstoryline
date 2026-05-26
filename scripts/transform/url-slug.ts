export type UrlSlugSource = 'title' | 'stable-id' | 'fallback'

export type UrlSlugFallbackReason =
  | 'title-unusable'
  | 'title-and-stable-id-unusable'
  | 'all-inputs-unusable'

export interface BuildUrlSlugInput {
  title: string
  stableId: string
  fallbackSlug?: string
  maxLength?: number
}

export interface BuildUrlSlugResult {
  slug: string
  source: UrlSlugSource
  reason?: UrlSlugFallbackReason
}

const DEFAULT_FALLBACK_SLUG = 'album-unknown'
const DEFAULT_MAX_LENGTH = 80

export function buildUrlSlug(input: BuildUrlSlugInput): BuildUrlSlugResult {
  const maxLength = toSlugMaxLength(input.maxLength)
  const normalizedTitle = slugSegment(input.title, maxLength)

  if (normalizedTitle.length > 0) {
    return {
      slug: normalizedTitle,
      source: 'title',
    }
  }

  const normalizedStableId = slugSegment(input.stableId, maxLength)

  if (normalizedStableId.length > 0) {
    return {
      slug: normalizedStableId,
      source: 'stable-id',
      reason: 'title-unusable',
    }
  }

  const normalizedFallback = slugSegment(input.fallbackSlug ?? DEFAULT_FALLBACK_SLUG, maxLength)

  if (normalizedFallback.length > 0) {
    return {
      slug: normalizedFallback,
      source: 'fallback',
      reason: 'title-and-stable-id-unusable',
    }
  }

  return {
    slug: DEFAULT_FALLBACK_SLUG,
    source: 'fallback',
    reason: 'all-inputs-unusable',
  }
}

function slugSegment(value: string, maxLength: number): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '')
}

function toSlugMaxLength(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) {
    return DEFAULT_MAX_LENGTH
  }

  const normalized = Math.floor(value)

  if (normalized <= 0) {
    return DEFAULT_MAX_LENGTH
  }

  return normalized
}
