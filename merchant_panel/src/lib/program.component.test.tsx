// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { merchantFixture, programFixture } from '../test/fixtures'
import { PanelError } from './errors'
import { RequireProgram, RootRedirect, useProgram } from './program'

const mocks = vi.hoisted(() => ({
  useAsync: vi.fn(),
  useSession: vi.fn(),
}))

vi.mock('./useAsync', () => ({ useAsync: mocks.useAsync }))
vi.mock('./session', () => ({ useSession: mocks.useSession }))

function ProgramProbe() {
  const { merchant, program } = useProgram()
  return <h1 id="screen-title" tabIndex={-1}>{merchant.email}|{program.status}</h1>
}

function renderProgramRoute(child: React.ReactNode = <ProgramProbe />, entry = '/protected') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route element={<RequireProgram />}>
          <Route path="/protected" element={child} />
          <Route path="/" element={<RootRedirect />} />
          <Route path="/karta" element={<h1 id="screen-title">Karta</h1>} />
          <Route path="/klienci" element={<h1 id="screen-title">Klienci</h1>} />
        </Route>
        <Route path="/onboarding" element={<h1>Onboarding</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireProgram i RootRedirect', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.useSession.mockReturnValue({ logout: vi.fn() })
  })

  it('pokazuje shell ze szkieletem podczas ładowania', () => {
    mocks.useAsync.mockReturnValue({ data: null, error: null, loading: true, reload: vi.fn() })

    renderProgramRoute()

    expect(screen.getByRole('main')).toContainElement(document.querySelector('[aria-busy="true"]'))
    expect(screen.queryByText(/owner@example/)).not.toBeInTheDocument()
  })

  it('przenosi nieukończony onboarding na właściwy ekran', async () => {
    mocks.useAsync.mockReturnValue({
      data: null,
      error: new PanelError({ code: 'not_found', message: 'Nie znaleziono zasobu.' }),
      loading: false,
      reload: vi.fn(),
    })

    renderProgramRoute()

    expect(await screen.findByRole('heading', { name: 'Onboarding' })).toBeInTheDocument()
  })

  it('pokazuje błąd w shellu i ponawia pobranie', async () => {
    const reload = vi.fn()
    mocks.useAsync.mockReturnValue({
      data: null,
      error: new PanelError({ code: 'network_error', message: 'offline' }),
      loading: false,
      reload,
    })
    renderProgramRoute()
    const user = userEvent.setup()

    expect(screen.getByText('Nie udało się połączyć z serwerem.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('udostępnia własnego merchanta i program ekranom potomnym', () => {
    mocks.useAsync.mockReturnValue({
      data: { merchant: merchantFixture(), program: programFixture({ status: 'published' }) },
      error: null,
      loading: false,
      reload: vi.fn(),
    })

    renderProgramRoute()

    expect(screen.getByRole('heading', { name: 'owner@example.test|published' })).toBeInTheDocument()
  })

  it.each([
    ['draft', 'Karta'],
    ['published', 'Klienci'],
  ] as const)('root dla statusu %s prowadzi do ekranu %s', async (status, destination) => {
    mocks.useAsync.mockReturnValue({
      data: { merchant: merchantFixture(), program: programFixture({ status }) },
      error: null,
      loading: false,
      reload: vi.fn(),
    })

    renderProgramRoute(<Outlet />, '/')

    expect(await screen.findByRole('heading', { name: destination })).toBeInTheDocument()
  })
})
