import { AppRouter } from './app/router'
import { DEFAULT_LOCALE, type AppLocale } from './app/i18n'

interface AppProps {
  locale?: AppLocale
}

function App({ locale = DEFAULT_LOCALE }: AppProps) {
  return <AppRouter locale={locale} />
}

export default App
