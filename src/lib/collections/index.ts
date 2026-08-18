import { QueryClient } from '@tanstack/react-query'
import { createCollection } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import {
  agregarMiembroProyecto,
  actualizarProyecto,
  cambiarRolUsuario,
  crearProyecto as crearProyectoRemoto,
  eliminarProyecto,
  listarMiembrosProyecto,
  listarPerfiles,
  listarProyectos,
  quitarMiembroProyecto,
  type MiembroProyecto,
} from '@/lib/supabase-service'
import type { Perfil, Proyecto } from '@/types'

export const queryClient = new QueryClient()

function assertSuccess(resultado: { success: boolean; error?: string }): void {
  if (!resultado.success) throw new Error(resultado.error ?? 'Persistence failed')
}

export const proyectosCollection = createCollection(
  queryCollectionOptions({
    id: 'proyectos',
    queryKey: ['proyectos'],
    queryFn: () => listarProyectos(),
    queryClient,
    enabled: false,
    getKey: (proyecto: Proyecto) => proyecto.id,
    onInsert: async ({ transaction }) => {
      for (const mutation of transaction.mutations) {
        assertSuccess(await crearProyectoRemoto(mutation.modified))
      }
    },
    onUpdate: async ({ transaction }) => {
      for (const mutation of transaction.mutations) {
        assertSuccess(
          await actualizarProyecto(mutation.key, {
            nombre: mutation.modified.nombre,
            descripcion: mutation.modified.descripcion,
          }),
        )
      }
    },
    onDelete: async ({ transaction }) => {
      for (const mutation of transaction.mutations) {
        assertSuccess(await eliminarProyecto(mutation.key))
      }
    },
  }),
)

function buildMiembrosCollection(proyectoId: string) {
  return createCollection(
    queryCollectionOptions({
      id: `miembros:${proyectoId}`,
      queryKey: ['proyecto_miembros', proyectoId],
      queryFn: () => listarMiembrosProyecto(proyectoId),
      queryClient,
      getKey: (miembro: MiembroProyecto) => miembro.user_id,
      onInsert: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          assertSuccess(
            await agregarMiembroProyecto(
              proyectoId,
              mutation.modified.user_id,
              mutation.modified.creado_por,
            ),
          )
        }
      },
      onDelete: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          assertSuccess(await quitarMiembroProyecto(proyectoId, mutation.key))
        }
      },
    }),
  )
}

const miembrosCache = new Map<string, ReturnType<typeof buildMiembrosCollection>>()

export function getMiembrosCollection(proyectoId: string) {
  const existente = miembrosCache.get(proyectoId)
  if (existente) return existente
  const collection = buildMiembrosCollection(proyectoId)
  miembrosCache.set(proyectoId, collection)
  return collection
}

export const perfilesCollection = createCollection(
  queryCollectionOptions({
    id: 'perfiles',
    queryKey: ['perfiles'],
    queryFn: () => listarPerfiles(),
    queryClient,
    getKey: (perfil: Perfil) => perfil.id,
    onUpdate: async ({ transaction }) => {
      for (const mutation of transaction.mutations) {
        assertSuccess(await cambiarRolUsuario(mutation.key, mutation.modified.rol))
      }
    },
  }),
)
