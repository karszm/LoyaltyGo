import { FunctionsHttpError } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  adjustPoints,
  closeProgram,
  generateCardImage,
  getProgramKey,
  publishProgram,
  resumeProgram,
  rotateProgramKey,
  suspendProgram,
  syncBranding,
} from './api'

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('./supabase', () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}))

describe('panel-api client', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null })
  })

  it.each([
    ['publish', () => publishProgram(), 'panel-api/program/publish', 'POST', undefined],
    ['get key', () => getProgramKey(), 'panel-api/program/key', 'GET', undefined],
    ['rotate key', () => rotateProgramKey(), 'panel-api/program/key', 'POST', undefined],
    ['suspend', () => suspendProgram(), 'panel-api/program/suspend', 'POST', undefined],
    ['resume', () => resumeProgram(), 'panel-api/program/resume', 'POST', undefined],
    ['close', () => closeProgram(true), 'panel-api/program/close', 'POST', { confirm: true }],
    ['branding', () => syncBranding(), 'panel-api/program/branding', 'POST', undefined],
    [
      'adjustment',
      () => adjustPoints('member-1', -30, 'Zwrot'),
      'panel-api/members/member-1/adjustment',
      'POST',
      { delta: -30, description: 'Zwrot' },
    ],
    [
      'card image',
      () => generateCardImage('kwiaciarnia', '#ffffff', 123),
      'panel-api/program/card-image',
      'POST',
      { description: 'kwiaciarnia', ink: '#ffffff', seed: 123 },
    ],
  ] as const)('%s wysyła poprawny kontrakt', async (_name, call, path, method, body) => {
    await call()

    expect(mocks.invoke).toHaveBeenCalledWith(path, { method, body })
  })

  it('generator pomija seed, jeśli nie został podany', async () => {
    await generateCardImage('kawiarnia', '#000000')

    expect(mocks.invoke).toHaveBeenCalledWith('panel-api/program/card-image', {
      method: 'POST',
      body: { description: 'kawiarnia', ink: '#000000' },
    })
  })

  it('zachowuje kod, komunikat i pola z odpowiedzi HTTP Edge Function', async () => {
    const context = {
      json: vi.fn().mockResolvedValue({
        error: {
          code: 'validation_failed',
          message: 'Uzupełnij dane.',
          fields: [{ field: 'logo_url', message: 'logo wymagane' }],
        },
      }),
    }
    mocks.invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(context) })

    await expect(publishProgram()).rejects.toMatchObject({
      name: 'PanelError',
      code: 'validation_failed',
      message: 'Uzupełnij dane.',
      fields: [{ field: 'logo_url', message: 'logo wymagane' }],
    })
  })

  it('dla nieczytelnego body HTTP zwraca bezpieczny internal_error', async () => {
    const context = { json: vi.fn().mockRejectedValue(new Error('bad json')) }
    mocks.invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(context) })

    await expect(publishProgram()).rejects.toMatchObject({
      code: 'internal_error',
      message: 'Wystąpił błąd serwera.',
    })
  })

  it('błąd bez odpowiedzi mapuje na network_error', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error('Failed to fetch') })

    await expect(publishProgram()).rejects.toMatchObject({
      code: 'network_error',
      message: 'Nie udało się połączyć z serwerem.',
    })
  })
})
