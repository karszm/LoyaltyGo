import { expect, test, type Route } from '@playwright/test'

async function fulfillOtpRequest(route: Route) {
  const headers = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
  }
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers })
    return
  }
  await route.fulfill({ status: 200, contentType: 'application/json', headers, body: '{}' })
}

test.describe('logowanie — kontrakt UI', () => {
  test('waliduje e-mail bez wysyłania requestu', async ({ page }) => {
    let otpRequests = 0
    page.on('request', (request) => {
      if (request.url().includes('/auth/v1/otp')) otpRequests += 1
    })

    await page.goto('/login')
    await page.getByLabel('Adres e-mail').fill('niepoprawny-adres')
    await page.getByRole('button', { name: 'Wyślij link i kod' }).click()

    await expect(page.getByRole('alert')).toHaveText('Podaj prawidłowy adres e-mail.')
    await expect(page.getByLabel('Adres e-mail')).toBeFocused()
    expect(otpRequests).toBe(0)
  })

  test('przechodzi do formularza sześciocyfrowego kodu', async ({ page }) => {
    await page.route('**/auth/v1/otp*', fulfillOtpRequest)

    await page.goto('/login?returnTo=%2Fkarta')
    await page.getByLabel('Adres e-mail').fill('owner@example.test')
    await page.getByRole('button', { name: 'Wyślij link i kod' }).click()

    await expect(page.getByRole('heading', { name: 'Sprawdź skrzynkę' })).toBeVisible()
    const code = page.getByLabel('Kod z wiadomości')
    await expect(code).toHaveAttribute('maxlength', '6')
    await expect(code).toHaveAttribute('autocomplete', 'one-time-code')
    await expect(code).toHaveAttribute('inputmode', 'numeric')
  })

  test('odrzuca niepełny kod przed wywołaniem Supabase', async ({ page }) => {
    let verifyRequests = 0
    page.on('request', (request) => {
      if (request.url().includes('/auth/v1/verify')) verifyRequests += 1
    })
    await page.route('**/auth/v1/otp*', fulfillOtpRequest)

    await page.goto('/login')
    await page.getByLabel('Adres e-mail').fill('owner@example.test')
    await page.getByRole('button', { name: 'Wyślij link i kod' }).click()
    await page.getByLabel('Kod z wiadomości').fill('12345')
    await page.getByRole('button', { name: 'Zaloguj się kodem' }).click()

    await expect(page.getByRole('alert')).toContainText('Przepisz sześć cyfr')
    await expect(page.getByLabel('Kod z wiadomości')).toBeFocused()
    expect(verifyRequests).toBe(0)
  })
})
