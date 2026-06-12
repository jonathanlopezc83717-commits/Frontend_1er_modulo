import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.tsx'
import { AppProvider } from '@/context/AppContext'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('No se encontró el elemento root')
}

try {
  createRoot(rootElement).render(
    <StrictMode>
      <AppProvider>
        <Toaster position="top-right" richColors />
        <App />
      </AppProvider>
    </StrictMode>,
  )
  console.log('✅ Aplicación iniciada correctamente')
} catch (error) {
  console.error('❌ Error al iniciar la aplicación:', error)
}
