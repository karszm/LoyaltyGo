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
import { Link } from 'react-router-dom'
import { useProgram } from '../lib/program'
import { useSession } from '../lib/session'
import { CardPreview, deriveMonogram, FALLBACK_BACKGROUND } from '../components/CardPreview'
import { getProgram, updateProgram, uploadCardImage, uploadLogo, LogoUploadError, type Program } from '../lib/db'
import { prepareLogo } from '../lib/logoCanvas'
import { prepareCardImage } from '../lib/cardCanvas'
import { generateCardImage, publishProgram, syncBranding } from '../lib/api'
import { normalizeCode, type ErrorField } from '../lib/errors'
import { clearDraft, loadDraft, saveDraft } from '../lib/formDraft'
import { pointsForAmount, pointsPerPlnToRatePer100, ratePer100ToPointsPerPln, formatMoney } from '../lib/format'
import { contrastRatio, meetsAA } from '../lib/contrast'
import { isValidHexColor } from '../lib/validate'
import { copyToClipboard, mapPublishFieldErrors, brandingSyncMessage } from '../lib/publish'

const DRAFT_KEY = 'karta'
const NAME_MAX = 60
const DESCRIPTION_MAX = 280
const RATE_MIN = 1
const RATE_MAX = 10000

// 0010_program_logos.sql's own bucket limits, mirrored here as a courtesy check only — the
// bucket itself (allowed_mime_types, file_size_limit) is the real gate, see uploadLogo (db.ts).
const ACCEPTED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const LOGO_MAX_BYTES = 1_048_576

const BUSINESS_DESCRIPTION_MAX = 200
// The datalist the merchant can pick from. Mirrors CATEGORY_NAMES in the backend's
// cardPrompt.ts — typing anything else is fine, it just falls to the generic prompt.
const BUSINESS_CATEGORIES = [
  'kwiaciarnia', 'fryzjer', 'barber', 'kawiarnia', 'restauracja', 'warsztat',
  'silownia', 'kosmetyczka', 'piekarnia', 'zoologiczny', 'apteka',
]

// Same two-shape split as the logo (§6.2): the bucket refusing the file itself, versus the
// request not completing.
const CARD_IMAGE_REJECTED =
  'Tej grafiki nie udało się zapisać. Wybierz inną albo spróbuj wygenerować nowe. Poprzednia grafika pozostaje bez zmian.'
const CARD_IMAGE_FAILED =
  'Nie udało się zapisać grafiki. Spróbuj ponownie. Poprzednia grafika pozostaje bez zmian.'

// Client-side rejection and bucket rejection deliberately share this exact string (§6.2): the
// merchant never gets two different explanations of the same rule.
const REJECTED_MESSAGE =
  'Ten plik nie został przyjęty. Przyjmujemy pliki PNG, JPG i WEBP o rozmiarze do 1 MB. Poprzednie logo pozostaje bez zmian.'
const SVG_MESSAGE =
  'Plików SVG nie przyjmujemy. Karta w telefonie potrzebuje zwykłego obrazka, a plik SVG potrafi ukryć w sobie kod. Poproś grafika o wersję PNG z przezroczystym tłem.'
const UPLOAD_FAILED_MESSAGE = 'Nie udało się wysłać logo. Spróbuj ponownie. Poprzednie logo pozostaje bez zmian.'
const CONTRAST_WARNING =
  'Na tym kolorze biały tekst będzie trudny do odczytania, a jasne logo może zniknąć. Możesz zapisać ten kolor. Karta Twoich klientów będzie wyglądać dokładnie tak jak na podglądzie.'

// Two different failure shapes share this one error-summary slot, and docs/design/panel-shell.md
// §5.8's title was fixed text until this task's review -- a single title cannot honestly cover
// both: one means "the row update itself failed, nothing saved", the other means "the row saved
// fine, only the PassKit push lagged". Reusing SAVE_FAILED_TITLE for the second case reads as a
// contradiction (a title claiming failure directly above a body saying the data saved). Gap-fill
// authorised in panel-shell.md §5.8: the title is now chosen per case instead of fixed.
const SAVE_FAILED_TITLE = 'Nie udało się zapisać karty.'
const BRANDING_LAG_TITLE = 'Zapisano, ale karta w portfelu jeszcze się nie zaktualizowała.'

