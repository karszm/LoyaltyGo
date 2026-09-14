// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { programFixture } from '../test/fixtures'
import Invite from './Invite'

const mocks = vi.hoisted(() => ({
  useProgram: vi.fn(),
  toDataURL: vi.fn(),
  copyToClipboard: vi.fn(),
}))

vi.mock('../lib/program', () => ({ useProgram: mocks.useProgram }))
vi.mock('../lib/publish', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/publish')>()),
  copyToClipboard: mocks.copyToClipboard,
}))
vi.mock('qrcode', () => ({ default: { toDataURL: mocks.toDataURL } }))

function renderInvite() {
  return render(<MemoryRouter><Invite /></MemoryRouter>)
}

describe('Invite', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.useProgram.mockReturnValue({
      program: programFixture({ status: 'published', invite_code: 'invite-123' }),
    })
    mocks.toDataURL.mockResolvedValue('data:image/png;base64,QR')
    mocks.copyToClipboard.mockResolvedValue(true)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it.each(['draft', 'suspended', 'closed'] as const)('nie generuje QR dla statusu %s', (status) => {
    mocks.useProgram.mockReturnValue({ program: programFixture({ status }) })
    renderInvite()

    expect(screen.getByText('Program jest jeszcze w wersji roboczej.')).toBeInTheDocument()
    expect(mocks.toDataURL).not.toHaveBeenCalled()
  })

  it('generuje arkusz QR z właściwymi parametrami', async () => {
    renderInvite()

    expect(await screen.findByRole('region', { name: 'Arkusz do wydruku' })).toBeInTheDocument()
    expect(mocks.toDataURL).toHaveBeenCalledTimes(1)
    expect(mocks.toDataURL.mock.calls[0][0]).toContain('invite-123')
    expect(mocks.toDataURL.mock.calls[0][1]).toEqual({ width: 1024, errorCorrectionLevel: 'M' })
    expect(document.querySelector('.invite-sheet__qr')).toHaveAttribute('src', 'data:image/png;base64,QR')
  })

  it('pokazuje błąd generowania i pozwala ponowić', async () => {
    mocks.toDataURL
      .mockRejectedValueOnce(new Error('QR failed'))
      .mockResolvedValueOnce('data:image/png;base64,QR')
    renderInvite()

    expect(await screen.findByText('Nie udało się wygenerować kodu QR.')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))

    expect(await screen.findByRole('region', { name: 'Arkusz do wydruku' })).toBeInTheDocument()
    expect(mocks.toDataURL).toHaveBeenCalledTimes(2)
  })

  it('kopiuje adres i ogłasza sukces', async () => {
    renderInvite()
    await screen.findByRole('region', { name: 'Arkusz do wydruku' })

    await userEvent.setup().click(screen.getByRole('button', { name: 'Kopiuj adres zaproszenia' }))

    expect(mocks.copyToClipboard).toHaveBeenCalledTimes(1)
    expect(mocks.copyToClipboard.mock.calls[0][0]).toContain('invite-123')
    expect(screen.getByRole('status')).toHaveTextContent('Skopiowano')
  })

  it('po błędzie kopiowania podaje instrukcję ręczną', async () => {
    mocks.copyToClipboard.mockResolvedValue(false)
    renderInvite()
    await screen.findByRole('region', { name: 'Arkusz do wydruku' })

    await userEvent.setup().click(screen.getByRole('button', { name: 'Kopiuj adres zaproszenia' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Zaznacz adres na arkuszu powyżej i skopiuj ręcznie.')
  })

  it('uruchamia drukowanie arkusza', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    renderInvite()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Drukuj arkusz' }))

    expect(print).toHaveBeenCalledTimes(1)
  })
})
