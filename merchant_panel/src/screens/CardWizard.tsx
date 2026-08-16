// CardWizard.tsx — task-13-design.md. The /karta screen: the card is the subject, the form is
// its remote control (§1). DOM order is heading, preview, form (§11) — the two-column layout at
// >=812px available width is CSS only (styles.css's .card-editor__grid container query, §2.2).
//
// One save button for the whole screen, no autosave (§8). This is load-bearing, not a style
// choice: the `programs_rate_history` trigger inserts a row into `program_rates` on every change
// to `points_per_pln`, and `current_rate(program, at)` picks a rate by `valid_from`. Autosave on
// every keystroke while typing "1 -> 10 -> 100" would record three rates, and a real transaction
// landing inside that window would be priced off a value the merchant never meant to set. Only
// `logo_url` is saved immediately, and only after Storage confirms the upload (§6.2) — the UI
// says so (`Logo zapisuje się od razu po wysłaniu.`).
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useProgram } from '../lib/program'
import { useSession } from '../lib/session'
import { CardPreview, deriveMonogram, FALLBACK_BACKGROUND } from '../components/CardPreview'
import { updateProgram, uploadLogo, LogoUploadError, type Program } from '../lib/db'
import { normalizeCode } from '../lib/errors'
import { clearDraft, loadDraft, saveDraft } from '../lib/formDraft'
import { pointsForAmount, pointsPerPlnToRatePer100, ratePer100ToPointsPerPln, formatMoney } from '../lib/format'
import { contrastRatio, meetsAA } from '../lib/contrast'
import { isValidHexColor } from '../lib/validate'

const DRAFT_KEY = 'karta'
const NAME_MAX = 60
const DESCRIPTION_MAX = 280
const RATE_MIN = 1
const RATE_MAX = 10000

// 0010_program_logos.sql's own bucket limits, mirrored here as a courtesy check only — the
// bucket itself (allowed_mime_types, file_size_limit) is the real gate, see uploadLogo (db.ts).
const ACCEPTED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const LOGO_MAX_BYTES = 1_048_576

// Client-side rejection and bucket rejection deliberately share this exact string (§6.2): the
// merchant never gets two different explanations of the same rule.
const REJECTED_MESSAGE =
  'Ten plik nie został przyjęty. Przyjmujemy pliki PNG, JPG i WEBP o rozmiarze do 1 MB. Poprzednie logo pozostaje bez zmian.'
const SVG_MESSAGE =
  'Plików SVG nie przyjmujemy. Karta w telefonie potrzebuje zwykłego obrazka, a plik SVG potrafi ukryć w sobie kod. Poproś grafika o wersję PNG z przezroczystym tłem.'
const UPLOAD_FAILED_MESSAGE = 'Nie udało się wysłać logo. Spróbuj ponownie. Poprzednie logo pozostaje bez zmian.'
const CONTRAST_WARNING =
  'Na tym kolorze biały tekst będzie trudny do odczytania, a jasne logo może zniknąć. Możesz zapisać ten kolor. Karta Twoich klientów będzie wyglądać dokładnie tak jak na podglądzie.'

interface FieldValues {
  name: string
  color: string
  ratePer100: string
  description: string
}

/** The row's own saved state, with no form-only substitutions -- used only to seed the very
 * first render (see the useState initializer below); the name field then gets its own prefill
 * layered on top. */
function baselineValues(program: Program): FieldValues {
  return {
    name: program.display_name ?? '',
    color: program.background_color ?? FALLBACK_BACKGROUND,
    ratePer100: String(pointsPerPlnToRatePer100(program.points_per_pln)),
    description: program.description ?? '',
  }
}

interface FieldErrors {
  name?: string
  color?: string
  rate?: string
  description?: string
}

const FIELD_IDS: Record<keyof FieldErrors, string> = {
  name: 'prog-name',
  color: 'prog-color',
  rate: 'prog-rate',
  description: 'prog-description',
}

