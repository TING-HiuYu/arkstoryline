export const ENABLED_LOCALES = ['zh_CN'] as const

export type AppLocale = (typeof ENABLED_LOCALES)[number]

export const DEFAULT_LOCALE: AppLocale = 'zh_CN'

export function isAppLocale(value: string): value is AppLocale {
  return ENABLED_LOCALES.includes(value as AppLocale)
}

export function resolveLocale(value: string | null | undefined): AppLocale {
  if (!value) {
    return DEFAULT_LOCALE
  }

  return isAppLocale(value) ? value : DEFAULT_LOCALE
}

export function detectLocaleFromPath(pathname: string): AppLocale {
  const firstSegment = pathname.split('/').filter(Boolean)[0]
  return resolveLocale(firstSegment)
}
