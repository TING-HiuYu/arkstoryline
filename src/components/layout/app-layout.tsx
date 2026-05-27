import { useQuery } from '@tanstack/react-query'
import {
  CopyrightOutlined,
  DownloadOutlined,
  SearchOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Breadcrumb, Button, Input, Layout, Modal, Popover, Select, Space, Typography } from 'antd'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type PropsWithChildren,
  type RefObject,
} from 'react'
import { SettingsControls } from '../../features/settings/settings-controls'
import type { SearchResultItem } from '../../features/search/search-service'
import { getSharedSearchService } from '../../features/search/shared-search-service'
import { useAppSettingsStore } from '../../infrastructure/storage/use-app-settings-store'
import type { AppLocale } from '../../app/i18n'
import { HeaderDownloadActionContext, type HeaderDownloadAction } from './header-download-action'

export interface AppLayoutBreadcrumbItem {
  label: string
  to?: string
}

interface AppLayoutProps extends PropsWithChildren {
  locale: string
  breadcrumbs: AppLayoutBreadcrumbItem[]
}

type HeaderSectionKey =
  | 'mainline'
  | 'sideStory'
  | 'otherStory'
  | 'operatorRecord'
  | 'terraHistoricus'

function buildSectionPath(locale: string, section: HeaderSectionKey) {
  if (section === 'mainline') {
    return `/${locale}`
  }

  return `/${locale}?section=${section}`
}

function buildSearchPath(locale: string, keyword: string): string {
  const trimmed = keyword.trim()

  if (trimmed.length === 0) {
    return `/${locale}/search`
  }

  const params = new URLSearchParams()
  params.set('q', trimmed)
  return `/${locale}/search?${params.toString()}`
}

function toSearchPreviewKindLabel(kind: SearchResultItem['kind']): string {
  if (kind === 'album') {
    return '曲谱'
  }

  if (kind === 'chapter' || kind === 'stage') {
    return '章节'
  }

  if (kind === 'operator') {
    return '干员'
  }

  if (kind === 'module') {
    return '模组'
  }

  if (kind === 'confidential') {
    return '秘录'
  }

  return '结果'
}

function compactSearchPreviewResults(
  results: SearchResultItem[],
  limit: number
): SearchResultItem[] {
  const albumHitIds = new Set(
    results.filter((result) => result.kind === 'album').map((result) => result.albumId)
  )
  const usedIds = new Set<string>()
  const previewItems: SearchResultItem[] = []

  for (const result of results) {
    if (result.kind !== 'album' && albumHitIds.has(result.albumId)) {
      continue
    }

    if (usedIds.has(result.id)) {
      continue
    }

    usedIds.add(result.id)
    previewItems.push(result)

    if (previewItems.length >= limit) {
      break
    }
  }

  return previewItems
}

