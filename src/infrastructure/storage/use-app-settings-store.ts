import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createArkStorylineProfileStorage } from './arkstoryline-profile-storage'

export type AppThemeMode = 'dark' | 'light'

export type FontScale = 'small' | 'medium' | 'large'

export type LineSpacing = 'compact' | 'comfortable' | 'relaxed'

export type ContentSourceId =
  | 'arknights-text'
  | 'arknights-images'
  | 'arknights-audio'
  | 'arknights-wiki'

interface AppSettingsState {
  compactMode: boolean
  otherStorysEnabled: boolean
  disabledContentSources: ContentSourceId[]
  themeMode: AppThemeMode
  fontScale: FontScale
  lineSpacing: LineSpacing
  doctorName: string | null
  setCompactMode: (compactMode: boolean) => void
  setOtherStorysEnabled: (enabled: boolean) => void
  setContentSourceDisabled: (sourceId: ContentSourceId, disabled: boolean) => void
  setThemeMode: (themeMode: AppThemeMode) => void
  setFontScale: (fontScale: FontScale) => void
  setLineSpacing: (lineSpacing: LineSpacing) => void
  setDoctorName: (doctorName: string) => void
}

export const useAppSettingsStore = create<AppSettingsState>()(
  persist(
    (set) => ({
      compactMode: false,
      otherStorysEnabled: true,
      disabledContentSources: [],
      themeMode: 'dark',
      fontScale: 'medium',
      lineSpacing: 'comfortable',
      doctorName: null,
      setCompactMode: (compactMode) => {
        set({ compactMode })
      },
      setOtherStorysEnabled: (otherStorysEnabled) => {
        set({ otherStorysEnabled })
      },
      setContentSourceDisabled: (sourceId, disabled) => {
        set((state) => {
          const current = new Set(state.disabledContentSources)

          if (disabled) {
            current.add(sourceId)
          } else {
            current.delete(sourceId)
          }

          return {
            disabledContentSources: [...current].sort((left, right) => left.localeCompare(right)),
          }
        })
      },
      setThemeMode: (themeMode) => {
        set({ themeMode })
      },
      setFontScale: (fontScale) => {
        set({ fontScale })
      },
      setLineSpacing: (lineSpacing) => {
        set({ lineSpacing })
      },
      setDoctorName: (doctorName) => {
        set({ doctorName })
      },
    }),
    {
      name: 'arkstoryline-app-settings',
      storage: createArkStorylineProfileStorage('appSettings'),
      partialize: (state) => ({
        themeMode: state.themeMode,
        fontScale: state.fontScale,
        lineSpacing: state.lineSpacing,
        doctorName: state.doctorName,
        otherStorysEnabled: state.otherStorysEnabled,
        disabledContentSources: state.disabledContentSources,
      }),
    }
  )
)
