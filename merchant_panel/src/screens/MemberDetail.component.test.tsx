// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PanelError } from '../lib/errors'
import { deferred, memberFixture, programFixture, transactionFixture } from '../test/fixtures'
import MemberDetail from './MemberDetail'

const mocks = vi.hoisted(() => ({
  useProgram: vi.fn(),
  getMemberById: vi.fn(),
  listTransactions: vi.fn(),
  adjustPoints: vi.fn(),
}))

vi.mock('../lib/program', () => ({ useProgram: mocks.useProgram }))
vi.mock('../lib/db', () => ({
  getMemberById: mocks.getMemberById,
  listTransactions: mocks.listTransactions,
}))
vi.mock('../lib/api', () => ({ adjustPoints: mocks.adjustPoints }))

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/klienci/member-1']}>
      <Routes>
        <Route path="/klienci/:id" element={<MemberDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('MemberDetail', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.useProgram.mockReturnValue({ program: programFixture({ status: 'published' }) })
    mocks.getMemberById.mockResolvedValue(memberFixture())
    mocks.listTransactions.mockResolvedValue({ rows: [], count: 0 })
    mocks.adjustPoints.mockResolvedValue({ id: 'adjustment-1', points_delta: 12, points_balance: 54 })
  })

  it('dla draftu pokazuje bramkę bez pobierania klienta', () => {
    mocks.useProgram.mockReturnValue({ program: programFixture({ status: 'draft' }) })
    renderDetail()

    expect(screen.getByText('Program jest jeszcze w wersji roboczej.')).toBeInTheDocument()
    expect(mocks.getMemberById).not.toHaveBeenCalled()
    expect(mocks.listTransactions).not.toHaveBeenCalled()
  })

  it('pokazuje dane klienta oraz pustą historię', async () => {
    renderDetail()

    expect(await screen.findByRole('heading', { name: 'Anna Kowalska' })).toBeInTheDocument()
    expect(screen.getByText(/Saldo:/)).toHaveTextContent('42 pkt')
    expect(screen.getByText(/anna@example\.test/)).toBeInTheDocument()
    expect(screen.getByText('Ten klient nie ma jeszcze żadnej transakcji.')).toBeInTheDocument()
    expect(mocks.getMemberById).toHaveBeenCalledWith('member-1')
    expect(mocks.listTransactions).toHaveBeenCalledWith('member-1')
  })

  it('pokazuje blokadę klienta i jego transakcje', async () => {
    mocks.getMemberById.mockResolvedValue(memberFixture({ status: 'blocked' }))
    mocks.listTransactions.mockResolvedValue({ rows: [transactionFixture()], count: 1 })
    renderDetail()

    expect(await screen.findByText('Blokada')).toBeInTheDocument()
    expect(screen.getByText('pos-1')).toBeInTheDocument()
    expect(screen.getByLabelText('Historia transakcji klienta')).toBeInTheDocument()
  })

  it('nie ujawnia, czy klient nie istnieje, czy należy do innego programu', async () => {
    mocks.getMemberById.mockRejectedValue(
      new PanelError({ code: 'not_found', message: 'Nie znaleziono zasobu.' }),
    )
    renderDetail()

    expect(await screen.findByText('Nie znaleziono klienta.')).toBeInTheDocument()
    expect(screen.getByText('Ten klient nie istnieje albo nie należy do Twojego programu.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Wróć do listy klientów' })).toHaveAttribute('href', '/klienci')
  })

  it.each(['', '0', '1.5'])(`odrzuca niepoprawną korektę punktów „%s”`, async (delta) => {
    renderDetail()
    await screen.findByRole('heading', { name: 'Anna Kowalska' })
    const user = userEvent.setup()

    if (delta) await user.type(screen.getByLabelText('Punkty'), delta)
    await user.type(screen.getByLabelText('Opis usługi'), 'Bonus')
    await user.click(screen.getByRole('button', { name: 'Zapisz korektę' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Podaj liczbę całkowitą różną od zera')
    expect(mocks.adjustPoints).not.toHaveBeenCalled()
  })

  it('wymaga opisu korekty', async () => {
    renderDetail()
    await screen.findByRole('heading', { name: 'Anna Kowalska' })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Punkty'), '-30')
    await user.click(screen.getByRole('button', { name: 'Zapisz korektę' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Opisz, za co przyznajesz lub odejmujesz punkty.')
    expect(mocks.adjustPoints).not.toHaveBeenCalled()
  })

  it('zapisuje korektę, ogłasza saldo i odświeża klienta oraz historię', async () => {
    renderDetail()
    await screen.findByRole('heading', { name: 'Anna Kowalska' })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Punkty'), '12')
    await user.type(screen.getByLabelText('Opis usługi'), '  Bonus za polecenie  ')
    await user.click(screen.getByRole('button', { name: 'Zapisz korektę' }))

    expect(mocks.adjustPoints).toHaveBeenCalledWith('member-1', 12, 'Bonus za polecenie')
    expect(await screen.findByRole('status')).toHaveTextContent('Zapisano korektę 12 pkt. Nowe saldo: 54 pkt.')
    expect(screen.getByLabelText('Punkty')).toHaveValue(null)
    expect(screen.getByLabelText('Opis usługi')).toHaveValue('')
    expect(screen.getByLabelText('Punkty')).toHaveFocus()
    await waitFor(() => expect(mocks.getMemberById).toHaveBeenCalledTimes(2))
    expect(mocks.listTransactions).toHaveBeenCalledTimes(2)
  })

  it('blokuje formularz w czasie zapisu', async () => {
    mocks.adjustPoints.mockReturnValue(deferred<never>().promise)
    renderDetail()
    await screen.findByRole('heading', { name: 'Anna Kowalska' })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Punkty'), '12')
    await user.type(screen.getByLabelText('Opis usługi'), 'Bonus')
    await user.click(screen.getByRole('button', { name: 'Zapisz korektę' }))

    expect(screen.getByRole('button', { name: 'Zapisywanie…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Zapisywanie…' })).toHaveAttribute('aria-busy', 'true')
    expect(mocks.adjustPoints).toHaveBeenCalledTimes(1)
  })

  it('zachowuje dane formularza i pokazuje komunikat backendu po błędzie', async () => {
    mocks.adjustPoints.mockRejectedValue(
      new PanelError({ code: 'insufficient_points', message: 'Klient ma tylko 10 punktów.' }),
    )
    renderDetail()
    await screen.findByRole('heading', { name: 'Anna Kowalska' })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Punkty'), '-30')
    await user.type(screen.getByLabelText('Opis usługi'), 'Zwrot')
    await user.click(screen.getByRole('button', { name: 'Zapisz korektę' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Klient ma tylko 10 punktów.')
    expect(screen.getByLabelText('Punkty')).toHaveValue(-30)
    expect(screen.getByLabelText('Opis usługi')).toHaveValue('Zwrot')
    expect(screen.getByRole('button', { name: 'Zapisz korektę' })).toBeEnabled()
  })

  it('pokazuje błąd historii i ponawia tylko jej pobranie', async () => {
    mocks.listTransactions
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ rows: [transactionFixture()], count: 1 })
    renderDetail()

    expect(await screen.findByText('Nie udało się połączyć z serwerem.')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))

    expect(await screen.findByText('pos-1')).toBeInTheDocument()
    expect(mocks.getMemberById).toHaveBeenCalledTimes(1)
    expect(mocks.listTransactions).toHaveBeenCalledTimes(2)
  })
})
