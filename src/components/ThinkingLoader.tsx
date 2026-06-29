import { useEffect, useState } from 'react'
import { Brain, Sparkles } from 'lucide-react'

interface ThinkingLoaderProps {
  /** Mensaje principal que se muestra debajo del cerebro */
  message?: string
  /** Lista de mensajes que rotan para dar sensación de progreso contextual */
  rotatingMessages?: string[]
  /** Intervalo de rotación de mensajes en ms */
  intervalMs?: number
  /** Tamaño del cerebro central en px */
  size?: number
  /** Variant visual */
  variant?: 'full' | 'compact'
  /** Subtítulo pequeño (ej. nombre del modelo) */
  subtitle?: string
}

const DEFAULT_MESSAGES = [
  'Observando la estructura...',
  'Identificando materiales...',
  'Evaluando el terreno...',
  'Detectando elementos ferroviarios...',
  'Afinando descripción técnica...',
  'Verificando detalles...',
  'Generando evaluación...',
]

/**
 * Loader interactivo con un cerebro animado, ondas pulsantes,
 * partículas orbitando y puntos tipo "escribiendo...".
 * Pensado para reemplazar spinners planos durante procesos largos de IA.
 */
export function ThinkingLoader({
  message,
  rotatingMessages = DEFAULT_MESSAGES,
  intervalMs = 2800,
  size = 64,
  variant = 'full',
  subtitle,
}: ThinkingLoaderProps) {
  const [messageIndex, setMessageIndex] = useState(0)
  const [dots, setDots] = useState('')

  // Rotación de mensajes contextuales
  useEffect(() => {
    if (!rotatingMessages || rotatingMessages.length === 0) return
    const id = window.setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % rotatingMessages.length)
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [rotatingMessages, intervalMs])

  // Animación de puntos "escribiendo..."
  useEffect(() => {
    const id = window.setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'))
    }, 400)
    return () => window.clearInterval(id)
  }, [])

  const mensajeFinal = message ?? rotatingMessages[messageIndex]

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2.5 text-sm text-primary">
        <div className="relative" style={{ width: size * 0.5, height: size * 0.5 }}>
          <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
          <Brain className="absolute inset-0 m-auto text-primary animate-pulse" style={{ width: size * 0.45, height: size * 0.45 }} />
        </div>
        <span className="animate-pulse">
          {mensajeFinal}
          <span className="inline-block w-4 text-left">{dots}</span>
        </span>
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-8 shadow-sm">
      <div className="flex flex-col items-center gap-5">
        {/* Cerebro con ondas y partículas */}
        <div className="relative flex items-center justify-center" style={{ width: size * 1.6, height: size * 1.6 }}>
          {/* Onda exterior */}
          <span
            className="absolute rounded-full border-2 border-primary/20 animate-ping"
            style={{ width: size * 1.5, height: size * 1.5 }}
          />
          {/* Onda media */}
          <span
            className="absolute rounded-full bg-primary/10 animate-pulse"
            style={{ width: size * 1.25, height: size * 1.25 }}
          />
          {/* Halo gradiente */}
          <span
            className="absolute rounded-full bg-gradient-to-tr from-primary/30 via-primary/10 to-transparent blur-md animate-pulse"
            style={{ width: size * 1.1, height: size * 1.1 }}
          />
          {/* Cerebro central */}
          <Brain
            className="relative text-primary animate-pulse drop-shadow-sm"
            style={{ width: size * 0.7, height: size * 0.7 }}
          />
          {/* Partículas/sparkles orbitando */}
          <Sparkles className="absolute text-primary/70 animate-ping" style={{ width: size * 0.18, height: size * 0.18, top: size * 0.05, left: size * 0.15 }} />
          <Sparkles className="absolute text-primary/50 animate-pulse" style={{ width: size * 0.14, height: size * 0.14, bottom: size * 0.1, right: size * 0.12, animationDelay: '0.6s' }} />
          <Sparkles className="absolute text-primary/40 animate-ping" style={{ width: size * 0.12, height: size * 0.12, top: size * 0.35, right: size * 0.05, animationDelay: '1.1s' }} />
        </div>

        {/* Texto principal */}
        <div className="text-center space-y-1">
          <p className="text-lg font-medium text-text">
            {mensajeFinal}
            <span className="inline-block w-5 text-left font-bold text-primary">{dots}</span>
          </p>
          {subtitle && (
            <p className="text-sm text-text-muted">{subtitle}</p>
          )}
        </div>

        {/* Indicador tipo "escribiendo..." con barras */}
        <div className="flex items-center gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="w-2 rounded-full bg-primary/70"
              style={{
                height: 14,
                animation: `thinking-bounce 1.2s ease-in-out ${i * 0.15}s infinite`,
              }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes thinking-bounce {
          0%, 80%, 100% { transform: scaleY(0.4); opacity: 0.5; }
          40% { transform: scaleY(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