function validate(values: FieldValues): FieldErrors {
  const errors: FieldErrors = {}

  if (!values.name.trim()) {
    errors.name = 'Podaj nazwę, która ma się pojawić na karcie.'
  } else if (values.name.length > NAME_MAX) {
    errors.name = 'Nazwa może mieć najwyżej 60 znaków.'
  }

  if (!isValidHexColor(values.color)) {
    errors.color = 'Kod koloru musi mieć postać #RRGGBB, na przykład #0F5132.'
  }

  const rate = Number(values.ratePer100)
  if (!Number.isInteger(rate) || rate < RATE_MIN || rate > RATE_MAX) {
    errors.rate = 'Podaj liczbę punktów od 1 do 10 000.'
  }

  if (values.description.length > DESCRIPTION_MAX) {
    errors.description = 'Opis może mieć najwyżej 280 znaków.'
  }

  return errors
}

export default function CardWizard() {
  const { merchant, program, reload } = useProgram()
  const { session } = useSession()
  const userId = session?.user.id ?? null

  const serverBaseline = useMemo(() => baselineValues(program), [program])
  const [values, setValues] = useState<FieldValues>(() => {
    const draft = userId ? loadDraft<FieldValues>(userId, DRAFT_KEY) : null
    // Name is the one field prefilled from a value that isn't the row's own (§9: "Prefill nazwy
    // jest wartością formularza, a nie wartością w bazie") -- so the very first render is already
    // dirty against `serverBaseline`, which is exactly the point: there is something real for
    // "Zapisz zmiany" to do on a brand-new program.
    return draft ?? { ...serverBaseline, name: program.display_name ?? merchant.company_name ?? '' }
  })

  const [logoUrl, setLogoUrl] = useState(program.logo_url)
  const [uploading, setUploading] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)

  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [focusSummaryNonce, setFocusSummaryNonce] = useState(0)

  const nameInputRef = useRef<HTMLInputElement>(null)
  const colorInputRef = useRef<HTMLInputElement>(null)
  const rateInputRef = useRef<HTMLInputElement>(null)
  const descriptionInputRef = useRef<HTMLTextAreaElement>(null)
  const errorSummaryRef = useRef<HTMLDivElement>(null)
  const fieldRefs = {
    name: nameInputRef,
    color: colorInputRef,
    rate: rateInputRef,
    description: descriptionInputRef,
  } as const

  useEffect(() => {
    if (focusSummaryNonce > 0) errorSummaryRef.current?.focus()
  }, [focusSummaryNonce])

  function updateValue<K extends keyof FieldValues>(key: K, value: FieldValues[K]) {
    setSaved(false)
    setValues((prev) => {
      const next = { ...prev, [key]: value }
      if (userId) saveDraft(userId, DRAFT_KEY, next)
      return next
    })
  }

  const previewColor = isValidHexColor(values.color) ? values.color : FALLBACK_BACKGROUND
  const contrastWarning = !meetsAA(contrastRatio('#ffffff', previewColor))
  const ratePerPln = ratePer100ToPointsPerPln(Number(values.ratePer100) || 0)

  async function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // lets the same filename be re-picked after a rejection
    if (!file) return
    setLogoError(null)

    if (file.type === 'image/svg+xml') {
      setLogoError(SVG_MESSAGE)
      return
    }
    if (!ACCEPTED_LOGO_TYPES.includes(file.type) || file.size > LOGO_MAX_BYTES) {
      setLogoError(REJECTED_MESSAGE)
      return
    }

    setUploading(true)
    try {
      // No optimistic preview (§6.3): logoUrl only advances after BOTH the Storage upload and the
      // `programs` update succeed, so a failure at either step leaves the previous logo showing.
      const url = await uploadLogo(merchant.id, file)
      await updateProgram({ logo_url: url })
      setLogoUrl(url)
      reload()
    } catch (err) {
      // A clean bucket rejection (mime/size/RLS) reuses the exact client-side string; anything
      // else -- the upload itself failing, or the follow-up `update programs` failing -- is "the
      // logo action didn't complete," task-13-design.md §5's one retry-oriented sentence.
      setLogoError(err instanceof LogoUploadError && err.rejected ? REJECTED_MESSAGE : UPLOAD_FAILED_MESSAGE)
    } finally {
      setUploading(false)
    }
  }

  async function runSave() {
    setSaving(true)
    setServerError(null)
    try {
      await updateProgram({
        display_name: values.name.trim(),
        background_color: values.color,
        description: values.description,
        points_per_pln: ratePer100ToPointsPerPln(Number(values.ratePer100)),
      })
      if (userId) clearDraft(userId, DRAFT_KEY)
      setSaved(true)
      reload()
    } catch (err) {
      setServerError(normalizeCode(err).message)
      setFocusSummaryNonce((n) => n + 1)
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const fieldErrors = validate(values)
    setErrors(fieldErrors)
    setServerError(null)
    const invalidKeys = Object.keys(fieldErrors) as (keyof FieldErrors)[]

    if (invalidKeys.length === 1) {
      fieldRefs[invalidKeys[0]].current?.focus()
      return
    }
    if (invalidKeys.length > 1) {
      setFocusSummaryNonce((n) => n + 1)
      return
    }
    await runSave()
  }

  return (
    <>
      <h1
        id="screen-title"
        tabIndex={-1}
        style={{ fontSize: 20, lineHeight: '28px', fontWeight: 590, color: 'var(--text-1)' }}
      >
        Karta programu
      </h1>
      <p style={{ marginBlockStart: 'var(--space-5)', maxWidth: '68ch', fontSize: 14, lineHeight: '21px', color: 'var(--text-3)' }}>
        Tak wygląda karta, którą Twoi klienci dodadzą do Apple Wallet i Google Wallet.
      </p>

      <div className="card-editor" style={{ marginBlockStart: 'var(--space-8)' }}>
        <div className="card-editor__grid">
          <section className="card-editor__preview" aria-labelledby="preview-title">
            <h2 id="preview-title" style={{ fontSize: 13, lineHeight: '19.5px', color: 'var(--text-3)', marginBlockEnd: 'var(--space-6)' }}>
              Podgląd karty
            </h2>
            <CardPreview displayName={values.name} backgroundColor={previewColor} logoUrl={logoUrl} />
            {/* aria-live container always mounted (task-13-design.md §4.3 point 3); the styled
               warning paragraph itself only exists while contrast actually fails. */}
            <div aria-live="polite">
              {contrastWarning && <p className="card-warning">{CONTRAST_WARNING}</p>}
            </div>
            <p style={{ marginBlockStart: 'var(--space-6)', fontSize: 14, lineHeight: '21px', color: 'var(--text-3)' }}>
              Podgląd zmienia się na bieżąco. Tekst na karcie w portfelu jest zawsze biały, dlatego tak samo pokazujemy go tutaj.
            </p>
          </section>

          <form className="card-editor__form" onSubmit={handleSubmit} noValidate>
            {serverError ? (
              <div className="error-summary" role="alert" tabIndex={-1} ref={errorSummaryRef} style={{ marginBlockEnd: 'var(--space-8)' }}>
                <p className="error-summary__title">Nie udało się zapisać karty.</p>
                <p className="error-summary__body">{serverError} Spróbuj ponownie za chwilę.</p>
              </div>
            ) : (
              Object.keys(errors).length > 1 && (
                <div className="error-summary" role="alert" tabIndex={-1} ref={errorSummaryRef} style={{ marginBlockEnd: 'var(--space-8)' }}>
                  <p className="error-summary__title">Nie zapisaliśmy zmian.</p>
                  <p className="error-summary__body">Popraw poniższe pola i zapisz ponownie.</p>
                  <ul>
                    {(Object.keys(errors) as (keyof FieldErrors)[]).map((key) => (
                      <li key={key}>
                        <a href={`#${FIELD_IDS[key]}`}>{errors[key]}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            )}

            <div className="panel">
              <div className="panel__head">
                <h2 className="panel__title">Wygląd karty</h2>
              </div>

              <div className="fieldset">
                <span className="fieldset__label">Logo</span>
                <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'center' }}>
                  <div
                    aria-hidden="true"
                    style={{
                      inlineSize: 48,
                      blockSize: 48,
                      borderRadius: 'var(--radius-lg)',
                      background: 'var(--bg)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      flexShrink: 0,
                    }}
                  >
                    {logoUrl ? (
                      <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                      <span style={{ color: 'var(--text-1)', fontWeight: 590, fontSize: 18 }}>{deriveMonogram(values.name)}</span>
                    )}
                  </div>
                  <label className="btn btn--ghost" aria-busy={uploading || undefined}>
                    {uploading ? 'Wysyłanie…' : logoUrl ? 'Zmień logo' : 'Wgraj logo'}
                    <input
                      id="prog-logo"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="visually-hidden"
                      disabled={uploading}
                      onChange={handleLogoChange}
                      aria-describedby="prog-logo-hint"
                    />
                  </label>
                </div>
                <p id="prog-logo-hint" className="fieldset__hint">
                  PNG, JPG lub WEBP, do 1 MB. Najlepiej kwadratowe, z przezroczystym tłem, w kolorze kontrastującym z kolorem karty.
                </p>
                <p className="fieldset__hint">Logo zapisuje się od razu po wysłaniu.</p>
                {!logoUrl && <p className="fieldset__hint">Bez logo na karcie pojawia się pierwsza litera nazwy.</p>}
                {logoError && (
                  <p className="fieldset__error" role="alert">
                    {logoError}
                  </p>
                )}
              </div>

              <div className="fieldset">
                <label className="fieldset__label" htmlFor="prog-name">
                  Nazwa na karcie
                </label>
                <input
                  id="prog-name"
                  ref={nameInputRef}
                  className="field"
                  type="text"
                  maxLength={NAME_MAX}
                  value={values.name}
                  onChange={(e) => updateValue('name', e.target.value)}
                  aria-invalid={errors.name ? 'true' : undefined}
                  aria-describedby={errors.name ? 'prog-name-hint prog-name-error' : 'prog-name-hint'}
                />
                <p id="prog-name-hint" className="fieldset__hint">
                  Nazwa, którą klient zobaczy na karcie w portfelu. Najlepiej krótka, do 30 znaków.
                </p>
                {errors.name && (
                  <p id="prog-name-error" className="fieldset__error" role="alert">
                    {errors.name}
                  </p>
                )}
              </div>

              <div className="fieldset">
                <span id="prog-color-label" className="fieldset__label">
                  Kolor karty
                </span>
                <div role="group" aria-labelledby="prog-color-label" className="color-input">
                  <input
                    type="color"
                    aria-label="Wybierz kolor z palety"
                    className="color-input__swatch"
                    value={previewColor}
                    onChange={(e) => updateValue('color', e.target.value)}
                  />
                  <input
                    id="prog-color"
                    ref={colorInputRef}
                    aria-label="Kod HEX"
                    className="field color-input__hex"
                    type="text"
                    maxLength={7}
                    value={values.color}
                    onChange={(e) => updateValue('color', e.target.value)}
                    aria-invalid={errors.color ? 'true' : undefined}
                    aria-describedby={errors.color ? 'prog-color-hint prog-color-error' : 'prog-color-hint'}
                  />
                </div>
                <p id="prog-color-hint" className="fieldset__hint">
                  Tło karty w portfelu. Wybierz kolor z palety albo wpisz kod z księgi znaku, na przykład #0F5132.
                </p>
                {errors.color && (
                  <p id="prog-color-error" className="fieldset__error" role="alert">
                    {errors.color}
                  </p>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="panel__head">
                <h2 className="panel__title">Zasady programu</h2>
              </div>

              <div className="fieldset">
                <label className="fieldset__label" htmlFor="prog-rate">
                  Punkty za każde 100 zł
                </label>
                <input
                  id="prog-rate"
                  ref={rateInputRef}
                  className="field mono"
                  type="number"
                  inputMode="numeric"
                  min={RATE_MIN}
                  max={RATE_MAX}
                  step={1}
                  value={values.ratePer100}
                  onChange={(e) => updateValue('ratePer100', e.target.value)}
                  aria-invalid={errors.rate ? 'true' : undefined}
                  aria-describedby={errors.rate ? 'prog-rate-hint prog-rate-error' : 'prog-rate-hint'}
                />
                <p id="prog-rate-hint" className="fieldset__hint">
                  Ile punktów klient dostaje za zakup na 100 zł. Wartość od 1 do 10 000.
                </p>
                {errors.rate && (
                  <p id="prog-rate-error" className="fieldset__error" role="alert">
                    {errors.rate}
                  </p>
                )}

                <div style={{ marginBlockStart: 'var(--space-6)' }}>
                  <p className="fieldset__label">Przy tym przeliczniku:</p>
                  <p className="mono" style={{ fontSize: 15, lineHeight: '24px', color: 'var(--text-2)' }}>
                    Zakup {formatMoney(100)} to {pointsForAmount(ratePerPln, 100)} pkt
                  </p>
                  <p className="mono" style={{ fontSize: 15, lineHeight: '24px', color: 'var(--text-2)' }}>
                    Zakup {formatMoney(49.99)} to {pointsForAmount(ratePerPln, 49.99)} pkt
                  </p>
                  <p className="fieldset__hint">Wynik zaokrąglamy w dół do pełnego punktu.</p>
                </div>

                <p className="fieldset__hint" style={{ marginBlockStart: 'var(--space-6)' }}>
                  Zmiana przelicznika nie działa wstecz. Punkty już zebrane przez klientów zostają bez zmian, a nowy przelicznik
                  obowiązuje dla transakcji zarejestrowanych po zapisaniu.
                </p>
              </div>

              <div className="fieldset">
                <label className="fieldset__label" htmlFor="prog-description">
                  Opis programu
                </label>
                <textarea
                  id="prog-description"
                  ref={descriptionInputRef}
                  className="field"
                  maxLength={DESCRIPTION_MAX}
                  value={values.description}
                  onChange={(e) => updateValue('description', e.target.value)}
                  aria-invalid={errors.description ? 'true' : undefined}
                  aria-describedby={errors.description ? 'prog-description-hint prog-description-error' : 'prog-description-hint'}
                />
                <p id="prog-description-hint" className="fieldset__hint">
                  Jedno zdanie o zasadach, na przykład za co klient dostaje punkty. Nie wyświetla się na karcie w portfelu.
                </p>
                {errors.description && (
                  <p id="prog-description-error" className="fieldset__error" role="alert">
                    {errors.description}
                  </p>
                )}
              </div>
            </div>

            {program.status === 'published' && (
              <p style={{ marginBlockStart: 'var(--space-6)', fontSize: 14, lineHeight: '21px', color: 'var(--text-3)' }}>
                Karty już wydane zaktualizują się przy najbliższej synchronizacji.
              </p>
            )}

            <div className="form-footer">
              <button type="submit" className="btn btn--primary" disabled={saving} aria-busy={saving || undefined}>
                {saving ? 'Zapisywanie…' : 'Zapisz zmiany'}
              </button>
              <span className="form-status" role="status">
                {saved ? 'Zapisano' : ''}
              </span>
            </div>

            {program.status === 'draft' && (
              <div className="panel">
                <div className="panel__head">
                  <h2 className="panel__title">Publikacja</h2>
                </div>
                <p className="panel__note">
                  Program nie jest jeszcze opublikowany, więc kod QR dla klientów jeszcze nie istnieje. Do publikacji potrzebne są
                  nazwa na karcie i logo.
                </p>
              </div>
            )}
          </form>
        </div>
      </div>
    </>
  )
}

// task-13-design.md §10 point 2 asks this screen to expose `isDirty` and `save(): Promise<void>`
// for the publish handler (task 14) to await before validating the row. Not wired up here on
// purpose: task 14 owns the amber button (rendered inside the "Publikacja" panel above) and,
// being the actual consumer, is what decides HOW it reads these -- a ref via useImperativeHandle,
// a lifted hook, or a prop callback -- rather than this task guessing at an API shape nothing
// calls yet. `runSave()` above is already that save() function in substance; only the exposure
// mechanism is left for task 14.
