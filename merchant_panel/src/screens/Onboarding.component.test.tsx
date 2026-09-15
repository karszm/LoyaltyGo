// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Onboarding from './Onboarding'

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  createMerchant: vi.fn(),
  createProgram: vi.fn(),
  loadDraft: vi.fn(),
  saveDraft: vi.fn(),
  clearDraft: vi.fn(),
}))

vi.mock('../lib/session', () => ({
  useSession: mocks.useSession,
}))

vi.mock('../lib/db', () => ({
  createMerchant: mocks.createMerchant,
  createProgram: mocks.createProgram,
}))

vi.mock('../lib/formDraft', () => ({
  loadDraft: mocks.loadDraft,
  saveDraft: mocks.saveDraft,
  clearDraft: mocks.clearDraft,
}))

function renderOnboarding() {
  return render(
    <MemoryRouter initialEntries={['/onboarding']}>
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/" element={<h1>Kreator karty</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Onboarding — pierwsze logowanie', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.useSession.mockReturnValue({
      session: {
        user: {
          id: 'user-1',
          email: 'owner@example.test',
        },
      },
      loading: false,
      logout: vi.fn(),
    })
    mocks.loadDraft.mockReturnValue('')
    mocks.createMerchant.mockResolvedValue({ id: 'merchant-1' })
    mocks.createProgram.mockResolvedValue({ id: 'program-1' })
  })

  it('ładuje wersję roboczą powiązaną z kontem', () => {
    renderOnboarding()

    expect(screen.getByRole('heading', { name: 'Jak nazywa się Twoja firma?' })).toBeInTheDocument()
    expect(mocks.loadDraft).toHaveBeenCalledWith('user-1', 'onboarding.companyName')
  })

  it('przywraca wcześniej zapisaną nazwę firmy', () => {
    mocks.loadDraft.mockReturnValue('Studio Forma')

    renderOnboarding()

    expect(screen.getByLabelText('Nazwa firmy')).toHaveValue('Studio Forma')
  })

  it('waliduje pustą nazwę firmy, ustawia fokus i nie tworzy danych', async () => {
    renderOnboarding()
    const user = userEvent.setup()
    const input = screen.getByLabelText('Nazwa firmy')

    await user.type(input, '   ')
    await user.click(screen.getByRole('button', { name: 'Dalej' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Podaj nazwę firmy.')
    expect(input).toHaveFocus()
    expect(mocks.createMerchant).not.toHaveBeenCalled()
    expect(mocks.createProgram).not.toHaveBeenCalled()
  })

  it('zapisuje roboczą nazwę podczas wpisywania', async () => {
    renderOnboarding()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Nazwa firmy'), 'Studio Forma')

    expect(mocks.saveDraft).toHaveBeenLastCalledWith(
      'user-1',
      'onboarding.companyName',
      'Studio Forma',
    )
  })

  it('tworzy firmę, następnie program i dopiero wtedy przechodzi do kreatora', async () => {
    renderOnboarding()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Nazwa firmy'), '  Studio Forma  ')
    await user.click(screen.getByRole('button', { name: 'Dalej' }))

    expect(await screen.findByRole('heading', { name: 'Kreator karty' })).toBeInTheDocument()
    expect(mocks.createMerchant).toHaveBeenCalledWith(
      'user-1',
      'owner@example.test',
      'Studio Forma',
    )
    expect(mocks.createProgram).toHaveBeenCalledWith('merchant-1')
    expect(mocks.clearDraft).toHaveBeenCalledWith('user-1', 'onboarding.companyName')

    expect(mocks.createMerchant.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createProgram.mock.invocationCallOrder[0],
    )
    expect(mocks.createProgram.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.clearDraft.mock.invocationCallOrder[0],
    )
  })

  it('nie tworzy programu i pokazuje błąd, jeśli nie uda się utworzyć firmy', async () => {
    mocks.createMerchant.mockRejectedValueOnce(new Error('offline'))
    renderOnboarding()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Nazwa firmy'), 'Studio Forma')
    await user.click(screen.getByRole('button', { name: 'Dalej' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się połączyć z serwerem.')
    expect(mocks.createProgram).not.toHaveBeenCalled()
    expect(mocks.clearDraft).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Dalej' })).toBeEnabled()
  })

  it('zostawia wersję roboczą i pokazuje błąd, jeśli nie uda się utworzyć programu', async () => {
    mocks.createProgram.mockRejectedValueOnce(new Error('offline'))
    renderOnboarding()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Nazwa firmy'), 'Studio Forma')
    await user.click(screen.getByRole('button', { name: 'Dalej' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się połączyć z serwerem.')
    expect(mocks.createMerchant).toHaveBeenCalledTimes(1)
    expect(mocks.createProgram).toHaveBeenCalledWith('merchant-1')
    expect(mocks.clearDraft).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Kreator karty' })).not.toBeInTheDocument()
  })

  it('blokuje ponowne wysłanie formularza podczas zapisu', async () => {
    mocks.createMerchant.mockReturnValue(new Promise(() => undefined))
    renderOnboarding()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Nazwa firmy'), 'Studio Forma')
    const submitButton = screen.getByRole('button', { name: 'Dalej' })
    await user.click(submitButton)

    await waitFor(() => expect(submitButton).toBeDisabled())
    expect(submitButton).toHaveAttribute('aria-busy', 'true')
    expect(submitButton).toHaveTextContent('Zapisywanie…')
    expect(mocks.createMerchant).toHaveBeenCalledTimes(1)
  })
})
