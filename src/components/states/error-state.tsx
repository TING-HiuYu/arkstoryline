interface ErrorStateProps {
  message?: string
}

export function ErrorState({ message = '加载失败，请稍后重试。' }: ErrorStateProps) {
  return <p>{message}</p>
}
