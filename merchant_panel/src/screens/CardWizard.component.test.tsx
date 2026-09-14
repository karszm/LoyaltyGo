// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LogoUploadError } from '../lib/db'
import { PanelError } from '../lib/errors'
import { deferred, merchantFixture, programFixture } from '../test/fixtures'
import CardWizard from './CardWizard'

const mocks = vi.hoisted(() => ({
  useProgram: vi.fn(),
  useSession: vi.fn(),
  getProgram: vi.fn(),
  updateProgram: vi.fn(),
  uploadLogo: vi.fn(),
  uploadCardImage: vi.fn(),
  prepareLogo: vi.fn(),
  prepareCardImage: vi.fn(),
  generateCardImage: vi.fn(),
  publishProgram: vi.fn(),
  syncBranding: vi.fn(),
  loadDraft: vi.fn(),
  saveDraft: vi.fn(),
  clearDraft: vi.fn(),
  copyToClipboard: vi.fn(),
  reload: vi.fn(),
}))

vi.mock('../lib/program', () => ({ useProgram: mocks.useProgram }))
vi.mock('../lib/session', () => ({ useSession: mocks.useSession }))
vi.mock('../lib/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/db')>()),
  getProgram: mocks.getProgram,
  updateProgram: mocks.updateProgram,
  uploadLogo: mocks.uploadLogo,
  uploadCardImage: mocks.uploadCardImage,
}))
vi.mock('../lib/logoCanvas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/logoCanvas')>()),
  prepareLogo: mocks.prepareLogo,
}))
vi.mock('../lib/cardCanvas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/cardCanvas')>()),
  prepareCardImage: mocks.prepareCardImage,
}))
vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  generateCardImage: mocks.generateCardImage,
  publishProgram: mocks.publishProgram,
  syncBranding: mocks.syncBranding,
}))
vi.mock('../lib/formDraft', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/formDraft')>()),
  loadDraft: mocks.loadDraft,
  saveDraft: mocks.saveDraft,
  clearDraft: mocks.clearDraft,
}))
vi.mock('../lib/publish', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/publish')>()),
  copyToClipboard: mocks.copyToClipboard,
}))

beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute('open', '')
    },
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute('open')
      this.dispatchEvent(new Event('close'))
    },
  })
})

function renderWizard(program = programFixture(), merchant = merchantFixture()) {
  mocks.useProgram.mockReturnValue({ merchant, program, reload: mocks.reload })
  return render(<MemoryRouter><CardWizard /></MemoryRouter>)
}

async function openPublishDialog() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Opublikuj program' }))
  return { user, dialog: screen.getByRole('dialog', { name: 'Opublikować program?' }) }
}

