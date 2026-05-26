import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import {
  AboutDataPage,
  DownloadPage,
  HomePage,
  OperatorDetailPage,
  ReaderIndexPage,
  ReaderPage,
  AlbumDetailPage,
  AlbumsIndexPage,
  SearchPage,
} from './AppPages'
import { AppLayout, type AppLayoutBreadcrumbItem } from '../components/layout/app-layout'
import { resolveLocale, type AppLocale } from './i18n'

export { DownloadSelectorPanel } from './AppPages'

type AppPage =
  | 'home'
  | 'albumsIndex'
  | 'albumDetail'
  | 'operatorDetail'
  | 'readerIndex'
  | 'reader'
  | 'download'
  | 'search'
  | 'aboutData'
  | 'placeholder'

interface BreadcrumbRuntimeState {
  albumTitle?: string
  chapterTitle?: string
}

interface RouteLocaleShellProps {
  fallbackLocale: AppLocale
  page: AppPage
}

interface AppRouterProps {
  locale: AppLocale
}

function buildLocaleHomePath(locale: AppLocale): string {
  return `/${locale}`
}

function buildOperatorSectionPath(locale: AppLocale): string {
  return `/${locale}?section=operatorRecord`
}

function buildAlbumPath(locale: AppLocale, albumId: string): string {
  return `/${locale}/albums/${albumId}`
}

function buildBreadcrumbItems(
  locale: AppLocale,
  page: AppPage,
  runtime: BreadcrumbRuntimeState,
  albumId?: string
): AppLayoutBreadcrumbItem[] {
  const homeCrumb: AppLayoutBreadcrumbItem = {
    label: '首页',
    to: buildLocaleHomePath(locale),
  }

  if (page === 'home') {
    return [homeCrumb]
  }

  if (page === 'albumsIndex') {
    return [homeCrumb, { label: '曲谱' }]
  }

  if (page === 'albumDetail') {
    return [homeCrumb, { label: runtime.albumTitle ?? '曲谱详情' }]
  }

  if (page === 'operatorDetail') {
    return [
      homeCrumb,
      {
        label: '干员',
        to: buildOperatorSectionPath(locale),
      },
      { label: runtime.albumTitle ?? '干员详情' },
    ]
  }

  if (page === 'readerIndex') {
    return [homeCrumb, { label: '阅读' }]
  }

  if (page === 'reader') {
    const albumTitle = runtime.albumTitle ?? '曲谱详情'
    const chapterTitle = runtime.chapterTitle ?? '当前章节'
    const albumPath = albumId && runtime.albumTitle ? buildAlbumPath(locale, albumId) : undefined

    return [
      homeCrumb,
      {
        label: albumTitle,
        to: albumPath,
      },
      { label: chapterTitle },
    ]
  }

  if (page === 'download') {
    return [homeCrumb, { label: '下载页' }]
  }

  if (page === 'search') {
    return [homeCrumb, { label: '剧情搜索' }]
  }

  if (page === 'aboutData') {
    return [homeCrumb, { label: '关于数据' }]
  }

  return [homeCrumb, { label: '页面建设中' }]
}

function PlaceholderPage() {
  return (
    <main>
      <h1>页面建设中</h1>
      <p>当前路由尚未实现具体页面内容。</p>
    </main>
  )
}

function RouteLocaleShell({ fallbackLocale, page }: RouteLocaleShellProps) {
  const params = useParams<{ locale?: string; albumId?: string; operatorSlug?: string }>()
  const location = useLocation()
  const locale = resolveLocale(params.locale ?? fallbackLocale)
  const [runtimeBreadcrumbByScope, setRuntimeBreadcrumbByScope] = useState<
    Record<string, BreadcrumbRuntimeState>
  >({})
  const breadcrumbScopeKey = `${page}:${params.albumId ?? params.operatorSlug ?? ''}`
  const runtimeBreadcrumb = runtimeBreadcrumbByScope[breadcrumbScopeKey] ?? {}
  const breadcrumbs = buildBreadcrumbItems(locale, page, runtimeBreadcrumb, params.albumId)

  useEffect(() => {
    if (
      typeof navigator !== 'undefined' &&
      /jsdom/i.test(navigator.userAgent) &&
      !('mock' in window.scrollTo)
    ) {
      return
    }

    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    } catch {
      // jsdom does not implement window.scrollTo.
    }
  }, [location.key, location.pathname])

  const handleAlbumResolved = (albumTitle: string) => {
    setRuntimeBreadcrumbByScope((previous) => {
      const scoped = previous[breadcrumbScopeKey] ?? {}
      if (scoped.albumTitle === albumTitle) {
        return previous
      }

      return {
        ...previous,
        [breadcrumbScopeKey]: {
          ...scoped,
          albumTitle,
        },
      }
    })
  }

  const handleChapterResolved = (chapterTitle: string) => {
    setRuntimeBreadcrumbByScope((previous) => {
      const scoped = previous[breadcrumbScopeKey] ?? {}
      if (scoped.chapterTitle === chapterTitle) {
        return previous
      }

      return {
        ...previous,
        [breadcrumbScopeKey]: {
          ...scoped,
          chapterTitle,
        },
      }
    })
  }

  let content: ReactNode

  if (page === 'home') {
    content = <HomePage locale={locale} />
  } else if (page === 'albumsIndex') {
    content = <AlbumsIndexPage locale={locale} />
  } else if (page === 'albumDetail') {
    content = <AlbumDetailPage locale={locale} onAlbumResolved={handleAlbumResolved} />
  } else if (page === 'operatorDetail') {
    content = <OperatorDetailPage onAlbumResolved={handleAlbumResolved} />
  } else if (page === 'readerIndex') {
    content = <ReaderIndexPage locale={locale} />
  } else if (page === 'reader') {
    content = (
      <ReaderPage
        locale={locale}
        onAlbumResolved={handleAlbumResolved}
        onChapterResolved={handleChapterResolved}
      />
    )
  } else if (page === 'download') {
    content = <DownloadPage locale={locale} />
  } else if (page === 'search') {
    content = <SearchPage locale={locale} />
  } else if (page === 'aboutData') {
    content = <AboutDataPage />
  } else {
    content = <PlaceholderPage />
  }

  return (
    <AppLayout locale={locale} breadcrumbs={breadcrumbs}>
      {content}
    </AppLayout>
  )
}

