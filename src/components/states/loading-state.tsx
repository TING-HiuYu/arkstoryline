interface LoadingStateProps {
  message?: string
}

export function LoadingState({ message = '加载中...' }: LoadingStateProps) {
  return <p>{message}</p>
}
