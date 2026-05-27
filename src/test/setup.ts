import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})

class ResizeObserverMock implements ResizeObserver {
  observe(): void {
    return undefined
  }

  unobserve(): void {
    return undefined
  }

  disconnect(): void {
    return undefined
  }
}

if (!window.ResizeObserver) {
  window.ResizeObserver = ResizeObserverMock
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = ResizeObserverMock
}

if (!URL.createObjectURL) {
  let objectUrlSequence = 0
  URL.createObjectURL = () => {
    objectUrlSequence += 1
    return `blob:arkstoryline-test-${objectUrlSequence}`
  }
}

if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = () => undefined
}

if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => {
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }
  }
}

const browserGetComputedStyle = window.getComputedStyle.bind(window)
window.getComputedStyle = (
  element: Element,
  pseudoElement?: string | null
): CSSStyleDeclaration => {
  if (pseudoElement) {
    return browserGetComputedStyle(element)
  }

  return browserGetComputedStyle(element)
}

HTMLCanvasElement.prototype.getContext = () => null