interface ServerErrorState {
  title: string
  body: string
}

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

// panel-api's publish response (backend/supabase/functions/panel-api/index.ts:194): the full
// Program shape plus `program_key_plaintext`, present exactly once -- on the very publish call
// that flips draft -> published, never on the idempotent replay of an already-published program.
// Only the fields this screen actually reads are declared; api.ts's `publishProgram<T>()` is
// generic exactly so a caller can narrow it like this instead of that file guessing a shape
// nothing there consumes.
interface PublishResponse {
  status: 'draft' | 'published' | 'suspended' | 'closed'
  program_key_plaintext?: string
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

  useEffect(() => {
    document.title = 'Karta programu · LoyaltyGo'
  }, [])

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

  // --- Card graphic. Saved immediately, like the logo and for the same reason: it is a file
  // upload, not a form field, and there is nothing sensible for "Zapisz zmiany" to do with a
  // picture that is already in Storage. ---
  const [cardImageUrl, setCardImageUrl] = useState(program.card_image_url)
  const [businessDescription, setBusinessDescription] = useState('')
  const [variants, setVariants] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const [applyingVariant, setApplyingVariant] = useState<number | null>(null)
  const [cardImageError, setCardImageError] = useState<string | null>(null)

  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [serverError, setServerError] = useState<ServerErrorState | null>(null)
  const [focusSummaryNonce, setFocusSummaryNonce] = useState(0)

