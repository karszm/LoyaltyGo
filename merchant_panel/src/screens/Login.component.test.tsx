// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Login from './Login'

const mocks = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  useSession: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: mocks.signInWithOtp,
      verifyOtp: mocks.verifyOtp,
    },
  },
}))

vi.mock('../lib/session', () => ({
  useSession: mocks.useSession,
}))

function renderLogin(initialEntry = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/karta" element={<h1>Docelowa karta</h1>} />
        <Route path="/" element={<h1>Panel główny</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function sendCode(email = 'owner@example.test') {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Adres e-mail'), email)
  await user.click(screen.getByRole('button', { name: 'Wyślij link i kod' }))
  await screen.findByRole('heading', { name: 'Sprawdź skrzynkę' })
  return user
}

describe('Login', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.useSession.mockReturnValue({
      session: null,
      loading: false,
      logout: vi.fn(),
    })
    mocks.signInWithOtp.mockResolvedValue({ error: null })
    mocks.verifyOtp.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    cleanup()
  })

  it('wyjaśnia, że pierwszy login może utworzyć konto', () => {
    renderLogin()

    expect(screen.getByRole('heading', { name: 'Zaloguj się do panelu' })).toBeInTheDocument()
    expect(
      screen.getByText(/Jeśli nie masz jeszcze konta, powstanie ono przy pierwszym logowaniu/),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Adres e-mail')).toHaveAttribute('maxlength', '254')
  })

  it.each([
    ['brak znaku @', 'owner.example.test'],
    ['brak domeny najwyższego poziomu', 'owner@example'],
    ['biały znak w adresie', 'owner @example.test'],
  ])('odrzuca niepoprawny e-mail: %s', async (_caseName, email) => {
    renderLogin()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Adres e-mail'), email)
    await user.click(screen.getByRole('button', { name: 'Wyślij link i kod' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Podaj prawidłowy adres e-mail.')
    expect(mocks.signInWithOtp).not.toHaveBeenCalled()
  })

  it('wysyła kod dla przyciętego e-maila i pozostawia włączone zakładanie konta', async () => {
    renderLogin('/login?returnTo=%2Fkarta%3Ftab%3Dbranding')

    await sendCode('  owner@example.test  ')

    expect(mocks.signInWithOtp).toHaveBeenCalledTimes(1)
    const request = mocks.signInWithOtp.mock.calls[0][0]
    expect(request.email).toBe('owner@example.test')
    expect(request.options).not.toHaveProperty('shouldCreateUser')

    const redirectUrl = new URL(request.options.emailRedirectTo)
    expect(redirectUrl.pathname).toBe('/auth')
    expect(redirectUrl.searchParams.get('returnTo')).toBe('/karta?tab=branding')
    expect(screen.getByText(/Na adres owner@example\.test wysłaliśmy/)).toBeInTheDocument()
    expect(screen.getByLabelText('Kod z wiadomości')).toHaveAttribute('maxlength', '6')
  })

  it('pokazuje zrozumiały komunikat, gdy wysłanie kodu nie ma połączenia z serwerem', async () => {
    mocks.signInWithOtp.mockRejectedValueOnce(new Error('offline'))
    renderLogin()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Adres e-mail'), 'owner@example.test')
    await user.click(screen.getByRole('button', { name: 'Wyślij link i kod' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Nie udało się połączyć z serwerem.')
    expect(alert).toHaveTextContent('Sprawdź połączenie z internetem.')
    expect(screen.getByRole('button', { name: 'Wyślij link i kod' })).toBeEnabled()
  })

  it('nie wysyła do Supabase kodu krótszego niż sześć cyfr', async () => {
    renderLogin()
    const user = await sendCode()

    await user.type(screen.getByLabelText('Kod z wiadomości'), '12345')
    await user.click(screen.getByRole('button', { name: 'Zaloguj się kodem' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ten kod się nie zgadza. Przepisz sześć cyfr z najnowszej wiadomości, starsze kody już nie działają.',
    )
    expect(mocks.verifyOtp).not.toHaveBeenCalled()
  })

  it('weryfikuje poprawny kod i wraca do bezpiecznej strony docelowej', async () => {
    renderLogin('/login?returnTo=%2Fkarta')
    const user = await sendCode()

    await user.type(screen.getByLabelText('Kod z wiadomości'), '480119')
    await user.click(screen.getByRole('button', { name: 'Zaloguj się kodem' }))

    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      email: 'owner@example.test',
      token: '480119',
      type: 'email',
    })
    expect(await screen.findByRole('heading', { name: 'Docelowa karta' })).toBeInTheDocument()
  })

  it('blokuje wpisywanie po pięciu błędnych próbach i pozwala od razu wysłać nowy kod', async () => {
    mocks.verifyOtp.mockResolvedValue({ error: new Error('invalid token') })
    renderLogin()
    const user = await sendCode()
    const codeInput = screen.getByLabelText('Kod z wiadomości')

    await user.type(codeInput, '111111')
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await user.click(screen.getByRole('button', { name: 'Zaloguj się kodem' }))
      await waitFor(() => expect(mocks.verifyOtp).toHaveBeenCalledTimes(attempt))
    }

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Pięć razy kod się nie zgodził, więc to pole nie przyjmie kolejnych prób. Zamów nową wiadomość przyciskiem poniżej i przepisz kod z niej.',
    )
    expect(codeInput).toBeDisabled()

    const resendButton = screen.getByRole('button', { name: 'Wyślij ponownie' })
    expect(resendButton).toBeEnabled()
    await user.click(resendButton)

    await waitFor(() => expect(mocks.signInWithOtp).toHaveBeenCalledTimes(2))
    expect(codeInput).toBeEnabled()
    expect(codeInput).toHaveValue('')
    expect(screen.getByText(/Wysłaliśmy nową wiadomość na owner@example\.test/)).toBeInTheDocument()
  })

  it('przekierowuje zalogowaną osobę bez ponownego pokazywania formularza', () => {
    mocks.useSession.mockReturnValue({
      session: { user: { id: 'user-1' } },
      loading: false,
      logout: vi.fn(),
    })

    renderLogin('/login?returnTo=%2Fkarta')

    expect(screen.getByRole('heading', { name: 'Docelowa karta' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Adres e-mail')).not.toBeInTheDocument()
  })
})
