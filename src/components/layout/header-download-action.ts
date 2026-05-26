import { createContext, useContext, useEffect } from 'react'

export type HeaderDownloadAction = (() => void) | null

export const HeaderDownloadActionContext = createContext<
  ((action: HeaderDownloadAction) => void) | null
>(null)

export function useHeaderDownloadAction(action: HeaderDownloadAction) {
  const registerHeaderDownloadAction = useContext(HeaderDownloadActionContext)

  useEffect(() => {
    if (!registerHeaderDownloadAction) {
      return
    }

    registerHeaderDownloadAction(action)

    return () => {
      registerHeaderDownloadAction(null)
    }
  }, [action, registerHeaderDownloadAction])
}
