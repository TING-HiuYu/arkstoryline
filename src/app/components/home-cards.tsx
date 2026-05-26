import { Button, Card, Space, Typography } from 'antd'
import { useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import type { AppLocale } from '../i18n'
import {
  getCoverAspectRatio,
  getAlbumCardGroupTitle,
  resolveCoverImageSource,
  type HomeAlbumSectionKey,
  type OperatorGroupViewModel,
  type OperatorTopologyViewModel,
  type TimelineCardViewModel,
  type AlbumCardGroup,
} from './home-card-utils'

function shouldHandleAlbumCardClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}

function buildAlbumPath(locale: AppLocale, albumId: string): string {
  return `/${locale}/albums/${albumId}`
}

const PROGRESSIVE_IMAGE_LOADING_TEXT = '正在加载图片...'

export function ProgressiveImageFrame({
  src,
  alt,
  aspectRatio = '16 / 9',
  maxHeight,
  fit = 'cover',
}: {
  src: string
  alt: string
  aspectRatio?: string
  maxHeight?: number
  fit?: 'cover' | 'contain'
}) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const isLoaded = loadedSrc === src
  const hasFailed = failedSrc === src

  return (
    <div
      className="image-frame"
      style={{
        width: '100%',
        aspectRatio,
        maxHeight,
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid rgba(100, 116, 139, 0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        position: 'relative',
      }}
    >
      {!isLoaded && !hasFailed ? (
        <div
          aria-live="polite"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            textAlign: 'center',
            background: 'transparent',
          }}
        >
          <Typography.Text type="secondary">{PROGRESSIVE_IMAGE_LOADING_TEXT}</Typography.Text>
        </div>
      ) : null}
      {hasFailed ? <Typography.Text type="secondary">图片加载失败</Typography.Text> : null}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => {
          setLoadedSrc(src)
          setFailedSrc(null)
        }}
        onError={() => setFailedSrc(src)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: fit,
          display: 'block',
          opacity: isLoaded && !hasFailed ? 1 : 0,
          transition: 'opacity 220ms ease',
        }}
      />
    </div>
  )
}