export function AppLayout({ locale, breadcrumbs, children }: AppLayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const searchShellRef = useRef<HTMLDivElement>(null)
  const doctorName = useAppSettingsStore((state) => state.doctorName)
  const setDoctorName = useAppSettingsStore((state) => state.setDoctorName)
  const [doctorNameDraft, setDoctorNameDraft] = useState('')
  const [searchDraftState, setSearchDraftState] = useState({ locationKey: '', value: '' })
  const [isSearchPreviewOpen, setIsSearchPreviewOpen] = useState(false)
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false)
  const [isMobileSettingsOpen, setIsMobileSettingsOpen] = useState(false)
  const [headerDownloadAction, setHeaderDownloadAction] = useState<HeaderDownloadAction>(null)
  const mobileSearchShellRef = useRef<HTMLDivElement>(null)
  const searchService = useMemo(() => getSharedSearchService(), [])
  const currentSearchDraftLocationKey = `${locale}:${location.key}`
  const searchDraft =
    searchDraftState.locationKey === currentSearchDraftLocationKey ? searchDraftState.value : ''
  const trimmedSearchDraft = searchDraft.trim()
  const deferredSearchDraft = useDeferredValue(trimmedSearchDraft)
  const canSubmitSearch = trimmedSearchDraft.length > 0
  const searchPreviewQuery = useQuery({
    queryKey: ['header-search-preview', locale, deferredSearchDraft],
    enabled: deferredSearchDraft.length > 0,
    queryFn: async () => {
      const results = await searchService.search(locale as AppLocale, deferredSearchDraft)
      return compactSearchPreviewResults(results, 3)
    },
  })
  const previewResults = searchPreviewQuery.data ?? []
  const registerHeaderDownloadAction = useCallback((action: HeaderDownloadAction) => {
    setHeaderDownloadAction(() => action)
  }, [])

  const saveDoctorName = () => {
    setDoctorName(doctorNameDraft.trim())
  }

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!canSubmitSearch) {
      return
    }

    setIsMobileSearchOpen(false)
    navigate(buildSearchPath(locale, searchDraft))
  }

  const navigateToSearch = () => {
    if (!canSubmitSearch) {
      return
    }

    setIsMobileSearchOpen(false)
    navigate(buildSearchPath(locale, searchDraft))
  }

  const handleSearchShellBlur =
    (shellRef: RefObject<HTMLDivElement | null>) => (event: FocusEvent<HTMLDivElement>) => {
      const nextFocusedNode = event.relatedTarget

      if (nextFocusedNode && shellRef.current?.contains(nextFocusedNode)) {
        return
      }

      setIsSearchPreviewOpen(false)
    }

  const searchParams = new URLSearchParams(location.search)
  const activeSection = searchParams.get('section')

  const sectionItems: Array<{
    key: HeaderSectionKey
    label: string
  }> = [
    { key: 'mainline', label: '主题曲' },
    { key: 'sideStory', label: 'SideStory' },
    { key: 'otherStory', label: '附加档案' },
    { key: 'operatorRecord', label: '干员' },
    { key: 'terraHistoricus', label: '泰拉记事社' },
  ]

  const selectedSection: HeaderSectionKey =
    location.pathname === `/${locale}` && activeSection
      ? activeSection === 'intermezzi' || activeSection === 'sideStory'
        ? 'sideStory'
        : activeSection === 'mainline' ||
            activeSection === 'sideStory' ||
            activeSection === 'otherStory' ||
            activeSection === 'operatorRecord' ||
            activeSection === 'terraHistoricus'
          ? activeSection
          : 'mainline'
      : 'mainline'
  const shouldHighlightSection = location.pathname === `/${locale}`

  const searchPreview = canSubmitSearch && isSearchPreviewOpen && (
    <div className="app-search-preview" role="listbox" aria-label="搜索预览">
      {previewResults.length > 0 ? (
        previewResults.map((previewResult, index) => (
          <Link
            className="app-search-preview__item app-search-preview__item--best"
            key={previewResult.id}
            to={previewResult.targetPath}
            onClick={() => {
              setIsMobileSearchOpen(false)
              setIsSearchPreviewOpen(false)
            }}
          >
            <span className="app-search-preview__meta">
              {index === 0 ? '最佳匹配' : `匹配 ${index + 1}`} ·{' '}
              {toSearchPreviewKindLabel(previewResult.kind)}
            </span>
            <span className="app-search-preview__title">{previewResult.title}</span>
            <span className="app-search-preview__secondary">
              {previewResult.secondary ?? previewResult.albumTitle}
            </span>
          </Link>
        ))
      ) : (
        <span className="app-search-preview__item app-search-preview__item--empty">
          <span className="app-search-preview__meta">
            {searchPreviewQuery.isLoading ? '正在匹配' : '暂无直接匹配'}
          </span>
          <span className="app-search-preview__title">{trimmedSearchDraft}</span>
        </span>
      )}

      <Link
        className="app-search-preview__more"
        to={buildSearchPath(locale, searchDraft)}
        onClick={() => {
          setIsMobileSearchOpen(false)
          setIsSearchPreviewOpen(false)
        }}
      >
        点击查看更多结果
      </Link>
    </div>
  )

  const renderSearchShell = (className: string, shellRef: RefObject<HTMLDivElement | null>) => (
    <div className={className} ref={shellRef} onBlur={handleSearchShellBlur(shellRef)}>
      <form className="app-search" role="search" onSubmit={submitSearch}>
        <svg className="app-search__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="m21 21-4.3-4.3m1.3-5.2a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />
        </svg>
        <Input
          aria-label="header-content-search"
          className="app-search__input"
          placeholder="搜索曲谱、章节、干员或模组"
          type="search"
          variant="borderless"
          allowClear
          value={searchDraft}
          onFocus={() => setIsSearchPreviewOpen(true)}
          onChange={(event) => {
            setSearchDraftState({
              locationKey: currentSearchDraftLocationKey,
              value: event.target.value,
            })
            setIsSearchPreviewOpen(true)
          }}
          onPressEnter={navigateToSearch}
        />
        {canSubmitSearch ? (
          <button className="app-search__submit" type="submit" aria-label="进入搜索页">
            Enter
          </button>
        ) : null}
      </form>

      {searchPreview}
    </div>
  )

  return (
    <Layout className="app-shell">
      <Layout.Header className="app-header" style={{ background: 'var(--as-header-bg)' }}>
        <div className="app-header__inner">
          <div className="app-header__topline">
            {renderSearchShell('app-header__group app-header__group--search', searchShellRef)}

            <div className="app-header__controls">
              <SettingsControls />

              <nav className="app-header__group app-header__group--links" aria-label="页面动作">
                {headerDownloadAction ? (
                  <button
                    className="app-nav-link app-nav-link--button"
                    type="button"
                    onClick={headerDownloadAction}
                  >
                    下载
                  </button>
                ) : (
                  <Link to={`/${locale}/download`} className="app-nav-link">
                    下载
                  </Link>
                )}
                <Link to={`/${locale}/about-data`} className="app-nav-link">
                  关于数据
                </Link>
              </nav>
            </div>
          </div>

          <div className="app-header__bottomline">
            <div className="section-control" role="group" aria-label="album-section-select">
              <span className="section-control__label section-control__label--hidden">曲谱</span>
              <Select<HeaderSectionKey>
                aria-label="曲谱分区"
                className="section-select-native"
                value={selectedSection}
                onSelect={(value) => {
                  navigate(buildSectionPath(locale, value))
                }}
                options={sectionItems.map((item) => ({ value: item.key, label: item.label }))}
              />

              <nav className="section-nav" aria-label="曲谱分区">
                {sectionItems.map((item) => (
                  <Link
                    key={item.key}
                    to={buildSectionPath(locale, item.key)}
                    aria-label={`浏览${item.label}`}
                    data-section={item.key}
                    className={
                      shouldHighlightSection && item.key === selectedSection
                        ? `section-nav__item section-nav__item--${item.key} section-nav__item--active`
                        : `section-nav__item section-nav__item--${item.key}`
                    }
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>

            <div className="app-mobile-actions" aria-label="移动端页面动作">
              <Popover
                content={
                  <div className="app-mobile-popover app-mobile-search-popover">
                    {renderSearchShell('app-mobile-search-popover__shell', mobileSearchShellRef)}
                  </div>
                }
                open={isMobileSearchOpen}
                onOpenChange={(open) => {
                  setIsMobileSearchOpen(open)
                  if (!open) {
                    setIsSearchPreviewOpen(false)
                  }
                }}
                trigger="click"
              >
                <button className="app-mobile-action" type="button" aria-label="搜索">
                  <SearchOutlined />
                </button>
              </Popover>

              <Popover
                content={
                  <div className="app-mobile-popover app-mobile-settings-popover">
                    <SettingsControls />
                  </div>
                }
                open={isMobileSettingsOpen}
                onOpenChange={setIsMobileSettingsOpen}
                trigger="click"
              >
                <button className="app-mobile-action" type="button" aria-label="阅读设置">
                  <SettingOutlined />
                </button>
              </Popover>

              {headerDownloadAction ? (
                <button
                  className="app-mobile-action"
                  type="button"
                  aria-label="下载"
                  onClick={headerDownloadAction}
                >
                  <DownloadOutlined />
                </button>
              ) : (
                <Link to={`/${locale}/download`} className="app-mobile-action" aria-label="下载">
                  <DownloadOutlined />
                </Link>
              )}

              <Link
                to={`/${locale}/about-data`}
                className="app-mobile-action"
                aria-label="关于数据"
              >
                <CopyrightOutlined />
              </Link>
            </div>

            <Breadcrumb
              className="app-breadcrumb"
              items={breadcrumbs.map((crumb) => ({
                title: crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : crumb.label,
              }))}
            />
          </div>
        </div>
      </Layout.Header>

      <HeaderDownloadActionContext.Provider value={registerHeaderDownloadAction}>
        <Layout.Content className="app-content">{children}</Layout.Content>
      </HeaderDownloadActionContext.Provider>

      <Modal
        title="博士，怎么称呼你？"
        open={doctorName === null}
        onCancel={saveDoctorName}
        footer={[
          <Button key="skip" onClick={saveDoctorName}>
            暂不设置
          </Button>,
          <Button key="save" type="primary" onClick={saveDoctorName}>
            保存
          </Button>,
        ]}
      >
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            这个名字会用于阅读页和下载文件中的 <code>{'{@nickname}'}</code>{' '}
            替换。留空时会保留原始占位符。
          </Typography.Paragraph>
          <Input
            aria-label="博士名字"
            placeholder="例如：博士"
            value={doctorNameDraft}
            maxLength={24}
            onChange={(event) => setDoctorNameDraft(event.target.value)}
            onPressEnter={saveDoctorName}
          />
        </Space>
      </Modal>
    </Layout>
  )
}
