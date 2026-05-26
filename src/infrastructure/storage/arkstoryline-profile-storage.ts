import type { PersistStorage, StorageValue } from 'zustand/middleware'

const PROFILE_STORAGE_KEY = 'arkstoryline-profile'
const PROFILE_STORAGE_VERSION = 1

type ProfileSliceKey = 'appSettings' | 'readingProgress'

interface ArkStorylineProfile {
  version: typeof PROFILE_STORAGE_VERSION
  updatedAt?: string
  appSettings?: StorageValue<unknown>
  readingProgress?: StorageValue<unknown>
}

function getBrowserLocalStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage
  } catch {
    return null
  }
}

function parseProfile(rawValue: string | null): ArkStorylineProfile | null {
  if (!rawValue) {
    return null
  }

  try {
    const parsed = JSON.parse(rawValue) as ArkStorylineProfile
    return parsed && typeof parsed === 'object' && parsed.version === PROFILE_STORAGE_VERSION
      ? parsed
      : null
  } catch {
    return null
  }
}

function readProfile(storage: Storage): ArkStorylineProfile {
  const existingProfile = parseProfile(storage.getItem(PROFILE_STORAGE_KEY))

  return (
    existingProfile ?? {
      version: PROFILE_STORAGE_VERSION,
    }
  )
}

function writeProfileSlice<S>(
  storage: Storage,
  sliceKey: ProfileSliceKey,
  value: StorageValue<S>
): void {
  const profile = readProfile(storage)
  const nextProfile = {
    ...profile,
    [sliceKey]: value,
    updatedAt: new Date().toISOString(),
  }

  storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(nextProfile))
}

export function createArkStorylineProfileStorage<S>(
  sliceKey: ProfileSliceKey
): PersistStorage<S, void> {
  return {
    getItem: () => {
      const storage = getBrowserLocalStorage()

      if (!storage) {
        return null
      }

      const profile = readProfile(storage)
      return (profile[sliceKey] as StorageValue<S> | undefined) ?? null
    },
    setItem: (_name, value) => {
      const storage = getBrowserLocalStorage()

      if (!storage) {
        return
      }

      writeProfileSlice(storage, sliceKey, value)
    },
    removeItem: () => {
      const storage = getBrowserLocalStorage()

      if (!storage) {
        return
      }

      const profile = readProfile(storage)
      delete profile[sliceKey]
      profile.updatedAt = new Date().toISOString()
      storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
    },
  }
}

export const ARKSTORYLINE_PROFILE_STORAGE_KEY = PROFILE_STORAGE_KEY
