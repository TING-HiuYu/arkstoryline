interface EmptyStateProps {
  message?: string
}

export function EmptyState({ message = '暂无可显示内容。' }: EmptyStateProps) {
  return <p>{message}</p>
}
