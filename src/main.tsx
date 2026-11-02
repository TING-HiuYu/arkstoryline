import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { detectLocaleFromPath } from './app/i18n.ts'
import { AppProviders } from './app/providers.tsx'

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '')
const initialLocale = detectLocaleFromPath(
  basePath && window.location.pathname.startsWith(`${basePath}/`)
    ? window.location.pathname.slice(basePath.length)
    : window.location.pathname
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <BrowserRouter basename={basePath || '/'}>
        <App locale={initialLocale} />
      </BrowserRouter>
    </AppProviders>
  </StrictMode>
)
