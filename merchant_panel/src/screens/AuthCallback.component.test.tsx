// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthCallback from './AuthCallback'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getAuthHashError: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}))

vi.mock('../lib/authHash', () => ({
  getAuthHashError: mocks.getAuthHashError,
}))

function Destination({ label }: { label: string }) {
  const location = useLocation()
  return (
    <div>
      <h1>{label}</h1>
      <output data-testid="location">
        {location.pathname}{location.search}|{JSON.stringify(location.state)}
      </output>
    </div>
  )
}

function renderCallback(entry = '/auth') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/auth" element={<AuthCallback />} />
        <Route path="/login" element={<Destination label="Login" />} />
        <Route path="/karta" element={<Destination label="Karta" />} />
        <Route path="/" element={<Destination label="Start" />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AuthCallback', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getAuthHashError.mockReturnValue(null)
    mocks.getSession.mockResolvedValue({ data: { session: null } })
  })

  afterEach(() => cleanup())

  it('przenosi błąd magic linku na ekran logowania', async () => {
    mocks.getAuthHashError.mockReturnValue({ code: 'otp_expired' })

    renderCallback('/auth?returnTo=%2Fkarta')

    expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('"linkFailed":true')
    expect(mocks.getSession).not.toHaveBeenCalled()
  })

  it('po utworzeniu sesji wraca na bezpieczną trasę', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } })

    renderCallback('/auth?returnTo=%2Fkarta')

    expect(await screen.findByRole('heading', { name: 'Karta' })).toBeInTheDocument()
  })

  it('nie wykonuje zewnętrznego przekierowania z returnTo', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } })

    renderCallback('/auth?returnTo=https%3A%2F%2Fevil.example')

    expect(await screen.findByRole('heading', { name: 'Start' })).toBeInTheDocument()
  })

  it('ręcznie otwarty callback bez sesji wraca na login bez alarmu o linku', async () => {
    renderCallback()

    expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/login|null')
  })
})
