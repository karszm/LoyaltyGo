// No data-fetching library (five screens, no shared cache — see task-10-brief.md): this is
// the one hook every screen uses to turn a promise into loading/data/error state for
// DataRegion (panel-shell-design.md §6).
import { useCallback, useEffect, useRef, useState } from 'react'
import { PanelError, toPanelError } from './errors'

export interface AsyncState<T> {
  data: T | null
  error: PanelError | null
  loading: boolean
  /** Re-runs `fn`, e.g. from the error state's "Spróbuj ponownie" button. */
  reload: () => void
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<PanelError | null>(null)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fnRef
      .current()
      .then((result) => {
        if (cancelled) return
        setData(result)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof PanelError ? err : toPanelError(err))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  return { data, error, loading, reload }
}