  // --- Publish flow (task-14-design.md §3-5). ---
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null) // 502/500/409-edge/network, rendered at the button
  const [publishFieldErrors, setPublishFieldErrors] = useState<ErrorField[]>([]) // 422, rendered in the form's ErrorSummary
  // After a 502/500/network failure, a retry click goes straight to the POST, no second
  // confirmation (§5.2: "przycisk publikacji JEST przyciskiem ponowienia"). Cleared the moment
  // the merchant edits a field again, because that field is no longer the version this session
  // already confirmed publishing.
  const [confirmedRetry, setConfirmedRetry] = useState(false)
  // The plaintext key, in memory only -- never localStorage/sessionStorage/a URL/a log (§4.3).
  // null both before publication and once "shown once" has genuinely elapsed (reload/nav away).
  const [keyPlaintext, setKeyPlaintext] = useState<string | null>(null)
  // Session state, not row state (§4.5): driven by "a publish just happened in this tab", not by
  // `program.status === 'published'`, so it doesn't linger across a real navigation or reload.
  const [justPublished, setJustPublished] = useState(false)
  // Only the 409 branch sets this -- an extra sentence explaining why the handoff panel appeared
  // without a click (§5.3), on top of the always-shown variant B copy.
  const [publishConflictNote, setPublishConflictNote] = useState(false)
  const [keyCopyStatus, setKeyCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

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

  const publishButtonRef = useRef<HTMLButtonElement>(null)
  const confirmDialogRef = useRef<HTMLDialogElement>(null)
  const confirmCancelRef = useRef<HTMLButtonElement>(null)
  const keyDialogRef = useRef<HTMLDialogElement>(null)
  const keyCopyButtonRef = useRef<HTMLButtonElement>(null)
  // Focus target once the amber button that opened KeyReveal no longer exists (§9: the panel it
  // sat in unmounts the moment `program.status` leaves 'draft'), so the native "return focus to
  // opener" has nowhere to land.
  const handoffHeadingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (focusSummaryNonce > 0) errorSummaryRef.current?.focus()
  }, [focusSummaryNonce])

  // The native <dialog> restores focus to its opener on close -- fine for ConfirmDialog, whose
  // opener (the amber button) survives a cancel. KeyReveal's opener does not: the "Publikacja"
  // panel it sat in unmounts the moment `program.status` leaves 'draft', so the native restore
  // has nowhere to land and focus falls back to <body> (task-14-design.md §9). Move it explicitly
  // to the handoff panel's own heading instead, on every close regardless of how it happened
  // (Zamknij click or Esc).
  useEffect(() => {
    const dialog = keyDialogRef.current
    if (!dialog) return
    function handleClose() {
      handoffHeadingRef.current?.focus()
    }
    dialog.addEventListener('close', handleClose)
    return () => dialog.removeEventListener('close', handleClose)
  }, [])

  // Two publish outcomes land on the handoff panel WITHOUT ever opening KeyReveal: an idempotent
  // 200 with no key (double click, or another tab published first) and a 409 that resolves to
  // "already published elsewhere" -- both set justPublished with keyPlaintext still null. Neither
  // triggers the dialog's own 'close' listener above, so without this, focus falls to <body> on
  // exactly the render where the amber button's "Publikacja" panel has just unmounted. Runs once
  // per publish (justPublished only ever flips false -> true), and only takes over when no dialog
  // is going to hand off focus itself.
  useEffect(() => {
    if (justPublished && keyPlaintext === null) {
      handoffHeadingRef.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justPublished])

  function updateValue<K extends keyof FieldValues>(key: K, value: FieldValues[K]) {
    setSaved(false)
    // A field edited after a 502/500/network retry-armed state means the next publish click has
    // to go through validate+save+confirm again -- confirmedRetry belongs to the version that was
    // already confirmed, not to whatever the merchant is about to type next.
    setConfirmedRetry(false)
    setValues((prev) => {
      const next = { ...prev, [key]: value }
      if (userId) saveDraft(userId, DRAFT_KEY, next)
      return next
    })
  }

  const previewColor = isValidHexColor(values.color) ? values.color : FALLBACK_BACKGROUND
  const contrastWarning = !meetsAA(contrastRatio('#ffffff', previewColor))
  const ratePerPln = ratePer100ToPointsPerPln(Number(values.ratePer100) || 0)

  // task-13-design.md §10 point 2's isDirty, computed inline rather than exposed (see the
  // retirement note above handleSubmit): four fields, one comparison each -- logo_url is excluded
  // on purpose, it saves immediately on upload (§6.2) and never sits in this form's dirty set.
  const isDirty =
    values.name !== serverBaseline.name ||
    values.color !== serverBaseline.color ||
    values.ratePer100 !== serverBaseline.ratePer100 ||
    values.description !== serverBaseline.description

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
      // PassKit rejects logos under 660x660 and only says so at publication, where the
      // merchant never sees it. Fit the file onto a transparent square here instead — see
      // lib/logoCanvas.ts for why refusing the file outright would be a dead end.
      const prepared = await prepareLogo(file)
      // No optimistic preview (§6.3): logoUrl only advances after BOTH the Storage upload and the
      // `programs` update succeed, so a failure at either step leaves the previous logo showing.
      const url = await uploadLogo(merchant.id, prepared.file)
      await updateProgram(program.id, { logo_url: url })
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

  async function runGenerate(seed?: number) {
    setCardImageError(null)
    setGenerating(true)
    try {
      const result = await generateCardImage(businessDescription, seed)
      setVariants(result.images)
    } catch (err) {
      // rate_limited and image_generation_failed both carry their own message from panel-api;
      // normalizeCode falls back for anything else.
      setCardImageError(normalizeCode(err).message)
      setVariants([])
    } finally {
      setGenerating(false)
    }
  }

  /**
   * Accepting a variant. The order matters and is the logo's: prepare the file, upload it, write
   * the row, and only then move what the merchant sees. A failure at any step leaves the
   * previous graphic on the card rather than showing one that was never stored.
   *
   * The colour follows the image because the card is one object — but only as a suggestion:
   * the picker is not disabled and dominantColor returns null rather than a bad guess.
   */
  async function applyVariant(index: number) {
    setCardImageError(null)
    setApplyingVariant(index)
    try {
      const { file, color } = await prepareCardImage(variants[index])
      const url = await uploadCardImage(merchant.id, file)
      await updateProgram(program.id, { card_image_url: url })
      setCardImageUrl(url)
      if (color) updateValue('color', color)
      await pushBranding()
      reload()
    } catch (err) {
      setCardImageError(
        err instanceof LogoUploadError && err.rejected ? CARD_IMAGE_REJECTED : CARD_IMAGE_FAILED,
      )
    } finally {
      setApplyingVariant(null)
    }
  }

  async function clearCardImage() {
    setCardImageError(null)
    setApplyingVariant(-1)
    try {
      await updateProgram(program.id, { card_image_url: null })
      setCardImageUrl(null)
      setVariants([])
      await pushBranding()
      reload()
    } catch {
      setCardImageError(CARD_IMAGE_FAILED)
    } finally {
      setApplyingVariant(null)
    }
  }

  /**
   * Pushes the row's branding onto the PassKit template, exactly as runSave does — including
   * the `{synced: false}` case, which is a 200 and not a thrown error, and is the silent-failure
   * shape this project has been bitten by before.
   *
   * Only for a published program: a draft has no template yet, so there is nothing to push and
   * the graphic rides in at publication instead. Either way the row IS saved by the time this
   * runs, so a failure here says the card lags, never that the image did not save.
   */
  async function pushBranding() {
    if (program.status !== 'published') return
    try {
      const message = brandingSyncMessage(await syncBranding())
      if (message) setCardImageError(`${BRANDING_LAG_TITLE} ${message}`)
    } catch (err) {
      setCardImageError(`${BRANDING_LAG_TITLE} ${normalizeCode(err).message}`)
    }
  }

  /** Returns whether the save succeeded, so the publish flow (runPublish's caller) can stop
   * before ever opening the confirmation dialog on a failed save (task-14-design.md §3.1: "błąd
   * zapisu -> ErrorSummary + fokus, KONIEC"). The "Zapisz zmiany" button ignores the return value
   * -- it already ends the interaction either way. */
  async function runSave(): Promise<boolean> {
    setSaving(true)
    setServerError(null)
    try {
      await updateProgram(program.id, {
        display_name: values.name.trim(),
        background_color: values.color,
        description: values.description,
        points_per_pln: ratePer100ToPointsPerPln(Number(values.ratePer100)),
      })
      if (userId) clearDraft(userId, DRAFT_KEY)
      // Provisioning runs once, at publication — so for an already-published program the save
      // above changes the panel and nothing else unless we push it to the pass issuer too.
      // A failure here must not read as a failed save: the data IS saved, only the card lags.
      if (program.status === 'published') {
        try {
          const result = await syncBranding()
          // A 200 with synced:false (no PassKit template provisioned yet) is not a thrown error --
          // it's the same silent-failure shape this project has been bitten by before. The data IS
          // saved either way; brandingSyncMessage is what tells the merchant the card itself didn't
          // get the update, instead of the panel simply saying nothing. BRANDING_LAG_TITLE, not
          // SAVE_FAILED_TITLE, because the row update above already succeeded.
          const message = brandingSyncMessage(result)
          if (message) setServerError({ title: BRANDING_LAG_TITLE, body: message })
        } catch (err) {
          setServerError({ title: BRANDING_LAG_TITLE, body: normalizeCode(err).message })
        }
      }
      setSaved(true)
      reload()
      return true
    } catch (err) {
      setServerError({ title: SAVE_FAILED_TITLE, body: `${normalizeCode(err).message} Spróbuj ponownie za chwilę.` })
      setFocusSummaryNonce((n) => n + 1)
      return false
    } finally {
      setSaving(false)
    }
  }

  /** Client-side field validation, shared by the save submit and the publish click (task-14-
   * design.md §3.1's first step is the same `validate(values)` this form already had). Returns
   * whether the values passed; a failure has already moved focus/opened ErrorSummary by the time
   * it returns, so the caller only has to stop. */
  function runValidation(): boolean {
    const fieldErrors = validate(values)
    setErrors(fieldErrors)
    setServerError(null)
    const invalidKeys = Object.keys(fieldErrors) as (keyof FieldErrors)[]

    if (invalidKeys.length === 1) {
      fieldRefs[invalidKeys[0]].current?.focus()
      return false
    }
    if (invalidKeys.length > 1) {
      setFocusSummaryNonce((n) => n + 1)
      return false
    }
    return true
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!runValidation()) return
    await runSave()
  }

  // --- Publish (task-14-design.md §3, §5). ---

  /** The amber button's click handler. A retry after 502/500/network skips straight back to
   * `runPublish()` -- no re-validation, no re-save (nothing changed), no second confirmation
   * (§5.2: the publish button IS the retry button). Otherwise this is step 1-2 of §3.1: validate,
   * then save if dirty, each ending the click on its own failure -- only then does the
   * confirmation dialog, the one truly fallible-feeling step, get to open. */
  async function handlePublishClick() {
    if (confirmedRetry) {
      await runPublish()
      return
    }
    if (!runValidation()) return
    if (isDirty && !(await runSave())) return
    setPublishError(null)
    confirmDialogRef.current?.showModal()
    confirmCancelRef.current?.focus()
  }

  function handleConfirmDialogSubmit() {
    confirmDialogRef.current?.close()
    void runPublish()
  }

  async function runPublish() {
    setPublishing(true)
    setPublishError(null)
    setPublishFieldErrors([])
    try {
      const result = await publishProgram<PublishResponse>()
      reload() // the program row (invite_code) so /zaproszenie has it once the merchant gets there
      if (result.program_key_plaintext) {
        setKeyPlaintext(result.program_key_plaintext)
        setJustPublished(true)
        keyDialogRef.current?.showModal()
        keyCopyButtonRef.current?.focus()
      } else {
        // Idempotent 200 without a key (double click, or another tab published it first) --
        // P2/§5.3: KeyReveal must not open on an empty value, the handoff panel goes straight to
        // variant B.
        setKeyPlaintext(null)
        setJustPublished(true)
      }
    } catch (err) {
      const appError = normalizeCode(err)
      if (appError.fields && appError.fields.length > 0) {
        // 422 (P4): rendered in the form's own ErrorSummary, anchored to the offending fields --
        // not a retry-armed failure, the next click re-validates and re-confirms from scratch.
        setPublishFieldErrors(appError.fields)
        setFocusSummaryNonce((n) => n + 1)
      } else if (appError.code === 'invalid_state_transition') {
        // 409: reload and see whether another tab already published it (§5.3).
        setConfirmedRetry(true)
        const fresh = await getProgram().catch(() => null)
        reload()
        if (fresh?.status === 'published') {
          setKeyPlaintext(null)
          setJustPublished(true)
          setPublishConflictNote(true)
        } else {
          setPublishError(appError.message)
        }
      } else {
        // 502/500/network: stays in draft, safe to retry without re-confirming (§5.2/§5.3).
        setConfirmedRetry(true)
        setPublishError(appError.message)
      }
    } finally {
      setPublishing(false)
    }
  }

  async function handleCopyKey() {
    if (!keyPlaintext) return
    const ok = await copyToClipboard(keyPlaintext)
    setKeyCopyStatus(ok ? 'copied' : 'failed')
  }

  function handleShowKeyAgain() {
    keyDialogRef.current?.showModal()
    keyCopyButtonRef.current?.focus()
  }

  const publishBusy = saving || publishing
  const publishLabel = saving ? 'Zapisywanie…' : publishing ? 'Publikowanie…' : 'Opublikuj program'

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
            <CardPreview
              displayName={values.name}
              backgroundColor={previewColor}
              logoUrl={logoUrl}
              cardImageUrl={cardImageUrl}
            />
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
            {/* One error region on screen, never two (task-14-design.md §5.1) -- save's own
               failure, then publish's 422 field list, then the client-side multi-field case,
               mutually exclusive in that order. */}
            {serverError ? (
              <div className="error-summary" role="alert" tabIndex={-1} ref={errorSummaryRef} style={{ marginBlockEnd: 'var(--space-8)' }}>
                <p className="error-summary__title">{serverError.title}</p>
                <p className="error-summary__body">{serverError.body}</p>
              </div>
            ) : publishFieldErrors.length > 0 ? (
              <div className="error-summary" role="alert" tabIndex={-1} ref={errorSummaryRef} style={{ marginBlockEnd: 'var(--space-8)' }}>
                <p className="error-summary__title">Nie opublikowaliśmy programu.</p>
                <p className="error-summary__body">Uzupełnij poniższe pola i opublikuj ponownie.</p>
                <ul>
                  {mapPublishFieldErrors(publishFieldErrors).map((item, i) => (
                    <li key={i}>{item.id ? <a href={`#${item.id}`}>{item.message}</a> : item.message}</li>
                  ))}
                </ul>
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
                  PNG, JPG lub WEBP, do 1 MB. Najlepiej z przezroczystym tłem, w kolorze
                  kontrastującym z kolorem karty. Miejsce na logo w portfelu jest podłużne, więc
                  poziomy znak z nazwą wypada tam najlepiej — dopasujemy go za Ciebie, nic nie
                  przytniemy. Kwadratowe logo też przejdzie, tylko zajmie mniej miejsca.
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

              {/* Above the colour on purpose: once there is a graphic, the colour is derived
                 from it rather than chosen first. */}
              <div className="fieldset">
                <label className="fieldset__label" htmlFor="prog-business">
                  Grafika karty
                </label>
                <div className="card-gen__ask">
                  <input
                    id="prog-business"
                    className="field"
                    type="text"
                    list="prog-business-categories"
                    maxLength={BUSINESS_DESCRIPTION_MAX}
                    placeholder="Czym zajmuje się Twoja firma?"
                    value={businessDescription}
                    onChange={(e) => setBusinessDescription(e.target.value)}
                    aria-describedby="prog-business-hint"
                  />
                  <datalist id="prog-business-categories">
                    {BUSINESS_CATEGORIES.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={generating || !businessDescription.trim()}
                    aria-busy={generating || undefined}
                    onClick={() => runGenerate()}
                  >
                    {generating ? 'Generuję…' : 'Wygeneruj grafikę'}
                  </button>
                </div>
                <p id="prog-business-hint" className="fieldset__hint">
                  Jedno zdanie wystarczy. Na tej podstawie przygotujemy cztery propozycje paska
                  graficznego na karcie — wybierasz jedną kliknięciem.
                </p>

                {/* Four skeletons while generating, four thumbnails after — the grid never
                   changes size, so nothing on the screen jumps when the images arrive. */}
                <div className="card-gen__grid" aria-live="polite" aria-busy={generating || undefined}>
                  {generating
                    ? Array.from({ length: 4 }, (_, i) => <div key={i} className="card-gen__skeleton" />)
                    : variants.map((src, i) => (
                        <button
                          key={i}
                          type="button"
                          className="card-gen__variant"
                          disabled={applyingVariant !== null}
                          aria-busy={applyingVariant === i || undefined}
                          onClick={() => applyVariant(i)}
                        >
                          <img src={src} alt={`Propozycja grafiki ${i + 1} z ${variants.length}`} />
                        </button>
                      ))}
                </div>

                {variants.length > 0 && !generating && (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={applyingVariant !== null}
                    // A fresh seed, same prompt: four different pictures rather than the same four.
                    onClick={() => runGenerate(Math.floor(Math.random() * 1_000_000))}
                  >
                    Wygeneruj ponownie
                  </button>
                )}

                {cardImageUrl && (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={applyingVariant !== null}
                    aria-busy={applyingVariant === -1 || undefined}
                    onClick={clearCardImage}
                  >
                    Bez grafiki
                  </button>
                )}

                {/* The graphic is a file upload and saves itself; the colour it suggests is a
                   form field and follows the screen's one save button, like every other field.
                   Saying so here is cheaper than a merchant wondering why half of it stuck. */}
                <p className="fieldset__hint">
                  Wybrana grafika zapisuje się od razu. Kolor karty podpowiadamy na jej podstawie —
                  możesz go zmienić, a zapisuje się razem z resztą formularza.
                </p>
                {cardImageError && (
                  <p className="fieldset__error" role="alert">
                    {cardImageError}
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
                {publishError && (
                  <div className="error-summary" style={{ marginBlockStart: 'var(--space-6)' }}>
                    <p className="error-summary__title">Nie udało się opublikować programu.</p>
                    <p className="error-summary__body">{publishError}</p>
                    <p className="error-summary__body">
                      Program został w wersji roboczej. Ponowna publikacja jest bezpieczna.
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  ref={publishButtonRef}
                  className="btn btn--amber btn--lg btn--publish"
                  style={{ marginBlockStart: 'var(--space-6)' }}
                  disabled={publishBusy}
                  aria-busy={publishBusy || undefined}
                  onClick={handlePublishClick}
                >
                  {publishLabel}
                </button>
              </div>
            )}

            {/* Session-state handoff panel (task-14-design.md §2.3, §4.5) -- driven by
               `justPublished`, not `program.status`, so it appears exactly once per publish and
               never lingers as chrome across a later visit or reload. */}
            {justPublished && (
              <div className="panel">
                <div className="panel__head">
                  <h2 ref={handoffHeadingRef} tabIndex={-1} className="panel__title">
                    Program jest opublikowany.
                  </h2>
                </div>
                <p className="panel__note">Kod QR dla klientów jest już gotowy. Wydrukuj go i powieś przy kasie.</p>
                {publishConflictNote && (
                  <p className="panel__note">Ten program został już opublikowany. Odświeżyliśmy jego stan w panelu.</p>
                )}
                {keyPlaintext ? (
                  <p className="panel__note">Klucz do terminala jest widoczny do czasu odświeżenia strony.</p>
                ) : (
                  <p className="panel__note">
                    Klucza do terminala już nie pokażemy. Jeśli go nie masz, wygeneruj nowy w zakładce Integracja.
                  </p>
                )}
                <div style={{ display: 'flex', gap: 'var(--space-5)', flexWrap: 'wrap', marginBlockStart: 'var(--space-6)' }}>
                  {keyPlaintext ? (
                    <button type="button" className="btn btn--ghost" onClick={handleShowKeyAgain}>
                      Pokaż klucz ponownie
                    </button>
                  ) : (
                    <Link to="/integracja" className="btn btn--ghost">
                      Przejdź do integracji
                    </Link>
                  )}
                  <Link to="/zaproszenie" className="btn btn--primary">
                    Przejdź do kodu QR
                  </Link>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* ConfirmDialog (task-14-design.md §3.3, panel-shell.md §5.7) -- native <dialog>, platform
         supplies the focus trap, Esc and backdrop inertness. Cancel is the initially focused
         control (§9: the risky action here is confirming). */}
      <dialog ref={confirmDialogRef} className="confirm" aria-labelledby="confirm-title" aria-describedby="confirm-desc">
        <h2 id="confirm-title" className="confirm__title">
          Opublikować program?
        </h2>
        <p id="confirm-desc" className="confirm__body">
          Publikacji nie da się cofnąć. Od tej chwili klienci mogą dołączać do programu, a kod QR zaproszenia zaczyna
          działać.
        </p>
        <p className="confirm__body">Nazwę, logo, kolor i przelicznik możesz zmieniać także po publikacji.</p>
        <div className="confirm__actions">
          <button type="button" ref={confirmCancelRef} className="btn btn--ghost" onClick={() => confirmDialogRef.current?.close()}>
            Anuluj
          </button>
          <button type="button" className="btn btn--amber" onClick={handleConfirmDialogSubmit}>
            Opublikuj program
          </button>
        </div>
      </dialog>

      {/* KeyReveal (task-14-design.md §4.4, panel-shell.md §5.7) -- same dialog primitive, but the
         risky action here is closing, so "Kopiuj klucz" carries the initial focus instead of the
         cancel-equivalent control. */}
      <dialog ref={keyDialogRef} className="confirm" aria-labelledby="key-title" aria-describedby="key-desc">
        <h2 id="key-title" className="confirm__title">
          Klucz do terminala
        </h2>
        <p id="key-desc" className="confirm__body">
          Pokazujemy go tylko teraz. Po odświeżeniu strony zobaczysz już wyłącznie jego końcówkę.
        </p>
        {keyPlaintext && (
          <p className="key-plaintext" tabIndex={0} aria-label="Klucz do terminala">
            {keyPlaintext}
          </p>
        )}
        <p className="confirm__body">
          Tym kluczem aplikacja płatnicza na terminalu łączy się z Twoim programem. Przekaż go osobie, która
          konfiguruje terminal.
        </p>
        <p className="confirm__body">
          Jeśli go nie zapiszesz, wygeneruj nowy w zakładce Integracja. Dopóki terminal nie jest skonfigurowany, nic
          to nie psuje.
        </p>
        <div className="confirm__actions">
          <span role="status" style={{ fontSize: 13, lineHeight: '19.5px', color: 'var(--text-3)', marginInlineEnd: 'auto' }}>
            {keyCopyStatus === 'copied' ? 'Skopiowano' : ''}
          </span>
          <button type="button" className="btn btn--ghost" onClick={() => keyDialogRef.current?.close()}>
            Zamknij
          </button>
          <button type="button" ref={keyCopyButtonRef} className="btn btn--primary" onClick={handleCopyKey}>
            {keyCopyStatus === 'copied' ? 'Skopiowano' : 'Kopiuj klucz'}
          </button>
        </div>
        {keyCopyStatus === 'failed' && (
          <p className="fieldset__error" role="alert" style={{ marginBlockStart: 'var(--space-5)' }}>
            Nie udało się skopiować. Zaznacz klucz i skopiuj ręcznie.
          </p>
        )}
      </dialog>
    </>
  )
}
