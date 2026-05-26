import { ConfigProvider, theme } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, type PropsWithChildren } from 'react'
import { useAppSettingsStore } from '../infrastructure/storage/use-app-settings-store'

const FONT_SIZE_BY_SCALE = {
  small: 14,
  medium: 16,
  large: 18,
} as const

const LINE_HEIGHT_BY_SPACING = {
  compact: 1.45,
  comfortable: 1.65,
  relaxed: 1.85,
} as const

export function AppProviders({ children }: PropsWithChildren) {
  const themeMode = useAppSettingsStore((state) => state.themeMode)
  const fontScale = useAppSettingsStore((state) => state.fontScale)
  const lineSpacing = useAppSettingsStore((state) => state.lineSpacing)

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode
    document.documentElement.style.colorScheme = themeMode
  }, [themeMode])

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <ConfigProvider
      theme={{
        algorithm: themeMode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          borderRadius: 2,
          fontSize: FONT_SIZE_BY_SCALE[fontScale],
          lineHeight: LINE_HEIGHT_BY_SPACING[lineSpacing],
          colorBgBase: themeMode === 'dark' ? '#111412' : '#e9e7df',
          colorBgContainer: themeMode === 'dark' ? '#232624' : 'rgba(255,255,255,.78)',
          colorBorder: themeMode === 'dark' ? '#363b36' : '#c9c5b9',
          colorBorderSecondary: themeMode === 'dark' ? '#2b302c' : '#d8d4c9',
          colorPrimary: '#00a9d6',
          colorText: themeMode === 'dark' ? '#f2f2ec' : '#242424',
          colorTextSecondary: themeMode === 'dark' ? '#a8aaa4' : '#60615d',
          fontFamily: '"Noto Serif SC", "Songti SC", "STSong", "Iowan Old Style", Georgia, serif',
          fontFamilyCode:
            '"SFMono-Regular", "Cascadia Code", "Liberation Mono", Consolas, monospace',
        },
        components: {
          Button: {
            controlHeight: 38,
            primaryShadow: 'none',
          },
          Card: {
            headerBg: 'transparent',
          },
          Input: {
            controlHeight: 40,
          },
          Select: {
            controlHeight: 40,
          },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ConfigProvider>
  )
}
