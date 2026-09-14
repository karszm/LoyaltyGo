// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred, memberFixture, programFixture } from '../test/fixtures'
import Members from './Members'

const mocks = vi.hoisted(() => ({
  useProgram: vi.fn(),
  listMembers: vi.fn(),
}))

vi.mock('../lib/program', () => ({ useProgram: mocks.useProgram }))
vi.mock('../lib/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/db')>()),
  listMembers: mocks.listMembers,
}))

function renderMembers() {
  return render(<MemoryRouter><Members /></MemoryRouter>)
}

describe('Members', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.useProgram.mockReturnValue({ program: programFixture({ status: 'published' }) })
    mocks.listMembers.mockResolvedValue({ rows: [memberFixture()], count: 1 })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('dla programu draft pokazuje bramkę i nie pobiera klientów', () => {
    mocks.useProgram.mockReturnValue({ program: programFixture({ status: 'draft' }) })
    renderMembers()

    expect(screen.getByText('Program jest jeszcze w wersji roboczej.')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Szukaj klienta/)).not.toBeInTheDocument()
    expect(mocks.listMembers).not.toHaveBeenCalled()
  })

  it('pokazuje skeleton podczas pobierania', () => {
    mocks.listMembers.mockReturnValue(deferred<never>().promise)
    renderMembers()

    expect(screen.getByLabelText('Lista klientów')).toBeInTheDocument()
    expect(document.getElementById('members-region')).toHaveAttribute('aria-busy', 'true')
  })

  it('renderuje dane, licznik, blokadę i link do szczegółu', async () => {
    mocks.listMembers.mockResolvedValue({
      rows: [memberFixture({ status: 'blocked', points_balance: 75 })],
      count: 1,
    })
    renderMembers()

    expect(await screen.findByRole('link', { name: /Anna Kowalska/ })).toHaveAttribute('href', '/klienci/member-1')
    expect(screen.getByText('75')).toBeInTheDocument()
    expect(screen.getByText('Blokada')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Klientów: 1'))
  })

  it('pokazuje CTA do zaproszenia dla pustej listy', async () => {
    mocks.listMembers.mockResolvedValue({ rows: [], count: 0 })
    renderMembers()

    expect(await screen.findByText('Nikt jeszcze nie dołączył do programu.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Przejdź do kodu QR' })).toHaveAttribute('href', '/zaproszenie')
  })

  it('wyszukuje dopiero po debounce i sanitizuje frazę', async () => {
    renderMembers()
    await waitFor(() => expect(mocks.listMembers).toHaveBeenCalledWith(''))

    fireEvent.change(screen.getByLabelText(/Szukaj klienta/), { target: { value: '  Kowalska  ' } })
    expect(mocks.listMembers).toHaveBeenCalledTimes(1)

    await waitFor(() => expect(mocks.listMembers).toHaveBeenLastCalledWith('Kowalska'))
  })

  it('po braku wyników czyści wyszukiwanie i przywraca fokus', async () => {
    mocks.listMembers
      .mockResolvedValueOnce({ rows: [memberFixture()], count: 1 })
      .mockResolvedValueOnce({ rows: [], count: 0 })
      .mockResolvedValueOnce({ rows: [memberFixture()], count: 1 })
    renderMembers()
    const input = screen.getByLabelText(/Szukaj klienta/)
    fireEvent.change(input, { target: { value: 'Nieistniejący' } })
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 260)))

    expect(await screen.findByText('Brak wyników dla „Nieistniejący”.')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Wyczyść wyszukiwanie' }))

    expect(input).toHaveFocus()
    expect(input).toHaveValue('')
  })

  it('pokazuje błąd sieci i ponawia pobranie', async () => {
    mocks.listMembers
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ rows: [memberFixture()], count: 1 })
    renderMembers()

    expect(await screen.findByText('Nie udało się połączyć z serwerem.')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))

    expect(await screen.findByRole('link', { name: /Anna Kowalska/ })).toBeInTheDocument()
    expect(mocks.listMembers).toHaveBeenCalledTimes(2)
  })

  it('informuje o ograniczeniu listy do 200 rekordów', async () => {
    mocks.listMembers.mockResolvedValue({ rows: [memberFixture()], count: 250 })
    renderMembers()

    expect(await screen.findByText('Pokazujemy 200 klientów z 250. Użyj wyszukiwania, żeby znaleźć konkretną osobę.')).toBeInTheDocument()
  })
})
