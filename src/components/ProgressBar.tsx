import { useEffect, useState, useRef } from 'react'
import { Clock, Loader2, MessageSquare } from 'lucide-react'

interface ProgressBarProps {
  progress: number
  status: string
  estimatedTimeRemaining?: number
  stepName?: string
}

const LOADING_MESSAGES = [
  'Analizando estructuras visibles...',
  'Identificando materiales de construcción...',
  'Evaluando estado del terreno...',
  'Detectando elementos ferroviarios...',
  'Afinando descripción técnica...',
  'Revisando detalles específicos...',
  'Procesando características del entorno...',
  'Generando evaluación técnica...',
  'Verificando consistencia del análisis...',
  'Optimizando precisión de la descripción...',
]

export function ProgressBar({
  progress,
  estimatedTimeRemaining,
  stepName,
}: ProgressBarProps) {
  const [displayProgress, setDisplayProgress] = useState(0)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [currentMessage, setCurrentMessage] = useState(LOADING_MESSAGES[0])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const messageIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Animación suave de la barra de progreso
  useEffect(() => {
    const targetProgress = progress
    const step = (targetProgress - displayProgress) / 20
    
    if (Math.abs(targetProgress - displayProgress) > 0.5) {
      const timer = setInterval(() => {
        setDisplayProgress((prev) => {
          const next = prev + step
          if ((step > 0 && next >= targetProgress) || 
              (step < 0 && next <= targetProgress)) {
            return targetProgress
          }
          return next
        })
      }, 50)
      
      return () => clearInterval(timer)
    }
  }, [progress, displayProgress])

  // Contador de tiempo transcurrido
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setElapsedTime((prev) => prev + 1)
    }, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  // Rotación de mensajes cuando el progreso se estanca
  useEffect(() => {
    let currentIndex = 0
    // Cambiar mensaje cada 4 segundos si el progreso avanza lentamente
    messageIntervalRef.current = setInterval(() => {
      currentIndex = (currentIndex + 1) % LOADING_MESSAGES.length
      setCurrentMessage(LOADING_MESSAGES[currentIndex])
    }, 4000)

    return () => {
      if (messageIntervalRef.current) clearInterval(messageIntervalRef.current)
    }
  }, [])

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  const getProgressColor = () => {
    if (displayProgress < 30) return 'from-warning to-warning-dark'
    if (displayProgress < 70) return 'from-primary to-primary-dark'
    return 'from-success to-success-dark'
  }

  const getProgressText = () => {
    if (displayProgress < 20) return 'Iniciando análisis...'
    if (displayProgress < 40) return 'Procesando imágenes...'
    if (displayProgress < 60) return 'Analizando elementos...'
    if (displayProgress < 80) return 'Generando descripción...'
    if (displayProgress < 95) return 'Finalizando...'
    return 'Completado'
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-6 shadow-sm space-y-4">
      {/* Header con spinner y porcentaje */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
          <div>
            <p className="text-lg font-medium text-text">{getProgressText()}</p>
            {stepName && (
              <p className="text-sm text-text-muted">{stepName}</p>
            )}
          </div>
        </div>

        <div className="text-right">
          <p className="text-3xl font-bold text-primary">{Math.round(displayProgress)}%</p>
        </div>
      </div>

      {/* Barra de progreso con gradiente */}
      <div className="relative">
        <div className="w-full h-4 bg-background rounded-full overflow-hidden shadow-inner">
          <div
            className={`h-full bg-gradient-to-r ${getProgressColor()} transition-all duration-300 ease-out rounded-full relative`}
            style={{ width: `${Math.min(displayProgress, 100)}%` }}
          >
            {/* Efecto de brillo */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
          </div>
        </div>
        
        {/* Marcadores sutiles */}
        <div className="flex justify-between mt-2 px-1">
          <span className="text-xs text-text-muted">Inicio</span>
          <span className="text-xs text-text-muted">Procesando</span>
          <span className="text-xs text-text-muted">Analizando</span>
          <span className="text-xs text-text-muted">Finalizando</span>
        </div>
      </div>

      {/* Mensaje dinámico */}
      <div className="flex items-center gap-2 text-sm text-primary bg-primary/5 rounded-lg p-3">
        <MessageSquare className="w-4 h-4 flex-shrink-0" />
        <span className="animate-pulse">{currentMessage}</span>
      </div>

      {/* Información de tiempo */}
      <div className="flex items-center justify-between text-sm text-text-muted">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4" />
          <span>Transcurrido: {formatTime(elapsedTime)}</span>
        </div>

        {estimatedTimeRemaining && estimatedTimeRemaining > 0 && (
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>Estimado: {formatTime(estimatedTimeRemaining)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
