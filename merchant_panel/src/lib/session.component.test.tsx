// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react'
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred } from '../test/fixtures'
import { toPanelError } from './errors'
import { RequireAuth, SessionProvider, useSession } from './session'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
  authChange: null as null | ((event: string, session: unknown) => void),
}))

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      signOut: mocks.signOut,
    },
  },
}))

function LoginProbe() {
  const location = useLocation()
  return <h1>Login:{location.search}</h1>
}

function SessionProbe() {
  const { session, loading } = useSession()
  return <output>{loading ? 'loading' : session ? `user:${session.user.id}` : 'anonymous'}</output>
}

function renderProtected(entry = '/protected?tab=branding') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <SessionProvider>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/protected" element={<h1 id="screen-title">Chroniona treść</h1>} />
          </Route>
          <Route path="/login" element={<LoginProbe />} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  )
}

describe('SessionProvider i RequireAuth', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.authChange = null
    mocks.getSession.mockResolvedValue({ data: { session: null } })
    mocks.onAuthStateChange.mockImplementation((callback) => {
      mocks.authChange = callback
      return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }
    })
  })

  afterEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('nie pokazuje chronionej treści przed zakończeniem kontroli sesji', () => {
    mocks.getSession.mockReturnValue(deferred<never>().promise)

    renderProtected()

    expect(screen.queryByRole('heading', { name: 'Chroniona treść' })).not.toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  })

  it('bez sesji zachowuje pełną trasę w returnTo', async () => {
    renderProtected()

    expect(await screen.findByRole('heading')).toHaveTextContent(
      'Login:?returnTo=%2Fprotected%3Ftab%3Dbranding',
    )
  })

  it('z aktywną sesją renderuje chroniony ekran', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
    })

    renderProtected()

    expect(await screen.findByRole('heading', { name: 'Chroniona treść' })).toBeInTheDocument()
  })

  it('aktualizuje kontekst po zdarzeniu Auth', async () => {
    render(
      <MemoryRouter>
        <SessionProvider><SessionProbe /></SessionProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByText('anonymous')).toBeInTheDocument()

    act(() => mocks.authChange?.('SIGNED_IN', { user: { id: 'user-2' } }))

    expect(await screen.findByText('user:user-2')).toBeInTheDocument()
    act(() => mocks.authChange?.('SIGNED_OUT', null))
    expect(await screen.findByText('anonymous')).toBeInTheDocument()
  })

  it('przenosi 401 z działającego ekranu na login z returnTo', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } })
    window.history.replaceState({}, '', '/protected?tab=branding')
    render(
      <BrowserRouter>
        <SessionProvider>
          <Routes>
            <Route element={<RequireAuth />}>
              <Route path="/protected" element={<h1 id="screen-title">Chroniona treść</h1>} />
            </Route>
            <Route path="/login" element={<LoginProbe />} />
          </Routes>
        </SessionProvider>
      </BrowserRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'Chroniona treść' })).toBeInTheDocument()

    act(() => {
      toPanelError({ code: 'PGRST301', message: 'jwt expired', details: '', hint: '' })
    })

    expect(await screen.findByRole('heading')).toHaveTextContent(
      'Login:?returnTo=%2Fprotected%3Ftab%3Dbranding',
    )
  })

  it('wypisuje subskrypcję Auth przy odmontowaniu', () => {
    const view = render(
      <MemoryRouter>
        <SessionProvider><SessionProbe /></SessionProvider>
      </MemoryRouter>,
    )

    view.unmount()

    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1)
  })
})
