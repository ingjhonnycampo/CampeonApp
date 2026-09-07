import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.jsx'

// Monitoreo de errores: solo se activa si hay un DSN configurado (queda mudo en
// desarrollo local mientras no se configure en el .env del frontend).
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1
  })
}

function PantallaError() {
  return (
    <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h1>Ocurrió un error inesperado</h1>
      <p>Ya quedó registrado. Intenta recargar la página.</p>
      <button onClick={() => window.location.reload()}>Recargar</button>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<PantallaError />}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
