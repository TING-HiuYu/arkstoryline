import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { detectLocaleFromPath } from './app/i18n.ts'
import { AppProviders } from './app/providers.tsx'

const initialLocale = detectLocaleFromPath(window.location.pathname)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <BrowserRouter>
        <App locale={initialLocale} />
      </BrowserRouter>
    </AppProviders>
  </StrictMode>
)