describe('CardWizard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.useSession.mockReturnValue({ session: { user: { id: 'user-1' } } })
    mocks.loadDraft.mockReturnValue(null)
    mocks.updateProgram.mockResolvedValue(programFixture())
    mocks.uploadLogo.mockResolvedValue('https://cdn.example/logo.png')
    mocks.uploadCardImage.mockResolvedValue('https://cdn.example/card.png')
    mocks.prepareLogo.mockImplementation(async (file: File) => ({
      file,
      upscaled: false,
      originalWidth: 1000,
      originalHeight: 660,
    }))
    mocks.prepareCardImage.mockResolvedValue({
      file: new File(['card'], 'card.png', { type: 'image/png' }),
      color: '#123456',
    })
    mocks.generateCardImage.mockResolvedValue({
      category: 'kwiaciarnia',
      prompt: 'flowers',
      images: ['data:1', 'data:2', 'data:3', 'data:4'],
    })
    mocks.publishProgram.mockResolvedValue({ status: 'published', program_key_plaintext: 'secret-key' })
    mocks.syncBranding.mockResolvedValue({ synced: true })
    mocks.copyToClipboard.mockResolvedValue(true)
    mocks.getProgram.mockResolvedValue(programFixture({ status: 'published' }))
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:preview') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  })

  afterEach(() => cleanup())

  it('prefilluje nowy program nazwą firmy i zapisuje draft użytkownika', async () => {
    renderWizard(programFixture({ display_name: null }), merchantFixture({ company_name: 'Salon Róża' }))
    const input = screen.getByLabelText('Nazwa na karcie')

    expect(input).toHaveValue('Salon Róża')
    await userEvent.setup().type(input, ' 2')

    expect(mocks.saveDraft).toHaveBeenLastCalledWith(
      'user-1',
      'karta',
      expect.objectContaining({ name: 'Salon Róża 2' }),
    )
  })

  it('przywraca draft zamiast bazowej wartości programu', () => {
    mocks.loadDraft.mockReturnValue({
      name: 'Nazwa z draftu',
      color: '#112233',
      ink: '#ffffff',
      ratePer100: '25',
      description: 'Draft opisu',
    })

    renderWizard()

    expect(screen.getByLabelText('Nazwa na karcie')).toHaveValue('Nazwa z draftu')
    expect(screen.getByLabelText('Kod HEX')).toHaveValue('#112233')
    expect(screen.getByLabelText('Punkty za każde 100 zł')).toHaveValue(25)
  })

  it('waliduje pojedyncze pole i przenosi na nie fokus', async () => {
    renderWizard()
    const name = screen.getByLabelText('Nazwa na karcie')
    await userEvent.setup().clear(name)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Zapisz zmiany' }))

    expect(screen.getByText('Podaj nazwę, która ma się pojawić na karcie.')).toBeInTheDocument()
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveFocus()
    expect(mocks.updateProgram).not.toHaveBeenCalled()
  })

  it('dla wielu błędów pokazuje podsumowanie z odnośnikami', async () => {
    renderWizard()
    fireEvent.change(screen.getByLabelText('Nazwa na karcie'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Kod HEX'), { target: { value: 'blue' } })
    fireEvent.change(screen.getByLabelText('Punkty za każde 100 zł'), { target: { value: '0' } })

    await userEvent.setup().click(screen.getByRole('button', { name: 'Zapisz zmiany' }))

    const summary = screen.getByText('Nie zapisaliśmy zmian.').closest('[role="alert"]')
    expect(summary).toHaveFocus()
    expect(within(summary as HTMLElement).getByRole('link', { name: /Podaj nazwę/ })).toHaveAttribute('href', '#prog-name')
    expect(within(summary as HTMLElement).getByRole('link', { name: /Kod koloru/ })).toHaveAttribute('href', '#prog-color')
    expect(within(summary as HTMLElement).getByRole('link', { name: /Podaj liczbę punktów/ })).toHaveAttribute('href', '#prog-rate')
  })

  it('zapisuje przyciętą nazwę i przeliczoną stawkę', async () => {
    renderWizard()
    fireEvent.change(screen.getByLabelText('Nazwa na karcie'), { target: { value: '  Studio Plus  ' } })
    fireEvent.change(screen.getByLabelText('Punkty za każde 100 zł'), { target: { value: '25' } })
    fireEvent.change(screen.getByLabelText('Opis programu'), { target: { value: 'Program premiowy' } })

    await userEvent.setup().click(screen.getByRole('button', { name: 'Zapisz zmiany' }))

    await waitFor(() => expect(mocks.updateProgram).toHaveBeenCalledWith('program-1', {
      display_name: 'Studio Plus',
      background_color: '#34363c',
      text_color: '#ffffff',
      description: 'Program premiowy',
      points_per_pln: 0.25,
    }))
    expect(screen.getByRole('status')).toHaveTextContent('Zapisano')
    expect(mocks.clearDraft).toHaveBeenCalledWith('user-1', 'karta')
    expect(mocks.reload).toHaveBeenCalledTimes(1)
  })

  it('blokuje ponowny zapis w czasie requestu', async () => {
    mocks.updateProgram.mockReturnValue(deferred<never>().promise)
    renderWizard()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Zapisz zmiany' }))

    const savingButtons = screen.getAllByRole('button', { name: 'Zapisywanie…' })
    expect(savingButtons).toHaveLength(2)
    for (const button of savingButtons) {
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('aria-busy', 'true')
    }
    expect(mocks.updateProgram).toHaveBeenCalledTimes(1)
  })

  it('po błędzie zapisu zachowuje formularz i fokusuje podsumowanie', async () => {
    mocks.updateProgram.mockRejectedValue(new Error('offline'))
    renderWizard()
    fireEvent.change(screen.getByLabelText('Opis programu'), { target: { value: 'Nie trać mnie' } })

    await userEvent.setup().click(screen.getByRole('button', { name: 'Zapisz zmiany' }))

    const summary = await screen.findByText('Nie udało się zapisać karty.')
    expect(summary.closest('[role="alert"]')).toHaveFocus()
    expect(screen.getByLabelText('Opis programu')).toHaveValue('Nie trać mnie')
    expect(mocks.clearDraft).not.toHaveBeenCalled()
  })

  it('odróżnia zapis danych od opóźnienia synchronizacji wydanej karty', async () => {
    mocks.syncBranding.mockResolvedValue({ synced: false })
    renderWizard(programFixture({ status: 'published' }))

    await userEvent.setup().click(screen.getByRole('button', { name: 'Zapisz zmiany' }))

    expect(await screen.findByText('Zapisano, ale karta w portfelu jeszcze się nie zaktualizowała.')).toBeInTheDocument()
    expect(screen.getByText('Wygląd karty w portfelu nie zaktualizował się. Spróbuj zapisać ponownie za chwilę.')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Zapisano')
  })

  it('odrzuca SVG bez uruchamiania przygotowania i uploadu', async () => {
    renderWizard()
    const file = new File(['svg'], 'logo.svg', { type: 'image/svg+xml' })

    fireEvent.change(document.getElementById('prog-logo') as HTMLInputElement, { target: { files: [file] } })

    expect(await screen.findByRole('alert')).toHaveTextContent('Plików SVG nie przyjmujemy.')
    expect(mocks.prepareLogo).not.toHaveBeenCalled()
    expect(mocks.uploadLogo).not.toHaveBeenCalled()
  })

  it('odrzuca zbyt duże logo i pozostawia poprzednie bez zmian', async () => {
    renderWizard(programFixture({ logo_url: 'https://cdn.example/old.png' }))
    const file = new File([new Uint8Array(1_048_577)], 'large.png', { type: 'image/png' })

    fireEvent.change(document.getElementById('prog-logo') as HTMLInputElement, { target: { files: [file] } })

    expect(await screen.findByRole('alert')).toHaveTextContent('Ten plik nie został przyjęty.')
    expect(document.querySelector('img[src="https://cdn.example/old.png"]')).toBeInTheDocument()
    expect(mocks.uploadLogo).not.toHaveBeenCalled()
  })

  it('zapisuje nowe logo dopiero po przygotowaniu i uploadzie', async () => {
    renderWizard()
    const file = new File(['png'], 'logo.png', { type: 'image/png' })

    fireEvent.change(document.getElementById('prog-logo') as HTMLInputElement, { target: { files: [file] } })

    await waitFor(() => expect(mocks.prepareLogo).toHaveBeenCalledWith(file))
    expect(mocks.uploadLogo).toHaveBeenCalledWith('merchant-1', file)
    expect(mocks.updateProgram).toHaveBeenCalledWith('program-1', { logo_url: 'https://cdn.example/logo.png' })
    expect(document.querySelector('img[src="https://cdn.example/logo.png"]')).toBeInTheDocument()
    expect(mocks.prepareLogo.mock.invocationCallOrder[0]).toBeLessThan(mocks.uploadLogo.mock.invocationCallOrder[0])
    expect(mocks.uploadLogo.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateProgram.mock.invocationCallOrder[0])
  })

  it('pozostawia stare logo po odrzuceniu przez Storage', async () => {
    mocks.uploadLogo.mockRejectedValue(new LogoUploadError(true))
    renderWizard(programFixture({ logo_url: 'https://cdn.example/old.png' }))
    const file = new File(['png'], 'logo.png', { type: 'image/png' })

    fireEvent.change(document.getElementById('prog-logo') as HTMLInputElement, { target: { files: [file] } })

    expect(await screen.findByRole('alert')).toHaveTextContent('Ten plik nie został przyjęty.')
    expect(document.querySelector('img[src="https://cdn.example/old.png"]')).toBeInTheDocument()
  })

  it('nie generuje grafiki bez opisu firmy', async () => {
    renderWizard()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Wygeneruj grafikę' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Opisz czym zajmuje się Twoja firma')
    expect(screen.getByLabelText('Grafika karty')).toHaveFocus()
    expect(mocks.generateCardImage).not.toHaveBeenCalled()
  })

  it('pokazuje cztery wygenerowane warianty i pozwala wybrać jeden bez zapisu', async () => {
    renderWizard()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Grafika karty'), 'kwiaciarnia')
    await user.click(screen.getByRole('button', { name: 'Wygeneruj grafikę' }))

    const group = await screen.findByRole('radiogroup', { name: 'Propozycje grafiki karty' })
    expect(within(group).getAllByRole('radio')).toHaveLength(4)
    await user.click(within(group).getAllByRole('radio')[1])

    expect(mocks.generateCardImage).toHaveBeenCalledWith('kwiaciarnia', '#ffffff', undefined)
    expect(mocks.prepareCardImage).toHaveBeenCalledWith('data:2', '#ffffff')
    expect(within(group).getAllByRole('radio')[1]).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Wybrana grafika nr 2. Zapisz zmiany, żeby trafiła na kartę.')).toBeInTheDocument()
    expect(mocks.uploadCardImage).not.toHaveBeenCalled()
    expect(mocks.updateProgram).not.toHaveBeenCalled()
  })

  it('wysyła wybraną grafikę dopiero razem z zapisem formularza', async () => {
    renderWizard()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Grafika karty'), 'kawiarnia')
    await user.click(screen.getByRole('button', { name: 'Wygeneruj grafikę' }))
    await user.click((await screen.findAllByRole('radio'))[0])
    await user.click(screen.getByRole('button', { name: 'Zapisz zmiany' }))

    await waitFor(() => expect(mocks.uploadCardImage).toHaveBeenCalledWith('merchant-1', expect.any(File)))
    expect(mocks.updateProgram).toHaveBeenCalledWith('program-1', expect.objectContaining({
      card_image_url: 'https://cdn.example/card.png',
      background_color: '#123456',
    }))
  })

  it('usuwa zapisaną grafikę dopiero po kliknięciu zapisu', async () => {
    renderWizard(programFixture({ card_image_url: 'https://cdn.example/old-card.png' }))
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Bez grafiki' }))
    expect(mocks.updateProgram).not.toHaveBeenCalled()
    expect(screen.getByText('Karta wróci do jednolitego koloru po zapisaniu zmian.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Zapisz zmiany' }))

    await waitFor(() => expect(mocks.updateProgram).toHaveBeenCalledWith('program-1', expect.objectContaining({ card_image_url: null })))
  })

  it('anulowanie potwierdzenia nie publikuje programu', async () => {
    renderWizard()
    const { user, dialog } = await openPublishDialog()

    expect(within(dialog).getByRole('button', { name: 'Anuluj' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Anuluj' }))

    expect(mocks.publishProgram).not.toHaveBeenCalled()
    expect(dialog).not.toHaveAttribute('open')
  })

  it('po publikacji pokazuje jednorazowy klucz i pozwala go skopiować', async () => {
    renderWizard()
    const { user, dialog } = await openPublishDialog()

    await user.click(within(dialog).getByRole('button', { name: 'Opublikuj program' }))

    const keyDialog = await screen.findByRole('dialog', { name: 'Klucz do terminala' })
    expect(within(keyDialog).getByLabelText('Klucz do terminala')).toHaveTextContent('secret-key')
    expect(within(keyDialog).getByRole('button', { name: 'Kopiuj klucz' })).toHaveFocus()
    await user.click(within(keyDialog).getByRole('button', { name: 'Kopiuj klucz' }))
    expect(mocks.copyToClipboard).toHaveBeenCalledWith('secret-key')
    expect(within(keyDialog).getByRole('status')).toHaveTextContent('Skopiowano')
    expect(mocks.reload).toHaveBeenCalledTimes(1)
  })

  it('idempotentny sukces bez klucza nie otwiera pustego dialogu', async () => {
    mocks.publishProgram.mockResolvedValue({ status: 'published' })
    renderWizard()
    const { user, dialog } = await openPublishDialog()

    await user.click(within(dialog).getByRole('button', { name: 'Opublikuj program' }))

    expect(await screen.findByRole('heading', { name: 'Program jest opublikowany.' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Klucz do terminala' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Przejdź do integracji' })).toHaveAttribute('href', '/integracja')
  })

  it('błąd sieci uzbraja bezpieczny retry bez ponownego potwierdzenia', async () => {
    mocks.publishProgram
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ status: 'published' })
    renderWizard()
    const { user, dialog } = await openPublishDialog()
    await user.click(within(dialog).getByRole('button', { name: 'Opublikuj program' }))

    expect(await screen.findByText('Nie udało się opublikować programu.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Opublikuj program' }))

    expect(mocks.publishProgram).toHaveBeenCalledTimes(2)
    expect(await screen.findByRole('heading', { name: 'Program jest opublikowany.' })).toBeInTheDocument()
  })

  it('błąd 422 publikacji wskazuje pola formularza', async () => {
    mocks.publishProgram.mockRejectedValue(
      new PanelError({
        code: 'validation_error',
        message: 'Niepoprawne dane.',
        fields: [
          { field: 'display_name', message: 'required' },
          { field: 'logo_url', message: 'required' },
        ],
      }),
    )
    renderWizard()
    const { user, dialog } = await openPublishDialog()

    await user.click(within(dialog).getByRole('button', { name: 'Opublikuj program' }))

    const summary = (await screen.findByText('Nie opublikowaliśmy programu.')).closest('[role="alert"]')
    expect(summary).toHaveFocus()
    expect(within(summary as HTMLElement).getByRole('link', { name: /Podaj nazwę/ })).toHaveAttribute('href', '#prog-name')
    expect(within(summary as HTMLElement).getByRole('link', { name: /Wgraj logo/ })).toHaveAttribute('href', '#prog-logo')
  })
})
