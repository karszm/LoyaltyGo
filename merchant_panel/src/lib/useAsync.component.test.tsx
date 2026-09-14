// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deferred } from '../test/fixtures'
import { useAsync } from './useAsync'

afterEach(() => {
  cleanup()
})

describe('useAsync', () => {
  it('przechodzi ze stanu ładowania do danych', async () => {
    const request = deferred<string>()
    const fn = vi.fn(() => request.promise)
    const { result } = renderHook(() => useAsync(fn, []))

    expect(result.current).toMatchObject({ data: null, error: null, loading: true })

    act(() => request.resolve('gotowe'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBe('gotowe')
    expect(result.current.error).toBeNull()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('normalizuje odrzucony request do PanelError', async () => {
    const { result } = renderHook(() => useAsync(() => Promise.reject(new Error('offline')), []))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.data).toBeNull()
    expect(result.current.error).toMatchObject({
      name: 'PanelError',
      code: 'network_error',
      message: 'Nie udało się połączyć z serwerem.',
    })
  })

  it('reload ponawia operację i czyści poprzedni błąd', async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('po retry')
    const { result } = renderHook(() => useAsync(fn, []))
    await waitFor(() => expect(result.current.error?.code).toBe('network_error'))

    act(() => result.current.reload())

    expect(result.current.loading).toBe(true)
    expect(result.current.error).toBeNull()
    await waitFor(() => expect(result.current.data).toBe('po retry'))
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('nie pozwala starej odpowiedzi nadpisać wyniku po zmianie zależności', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const fn = vi.fn((id: string) => (id === 'first' ? first.promise : second.promise))
    const { result, rerender } = renderHook(
      ({ id }) => useAsync(() => fn(id), [id]),
      { initialProps: { id: 'first' } },
    )

    rerender({ id: 'second' })
    act(() => second.resolve('nowszy wynik'))
    await waitFor(() => expect(result.current.data).toBe('nowszy wynik'))

    act(() => first.resolve('stary wynik'))
    await Promise.resolve()

    expect(result.current.data).toBe('nowszy wynik')
  })

  it('nie aktualizuje wyniku po odmontowaniu', async () => {
    const request = deferred<string>()
    const { result, unmount } = renderHook(() => useAsync(() => request.promise, []))

    expect(result.current.loading).toBe(true)
    unmount()
    act(() => request.resolve('za późno'))
    await Promise.resolve()

    expect(result.current.data).toBeNull()
  })
})
