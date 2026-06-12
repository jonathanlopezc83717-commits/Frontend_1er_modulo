import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, ImageIcon, Loader2, X, Plus } from 'lucide-react'

export interface ImageItem {
  id: string
  file: File
  preview: string
}

interface ImageUploaderProps {
  onImagesSelect: (images: ImageItem[]) => void
  selectedImages: ImageItem[]
  onClear: () => void
  onRemoveImage: (id: string) => void
  maxImages?: number
  isAnalyzing?: boolean
}

export function ImageUploader({
  onImagesSelect,
  selectedImages,
  onClear,
  onRemoveImage,
  maxImages = 4,
  isAnalyzing = false,
}: ImageUploaderProps) {
  const [isLoading, setIsLoading] = useState(false)

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const remainingSlots = maxImages - selectedImages.length
      const filesToProcess = acceptedFiles.slice(0, remainingSlots)

      if (filesToProcess.length === 0) return

      setIsLoading(true)
      const newImages: ImageItem[] = []
      let processedCount = 0

      filesToProcess.forEach((file) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          newImages.push({
            id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
            file,
            preview: reader.result as string,
          })
          processedCount++

          if (processedCount === filesToProcess.length) {
            const allImages = [...selectedImages, ...newImages]
            onImagesSelect(allImages)
            setIsLoading(false)
          }
        }
        reader.readAsDataURL(file)
      })
    },
    [onImagesSelect, selectedImages, maxImages]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
    },
    maxFiles: maxImages - selectedImages.length,
    disabled: isLoading || isAnalyzing || selectedImages.length >= maxImages,
    multiple: true,
  })

  if (selectedImages.length > 0) {
    return (
      <div className="space-y-4">
        <div
          className={`grid gap-4 ${
            selectedImages.length === 1
              ? 'grid-cols-1'
              : 'grid-cols-2'
          }`}
        >
          {selectedImages.map((image) => (
            <div
              key={image.id}
              className="relative rounded-xl overflow-hidden border border-border bg-surface shadow-sm group"
            >
              <img
                src={image.preview}
                alt="Selected"
                className="w-full h-48 object-cover"
              />
              {!isAnalyzing && (
                <button
                  onClick={() => onRemoveImage(image.id)}
                  className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors opacity-0 group-hover:opacity-100"
                >
                  <X size={14} />
                </button>
              )}
              {isAnalyzing && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                </div>
              )}
            </div>
          ))}
          {selectedImages.length < maxImages && !isAnalyzing && (
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-xl flex items-center justify-center cursor-pointer transition-all min-h-[192px]
                ${isDragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-surface'
                }
              `}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center gap-2 text-text-muted">
                <Plus className="w-8 h-8" />
                <span className="text-sm">Agregar imagen</span>
                <span className="text-xs">
                  {selectedImages.length}/{maxImages}
                </span>
              </div>
            </div>
          )}
        </div>

        {selectedImages.length >= 1 && !isAnalyzing && (
          <button
            onClick={onClear}
            className="w-full py-2 text-sm text-text-muted hover:text-error transition-colors"
          >
            Limpiar imágenes
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      {...getRootProps()}
      className={`
        border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all
        ${isDragActive
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50 hover:bg-surface'
        }
        ${isLoading || isAnalyzing ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-4">
        {isLoading || isAnalyzing ? (
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
        ) : (
          <div className="p-4 bg-primary/10 rounded-full">
            {isDragActive ? (
              <ImageIcon className="w-8 h-8 text-primary" />
            ) : (
              <Upload className="w-8 h-8 text-primary" />
            )}
          </div>
        )}
        <div>
          <p className="text-lg font-medium text-text">
            {isDragActive
              ? 'Suelta las imágenes aquí'
              : isLoading || isAnalyzing
                ? 'Procesando...'
                : 'Arrastra imágenes o haz clic para seleccionar'
            }
          </p>
          {!(isLoading || isAnalyzing) && (
            <div className="text-sm text-text-muted mt-1 space-y-1">
              <p>PNG, JPG, JPEG, GIF o WEBP</p>
              <p>Máximo {maxImages} imágenes</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
