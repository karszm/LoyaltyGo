import { describe, expect, it, vi } from 'vitest'
import { copyToClipboard, mapPublishFieldErrors } from './publish'

describe('mapPublishFieldErrors', () => {
  it('maps display_name to the screen sentence, anchored to #prog-name', () => {
    expect(mapPublishFieldErrors([{ field: 'display_name', message: 'nazwa wyświetlana jest wymagana' }])).toEqual([
      { id: 'prog-name', message: 'Podaj nazwę, która ma się pojawić na karcie.' },
    ])
  })

  it('maps logo_url to the screen sentence, anchored to #prog-logo', () => {
    expect(mapPublishFieldErrors([{ field: 'logo_url', message: 'logo jest wymagane' }])).toEqual([
      { id: 'prog-logo', message: 'Wgraj logo. Bez niego karta w portfelu nie powstanie.' },
    ])
  })

  it('falls back to the backend message, unanchored, for a field this screen does not know', () => {
    expect(mapPublishFieldErrors([{ field: 'some_future_field', message: 'backend detail' }])).toEqual([
      { message: 'backend detail' },
    ])
  })

  it('preserves order across a mix of known and unknown fields', () => {
    const result = mapPublishFieldErrors([
      { field: 'logo_url', message: 'logo jest wymagane' },
      { field: 'some_future_field', message: 'backend detail' },
      { field: 'display_name', message: 'nazwa wyświetlana jest wymagana' },
    ])
    expect(result.map((r) => r.id)).toEqual(['prog-logo', undefined, 'prog-name'])
  })
})

describe('copyToClipboard', () => {
  it('returns true when the Clipboard API succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await expect(copyToClipboard('lgo_pk_abc')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('lgo_pk_abc')
    vi.unstubAllGlobals()
  })

  it('returns false, not a thrown rejection, when the Clipboard API refuses', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await expect(copyToClipboard('lgo_pk_abc')).resolves.toBe(false)
    vi.unstubAllGlobals()
  })
})
