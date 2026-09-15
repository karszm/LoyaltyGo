import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'

const enabled = process.env.E2E_REAL_SUPABASE === '1'
const mailpitURL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324'
const merchantEmail = 'seed-a@loyaltygo.test'

interface MailpitSummary {
  ID: string
  To: Array<{ Address: string }>
}

function resetLocalOtpCooldown() {
  const userId = execFileSync('docker', [
    'exec',
    'supabase_db_backend',
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-v', 'ON_ERROR_STOP=1',
    '-tAc',
    `update auth.users set recovery_sent_at = null where email = '${merchantEmail}' returning id`,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  if (!userId) {
    throw new Error('Brak testowego merchanta. Wgraj backend/supabase/tests/seed.sql.')
  }
}

async function listMessages(): Promise<MailpitSummary[]> {
  const response = await fetch(`${mailpitURL}/api/v1/messages`)
  if (!response.ok) throw new Error(`Mailpit list zwrócił HTTP ${response.status}`)
  return ((await response.json()) as { messages: MailpitSummary[] }).messages
}

async function newestOtp(existingIds: Set<string>): Promise<string | null> {
  const message = (await listMessages()).find(
    ({ ID, To }) => !existingIds.has(ID) && To.some(({ Address }) => Address === merchantEmail),
  )
  if (!message) return null

  const response = await fetch(`${mailpitURL}/api/v1/message/${message.ID}`)
  if (!response.ok) throw new Error(`Mailpit message zwrócił HTTP ${response.status}`)
  const { HTML = '', Text = '' } = (await response.json()) as { HTML?: string; Text?: string }
  const html = `${HTML}\n${Text}`
  const match = html.match(/class="code"[\s\S]*?>\s*(\d{6})\s*</)
  return match?.[1] ?? null
}

test.describe('panel — lokalny Supabase', () => {
  test.skip(!enabled, 'Uruchamiane jawnie przez npm run test:e2e:local')

  test('OTP, odczyt własnych danych, izolacja RLS, zaproszenie i logout', async ({ page }) => {
    resetLocalOtpCooldown()
    const existingIds = new Set((await listMessages()).map(({ ID }) => ID))

    await page.goto('/login?returnTo=%2Fklienci')
    await page.getByLabel('Adres e-mail').fill(merchantEmail)
    await page.getByRole('button', { name: 'Wyślij link i kod' }).click()
    await expect(page.getByRole('heading', { name: 'Sprawdź skrzynkę' })).toBeVisible()

    let otp: string | null = null
    await expect.poll(async () => {
      otp = await newestOtp(existingIds)
      return otp
    }, { timeout: 10_000 }).toMatch(/^\d{6}$/)

    await page.getByLabel('Kod z wiadomości').fill(otp!)
    await page.getByRole('button', { name: 'Zaloguj się kodem' }).click()

    await expect(page).toHaveURL(/\/klienci$/)
    await expect(page.getByRole('heading', { name: 'Klienci' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Ala Testowa/ })).toBeVisible()
    await expect(page.getByText('seed-member-a@test.pl')).toBeVisible()

    await page.goto('/klienci/64000000-0000-0000-0000-000000000001')
    await expect(page.getByText('Nie znaleziono klienta.')).toBeVisible()

    await page.goto('/zaproszenie')
    await expect(page.getByRole('heading', { name: 'Zaproszenie' })).toBeVisible()
    await expect(page.getByText('karta.loyaltygo.pl/SEEDA1')).toBeVisible()

    await page.getByRole('button', { name: 'Wyloguj' }).first().click()
    await expect(page).toHaveURL(/\/login/)
    await page.goBack()
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByText('seed-member-a@test.pl')).not.toBeVisible()
  })
})
