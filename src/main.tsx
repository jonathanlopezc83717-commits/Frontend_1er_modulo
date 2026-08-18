import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.tsx'
import { AppProvider } from '@/context/AppContext'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { AuthGate } from '@/components/auth/AuthGate'
import { SelectorProyectos } from '@/components/projects/SelectorProyectos'

// Quinta rama del gate (design D4): sin proyecto activo -> picker;
// con proyecto -> AppProvider con key por proyecto (reset limpio del
// estado y una única carga por cambio de proyecto).
function PuertaProyecto() {
  const { proyectoActivoId } = useAuth()

  if (!proyectoActivoId) {
    return <SelectorProyectos />
  }

  return (
    <AppProvider key={proyectoActivoId}>
      <App />
    </AppProvider>
  )
}

// Recarga automática cuando un deploy nuevo invalida los chunks cacheados.
// Evita bucles con una marca en sessionStorage.
function handleChunkLoadError(event: ErrorEvent) {
  const msg = event?.message ?? ''
  const isChunkError =
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module')
  if (!isChunkError) return
  if (sessionStorage.getItem('chunk-reloaded') === '1') return
  sessionStorage.setItem('chunk-reloaded', '1')
  window.location.reload()
}

window.addEventListener('error', handleChunkLoadError)

window.addEventListener('unhandledrejection', (event) => {
  const msg = event?.reason?.message ?? String(event?.reason ?? '')
  if (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('error loading dynamically imported module')
  ) {
    if (sessionStorage.getItem('chunk-reloaded') !== '1') {
      sessionStorage.setItem('chunk-reloaded', '1')
      window.location.reload()
    }
  }
})

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('No se encontró el elemento root')
}

try {
  createRoot(rootElement).render(
    <StrictMode>
      <AuthProvider>
        <Toaster position="top-right" richColors />
        <AuthGate>
          <PuertaProyecto />
        </AuthGate>
      </AuthProvider>
    </StrictMode>,
  )
  console.log('✅ Aplicación iniciada correctamente')
} catch (error) {
  console.error('❌ Error al iniciar la aplicación:', error)
}
