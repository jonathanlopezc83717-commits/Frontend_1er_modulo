import { AVAILABLE_MODELS, type ModelId, DEFAULT_MODEL } from '@/lib/openrouter'
import { Brain, ChevronDown, Check, Zap } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

interface ModelSelectorProps {
  selectedModel: ModelId
  onModelChange: (modelId: ModelId) => void
}

export function ModelSelector({ selectedModel, onModelChange }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedModelData = AVAILABLE_MODELS.find((m) => m.id === selectedModel)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-lg hover:border-primary transition-colors text-left w-full sm:w-auto"
      >
        <Brain className="w-4 h-4 text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-text truncate">
              {selectedModelData?.name || 'Seleccionar modelo'}
            </p>
          </div>
          <p className="text-xs text-text-muted truncate">
            {selectedModelData?.description}
          </p>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-text-muted transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full sm:w-80 bg-surface border border-border rounded-lg shadow-lg overflow-hidden">
          <div className="p-2">
            <p className="text-xs font-medium text-text-muted px-2 py-1 mb-2">
              Selecciona modelo de OpenAI
            </p>
            
            {AVAILABLE_MODELS.map((model) => (
              <button
                key={model.id}
                onClick={() => {
                  onModelChange(model.id as ModelId)
                  setIsOpen(false)
                }}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors mb-1 ${
                  selectedModel === model.id
                    ? 'bg-primary/10 border border-primary/20'
                    : 'hover:bg-background border border-transparent'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-text">{model.name}</p>
                      {model.id === DEFAULT_MODEL && (
                        <span className="text-xs bg-warning/20 text-warning px-2 py-0.5 rounded-full">
                          Recomendado
                        </span>
                      )}
                    </div>
                    {selectedModel === model.id && (
                      <Check className="w-4 h-4 text-primary" />
                    )}
                  </div>
                  <p className="text-xs text-text-muted mt-1">{model.description}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Zap className="w-3 h-3 text-text-muted" />
                    <span className="text-xs text-text-muted">
                      ~{model.estimatedTimePerImage}s por imagen
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
