/**
 * Pruebas de PanelUsuarios: gestiÃ³n global de roles (solo administrador),
 * cambio de rol con efecto en la prÃ³xima sesiÃ³n y bloqueo de auto-cambio
 * (spec Req. Global Roles and Permissions â€” CHANGE role row).
 * Ejecutar con: npx vitest run src/tests/panel-usuarios.test.tsx
 */

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { etiquetaRol } from '@/lib/roles'
import type { Perfil, RolUsuario } from '@/types'

const mocks = vi.hoisted(() => ({
  perfil: null as Perfil | null,
  refrescarPerfil: vi.fn(),
  perfiles: [] as Perfil[],
  listarPerfiles: vi.fn(),
  cambiarRolUsuario: vi.fn(),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    session: null,
    perfil: mocks.perfil,
    proyectos: [],
    proyectoActivoId: 'p1',
    cargando: false,
    login: vi.fn(),
    logout: vi.fn(),
    refrescarPerfil: mocks.refrescarPerfil,
    crearProyecto: vi.fn(),
    cambiarProyecto: vi.fn(),
  }),
}))

vi.mock('@/lib/supabase-service', () => ({
  listarPerfiles: mocks.listarPerfiles,
  cambiarRolUsuario: mocks.cambiarRolUsuario,
  listarProyectos: vi.fn(),
  crearProyecto: vi.fn(),
  listarMiembrosProyecto: vi.fn(),
  agregarMiembroProyecto: vi.fn(),
  quitarMiembroProyecto: vi.fn(),
}))

import { PanelUsuarios } from '@/components/projects/PanelUsuarios'

Element.prototype.scrollIntoView = () => {}

function hacerPerfil(rol: RolUsuario, id: string): Perfil {
  return {
    id,
    email: `${id}@test.local`,
    nombre: null,
    rol,
    debe_cambiar_password: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function montar() {
  return render(createElement(PanelUsuarios))
}

async function elegirRol(email: string, rol: RolUsuario) {
  const disparador = document.querySelector(`[aria-label="Rol de ${email}"]`) as HTMLElement
  expect(disparador).toBeTruthy()
  fireEvent.click(disparador)
  const opcion = await waitFor(() => {
    const opciones = Array.from(document.querySelectorAll('[role="option"]'))
    const objetivo = opciones.find((o) => o.textContent === etiquetaRol(rol))
    expect(objetivo).toBeTruthy()
    return objetivo as HTMLElement
  })
  fireEvent.click(opcion)
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.perfil = hacerPerfil('administrador', 'admin-1')
  mocks.perfiles = [hacerPerfil('administrador', 'admin-1'), hacerPerfil('usuario', 'u2')]
  mocks.listarPerfiles.mockResolvedValue(mocks.perfiles)
  mocks.cambiarRolUsuario.mockResolvedValue({ success: true })
})

describe('PanelUsuarios', () => {
  it('administrador ve la lista de usuarios con su rol actual', async () => {
    const { findByText } = montar()

    expect(await findByText('admin-1@test.local')).toBeTruthy()
    expect(await findByText('u2@test.local')).toBeTruthy()
    expect(mocks.listarPerfiles).toHaveBeenCalled()
  })

  it('no administrador no ve el panel ni consulta usuarios', () => {
    mocks.perfil = hacerPerfil('general', 'g-1')

    const { container } = montar()

    expect(container.innerHTML).toBe('')
    expect(mocks.listarPerfiles).not.toHaveBeenCalled()
  })

  it('admin cambia el rol de un usuario y el cambio persiste vÃ­a servicio', async () => {
    const { findByText } = montar()
    await findByText('u2@test.local')

    await elegirRol('u2@test.local', 'general')

    await waitFor(() => {
      expect(mocks.cambiarRolUsuario).toHaveBeenCalledWith('u2', 'general')
    })
  })

  it('no puede cambiar su propio rol (select deshabilitado)', async () => {
    const { findByText } = montar()
    await findByText('admin-1@test.local')

    expect(mocks.cambiarRolUsuario).not.toHaveBeenCalled()
    const disparador = document.querySelector('[aria-label="Rol de admin-1@test.local"]') as HTMLElement
    expect(disparador.getAttribute('disabled')).toBe('')
    expect(document.querySelector('[aria-label="Rol de admin-1@test.local"]')?.getAttribute('data-disabled')).toBe('')
  })

  it('recarga la lista despuÃ©s de un cambio exitoso', async () => {
    const { findByText } = montar()
    await findByText('u2@test.local')

    await elegirRol('u2@test.local', 'administrador')

    await waitFor(() => {
      expect(mocks.listarPerfiles).toHaveBeenCalledTimes(2)
    })
  })
})
