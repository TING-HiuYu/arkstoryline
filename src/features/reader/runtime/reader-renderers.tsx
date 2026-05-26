import type { ReactNode } from 'react'
import { Typography } from 'antd'
import type {
  OperatorConfidential,
  OperatorDocument,
  OperatorModule,
  RelatedRef,
} from '../../../domain/album/album-types'

export class StoryRelatedRefRenderer {
  public render(relatedRefs: RelatedRef[]): ReactNode {
    if (relatedRefs.length === 0) {
      return null
    }

    return (
      <div className="reader-related-list">
        {relatedRefs.map((related, index) => (
          <article className="reader-related-item" key={related.id}>
            <div className="reader-related-item__title">
              <span className="reader-related-item__marker">[{index + 1}]</span>
              <span className="reader-related-item__citation">
                <span className="reader-related-item__chapter-title">{related.title}</span>
                <span className="reader-related-item__meta">
                  <em className="reader-related-item__album-title">《{related.albumTitle}》</em>
                  {related.chapterCode ? <span>{related.chapterCode}</span> : null}
                  {related.stage ? <span>{related.stage}</span> : null}
                </span>
              </span>
            </div>
            <Typography.Text className="reader-related-item__reason" type="secondary">
              {related.summary}
            </Typography.Text>
          </article>
        ))}
      </div>
    )
  }
}

export class OperatorDocumentRenderer {
  public render(documents: OperatorDocument[]): ReactNode {
    return renderOperatorSections(documents)
  }
}

export class OperatorModuleRenderer {
  public render(modules: OperatorModule[]): ReactNode {
    return renderOperatorSections(modules)
  }
}

export class OperatorConfidentialRenderer {
  public render(confidentials: OperatorConfidential[]): ReactNode {
    return renderOperatorSections(confidentials)
  }
}

function renderOperatorSections(
  entries: Array<OperatorDocument | OperatorModule | OperatorConfidential>
): ReactNode {
  if (entries.length === 0) {
    return <Typography.Text type="secondary">暂无内容。</Typography.Text>
  }

  return (
    <div className="operator-reader-sections">
      {entries.map((entry) => (
        <section className="operator-reader-section" key={entry.id}>
          <h2>{entry.title}</h2>
          {entry.sections.map((section) => (
            <article className="operator-reader-section__block" key={section.id}>
              {section.title ? <h3>{section.title}</h3> : null}
              <Typography.Paragraph>{section.body}</Typography.Paragraph>
            </article>
          ))}
        </section>
      ))}
    </div>
  )
}