export function HomeAlbumGroups({
  locale,
  sectionKey,
  sectionLabel,
  groups,
  mainlineEpisodeIndexByAlbumId,
  isGroupCollapsed,
  onToggleGroup,
  onOpenAlbum,
}: {
  locale: AppLocale
  sectionKey: HomeAlbumSectionKey
  sectionLabel: string
  groups: AlbumCardGroup[]
  mainlineEpisodeIndexByAlbumId: Map<string, number>
  isGroupCollapsed: (groupKey: string) => boolean
  onToggleGroup: (groupKey: string) => void
  onOpenAlbum: (albumId: string) => void
}) {
  return (
    <div
      data-testid="home-album-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 12,
      }}
    >
      {groups.map((group, groupIndex) => {
        const groupCollapseKey = `${sectionKey}:${group.key}`
        const isCollapsed = isGroupCollapsed(groupCollapseKey)
        const groupContentId = `album-group-${sectionKey}-${groupIndex}`
        const groupTitleId = `${groupContentId}-title`

        return (
          <section className="album-group" key={group.key} aria-labelledby={groupTitleId}>
            <div className="album-group__header">
              <div className="album-group__heading">
                <span className="album-group__eyebrow">{sectionLabel}</span>
                <h3 id={groupTitleId} className="album-group__title">
                  {group.title}
                </h3>
              </div>
              <div className="album-group__tools">
                <span className="album-group__count">{group.items.length} 个条目</span>
                <Button
                  aria-controls={groupContentId}
                  aria-expanded={!isCollapsed}
                  className="album-group__toggle"
                  size="small"
                  type="text"
                  onClick={() => onToggleGroup(groupCollapseKey)}
                >
                  {isCollapsed ? '展开' : '折叠'}
                </Button>
              </div>
            </div>

            {!isCollapsed ? (
              <div
                id={groupContentId}
                className="album-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    sectionKey === 'mainline'
                      ? 'repeat(auto-fill, minmax(260px, 1fr))'
                      : 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: 12,
                }}
              >
                {group.items.map((item) => (
                  <AlbumCard
                    key={item.albumId}
                    locale={locale}
                    item={item}
                    episodeNumber={mainlineEpisodeIndexByAlbumId.get(item.albumId)}
                    onOpenAlbum={onOpenAlbum}
                  />
                ))}
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}

function AlbumCard({
  locale,
  item,
  episodeNumber,
  onOpenAlbum,
}: {
  locale: AppLocale
  item: TimelineCardViewModel
  episodeNumber?: number
  onOpenAlbum?: (albumId: string) => void
}) {
  if (item.albumKind === 'mainline') {
    return (
      <MainlineAlbumCard
        locale={locale}
        item={item}
        episodeNumber={episodeNumber}
        onOpenAlbum={onOpenAlbum}
      />
    )
  }

  return <DossierAlbumCard locale={locale} item={item} onOpenAlbum={onOpenAlbum} />
}

function DossierAlbumCard({
  locale,
  item,
  onOpenAlbum,
}: {
  locale: AppLocale
  item: TimelineCardViewModel
  onOpenAlbum?: (albumId: string) => void
}) {
  const dossierLabel = getAlbumCardGroupTitle(item)
  const dossierCard = (
    <Card className="story-card story-card--archive story-card--dossier" hoverable>
      <div className="story-card__body story-card__body--dossier">
        <div className="archive-dossier" aria-label={`${item.title} 档案摘要`}>
          <div className="archive-dossier__topline">
            <span>{dossierLabel}</span>
            <span>共{item.chapterCount}章</span>
          </div>
          <Typography.Title className="story-card__title" level={5} style={{ margin: 0 }}>
            {item.title}
          </Typography.Title>
          <div className="archive-dossier__rules" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    </Card>
  )

  return (
    <Link
      className="story-card-link"
      to={buildAlbumPath(locale, item.albumId)}
      onClick={(event) => {
        if (!onOpenAlbum || !shouldHandleAlbumCardClick(event)) {
          return
        }

        event.preventDefault()
        onOpenAlbum(item.albumId)
      }}
    >
      {dossierCard}
    </Link>
  )
}

function MainlineAlbumCard({
  locale,
  item,
  episodeNumber,
  onOpenAlbum,
}: {
  locale: AppLocale
  item: TimelineCardViewModel
  episodeNumber?: number
  onOpenAlbum?: (albumId: string) => void
}) {
  const coverAlt = `${item.title} 封面`
  const coverSrc = resolveCoverImageSource(item.cover)
  const episodeLabel =
    episodeNumber !== undefined ? `EP.${episodeNumber.toString().padStart(2, '0')}` : null

  return (
    <Link
      className="story-card-link"
      to={buildAlbumPath(locale, item.albumId)}
      onClick={(event) => {
        if (!onOpenAlbum || !shouldHandleAlbumCardClick(event)) {
          return
        }

        event.preventDefault()
        onOpenAlbum(item.albumId)
      }}
    >
      <Card className="story-card story-card--mainline" style={{ borderRadius: 8 }}>
        <div className="story-card__body">
          {episodeLabel ? <span className="story-card__episode">{episodeLabel}</span> : null}
          <Typography.Title className="story-card__title" level={5} style={{ margin: 0 }}>
            {item.title}
          </Typography.Title>

          {coverSrc ? (
            <ProgressiveImageFrame
              src={coverSrc}
              alt={coverAlt}
              aspectRatio={getCoverAspectRatio(item.cover)}
            />
          ) : (
            <div className="image-placeholder">
              <Typography.Text type="secondary">封面暂不可用</Typography.Text>
            </div>
          )}

          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {item.summary ? (
              <Typography.Paragraph
                className="story-card__summary"
                ellipsis={{ rows: 2 }}
                style={{ marginBottom: 0 }}
              >
                {item.summary}
              </Typography.Paragraph>
            ) : null}
            <div className="story-card__meta story-card__meta--mainline">
              <span>共{item.chapterCount}章</span>
              <span>进度 {item.progressPercent}%</span>
            </div>
            <div className="progress-meter" aria-hidden="true">
              <div className="progress-meter__bar" style={{ width: `${item.progressPercent}%` }} />
            </div>
          </Space>
        </div>
      </Card>
    </Link>
  )
}

export function OperatorTopologyGroups({
  groups,
  isGroupCollapsed,
  onToggleGroup,
}: {
  groups: OperatorGroupViewModel[]
  isGroupCollapsed: (groupKey: string) => boolean
  onToggleGroup: (groupKey: string) => void
}) {
  return (
    <div className="operator-groups" data-testid="home-operator-groups">
      {groups.map((group, groupIndex) => {
        const groupCollapseKey = `operatorRecord:${group.key}`
        const isCollapsed = isGroupCollapsed(groupCollapseKey)
        const groupContentId = `operator-group-${groupIndex}`

        return (
          <section className="album-group operator-group" key={group.key}>
            <div className="album-group__header">
              <div className="album-group__heading">
                <span className="album-group__eyebrow">Operator</span>
                <h3 className="album-group__title">{group.label}</h3>
              </div>
              <div className="album-group__tools">
                <span className="album-group__count">{group.items.length} 位干员</span>
                <Button
                  aria-controls={groupContentId}
                  aria-expanded={!isCollapsed}
                  className="album-group__toggle"
                  size="small"
                  type="text"
                  onClick={() => onToggleGroup(groupCollapseKey)}
                >
                  {isCollapsed ? '展开' : '折叠'}
                </Button>
              </div>
            </div>

            {!isCollapsed ? (
              <div
                id={groupContentId}
                className="operator-grid"
                data-testid={`home-operator-grid-${group.key}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                  gap: 12,
                }}
              >
                {group.items.map((operator) => (
                  <OperatorDossierCard key={operator.id} operator={operator} />
                ))}
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}

function OperatorDossierCard({ operator }: { operator: OperatorTopologyViewModel }) {
  return (
    <Link
      aria-label={`查看${operator.name}干员详情`}
      className="operator-card-link"
      to={operator.detailPath}
    >
      <Card className="operator-card operator-card--dossier" hoverable>
        <div className="operator-card__body">
          <div className="operator-dossier" aria-label={`${operator.name} 档案摘要`}>
            <div className="operator-dossier__topline">
              <span>干员档案</span>
            </div>
            <Typography.Title className="operator-card__title" level={5} style={{ margin: 0 }}>
              {operator.name}
            </Typography.Title>
            <div className="archive-dossier__rules" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      </Card>
    </Link>
  )
}
