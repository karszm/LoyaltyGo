// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred, programFixture, transactionFixture } from '../test/fixtures'
import Transactions from './Transactions'

const mocks = vi.hoisted(() => ({
  useProgram: vi.fn(),
  listTransactions: vi.fn(),
  countMembers: vi.fn(),
}))

vi.mock('../lib/program', () => ({ useProgram: mocks.useProgram }))
vi.mock('../lib/db', () => ({
  listTransactions: mocks.listTransactions,
  countMembers: mocks.countMembers,
}))

function renderTransactions() {
  return render(<MemoryRouter><Transactions /></MemoryRouter>)
}

describe('Transactions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.useProgram.mockReturnValue({ program: programFixture({ status: 'published' }) })
    mocks.listTransactions.mockResolvedValue({ rows: [transactionFixture()], count: 1 })
    mocks.countMembers.mockResolvedValue(0)
  })

  it('dla draftu pokazuje bramkę bez pobierania danych', () => {
    mocks.useProgram.mockReturnValue({ program: programFixture({ status: 'draft' }) })
    renderTransactions()

    expect(screen.getByText('Program jest jeszcze w wersji roboczej.')).toBeInTheDocument()
    expect(mocks.listTransactions).not.toHaveBeenCalled()
  })

  it('pokazuje skeleton i zajęty region podczas pobierania', () => {
    mocks.listTransactions.mockReturnValue(deferred<never>().promise)
    renderTransactions()

    expect(screen.getByLabelText('Historia transakcji')).toBeInTheDocument()
    expect(document.getElementById('transactions-region')).toHaveAttribute('aria-busy', 'true')
  })

  it('dla pustej historii bez klientów prowadzi do kodu QR', async () => {
    mocks.listTransactions.mockResolvedValue({ rows: [], count: 0 })
    renderTransactions()

    expect(await screen.findByText('Nikt jeszcze nie dołączył do programu.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Przejdź do kodu QR' })).toHaveAttribute('href', '/zaproszenie')
  })

  it('dla pustej historii z klientami prowadzi do integracji', async () => {
    mocks.listTransactions.mockResolvedValue({ rows: [], count: 0 })
    mocks.countMembers.mockResolvedValue(2)
    renderTransactions()

    expect(await screen.findByText('Nie ma jeszcze żadnej transakcji.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Przejdź do integracji' })).toHaveAttribute('href', '/integracja')
  })

  it('nie liczy klientów, gdy istnieją transakcje', async () => {
    renderTransactions()

    expect(await screen.findByText('Anna Kowalska')).toBeInTheDocument()
    expect(mocks.countMembers).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Transakcji: 1')
  })

  it('pokazuje anulowaną transakcję z odwróconymi punktami', async () => {
    mocks.listTransactions.mockResolvedValue({
      rows: [transactionFixture({ status: 'cancelled', points_awarded: 10, points_reverted: 8, correction: 2 })],
      count: 1,
    })
    renderTransactions()

    expect(await screen.findByText('Anulowana')).toBeInTheDocument()
    expect(screen.getByText('−8')).toBeInTheDocument()
  })

  it('pokazuje opóźnioną synchronizację w tekście dostępnym dla czytnika', async () => {
    mocks.listTransactions.mockResolvedValue({
      rows: [transactionFixture({ delayed_sync: true })],
      count: 1,
    })
    renderTransactions()

    expect(await screen.findByText('Z opóźnieniem')).toBeInTheDocument()
    expect(screen.getByText(/Kasa działała bez internetu/)).toBeInTheDocument()
  })

  it('odróżnia korektę ręczną od zakupu', async () => {
    mocks.listTransactions.mockResolvedValue({
      rows: [transactionFixture({ source: 'manual', amount: null, softpos_transaction_id: null, description: 'Bonus za polecenie' })],
      count: 1,
    })
    renderTransactions()

    expect(await screen.findByText('Korekta ręczna')).toBeInTheDocument()
    expect(screen.getByText('Bonus za polecenie')).toBeInTheDocument()
    expect(screen.getByText('brak — korekta ręczna')).toBeInTheDocument()
  })

  it('po błędzie sieci wykonuje retry', async () => {
    mocks.listTransactions
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ rows: [transactionFixture()], count: 1 })
    renderTransactions()

    expect(await screen.findByText('Nie udało się połączyć z serwerem.')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))
    expect(await screen.findByText('Anna Kowalska')).toBeInTheDocument()
    expect(mocks.listTransactions).toHaveBeenCalledTimes(2)
  })

  it('informuje o pokazaniu 200 ostatnich rekordów', async () => {
    mocks.listTransactions.mockResolvedValue({ rows: [transactionFixture()], count: 201 })
    renderTransactions()

    expect(await screen.findByText('Pokazujemy 200 ostatnich transakcji.')).toBeInTheDocument()
  })
})