function LocaleRedirect({ fallbackLocale, target }: { fallbackLocale: AppLocale; target: string }) {
  const location = useLocation()
  return <Navigate replace to={`/${fallbackLocale}${target}${location.search}`} />
}

function LocaleParamRedirect({
  fallbackLocale,
  target,
}: {
  fallbackLocale: AppLocale
  target: string
}) {
  const location = useLocation()
  const params = useParams<Record<string, string | undefined>>()
  const resolvedPath = target.replace(/:([a-zA-Z]+)/g, (_, key: string) => params[key] ?? '')

  return <Navigate replace to={`/${fallbackLocale}${resolvedPath}${location.search}`} />
}

export function AppRouter({ locale }: AppRouterProps) {
  return (
    <Routes>
      <Route path="/" element={<LocaleRedirect fallbackLocale={locale} target="" />} />
      <Route path="/albums" element={<LocaleRedirect fallbackLocale={locale} target="/albums" />} />
      <Route
        path="/albums/:albumId"
        element={<LocaleParamRedirect fallbackLocale={locale} target="/albums/:albumId" />}
      />
      <Route
        path="/operators/:operatorSlug"
        element={<LocaleParamRedirect fallbackLocale={locale} target="/operators/:operatorSlug" />}
      />
      <Route path="/read" element={<LocaleRedirect fallbackLocale={locale} target="/read" />} />
      <Route
        path="/read/:albumId/:chapterId"
        element={<LocaleParamRedirect fallbackLocale={locale} target="/read/:albumId/:chapterId" />}
      />
      <Route
        path="/download"
        element={<LocaleRedirect fallbackLocale={locale} target="/download" />}
      />
      <Route path="/search" element={<LocaleRedirect fallbackLocale={locale} target="/search" />} />
      <Route
        path="/about-data"
        element={<LocaleRedirect fallbackLocale={locale} target="/about-data" />}
      />
      <Route
        path="/placeholder"
        element={<LocaleRedirect fallbackLocale={locale} target="/placeholder" />}
      />

      <Route path="/:locale" element={<RouteLocaleShell fallbackLocale={locale} page="home" />} />
      <Route
        path="/:locale/albums"
        element={<RouteLocaleShell fallbackLocale={locale} page="albumsIndex" />}
      />
      <Route
        path="/:locale/albums/:albumId"
        element={<RouteLocaleShell fallbackLocale={locale} page="albumDetail" />}
      />
      <Route
        path="/:locale/operators/:operatorSlug"
        element={<RouteLocaleShell fallbackLocale={locale} page="operatorDetail" />}
      />
      <Route
        path="/:locale/read"
        element={<RouteLocaleShell fallbackLocale={locale} page="readerIndex" />}
      />
      <Route
        path="/:locale/read/:albumId/:chapterId"
        element={<RouteLocaleShell fallbackLocale={locale} page="reader" />}
      />
      <Route
        path="/:locale/download"
        element={<RouteLocaleShell fallbackLocale={locale} page="download" />}
      />
      <Route
        path="/:locale/search"
        element={<RouteLocaleShell fallbackLocale={locale} page="search" />}
      />
      <Route
        path="/:locale/about-data"
        element={<RouteLocaleShell fallbackLocale={locale} page="aboutData" />}
      />
      <Route
        path="/:locale/placeholder"
        element={<RouteLocaleShell fallbackLocale={locale} page="placeholder" />}
      />
      <Route path="*" element={<Navigate replace to={`/${locale}`} />} />
    </Routes>
  )
}
