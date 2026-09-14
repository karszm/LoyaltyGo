import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PostgrestError, StorageApiError } from '@supabase/supabase-js'
import { memberFixture, merchantFixture, programFixture, transactionFixture } from '../test/fixtures'
import {
  countMembers,
  createMerchant,
  createProgram,
  getMerchant,
  getProgram,
  listMembers,
  listTransactions,
  unwrap,
  updateProgram,
  uploadCardImage,
  uploadLogo,
} from './db'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  storageFrom: vi.fn(),
}))

vi.mock('./supabase', () => ({
  supabase: {
    from: mocks.from,
    storage: { from: mocks.storageFrom },
  },
}))

function postgrestError(code: string) {
  return new PostgrestError({ code, message: 'driver message', details: '', hint: '' })
}

function terminalBuilder(response: unknown) {
  const builder = {
    select: vi.fn(),
    single: vi.fn().mockResolvedValue(response),
    insert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
  }
  builder.select.mockReturnValue(builder)
  builder.insert.mockReturnValue(builder)
  builder.update.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  return builder
}

function listBuilder(response: unknown) {
  const builder = {
    select: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    or: vi.fn(),
    eq: vi.fn(),
    then: vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve)),
  }
  builder.select.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  builder.limit.mockReturnValue(builder)
  builder.or.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  return builder
}

describe('db adapter', () => {
  beforeEach(() => vi.resetAllMocks())

  it('unwrap zwraca dane z poprawnej odpowiedzi', async () => {
    const value = merchantFixture()

    await expect(unwrap(Promise.resolve({ data: value, error: null }))).resolves.toEqual(value)
  })

  it('unwrap normalizuje błąd PostgREST', async () => {
    await expect(
      unwrap(Promise.resolve({ data: null, error: postgrestError('PGRST116') })),
    ).rejects.toMatchObject({ code: 'not_found', message: 'Nie znaleziono zasobu.' })
  })

  it('getMerchant i getProgram wybierają pojedynczy rekord pod ochroną RLS', async () => {
    const merchantBuilder = terminalBuilder({ data: merchantFixture(), error: null })
    const programBuilder = terminalBuilder({ data: programFixture(), error: null })
    mocks.from.mockImplementation((table) => table === 'merchants' ? merchantBuilder : programBuilder)

    await expect(getMerchant()).resolves.toEqual(merchantFixture())
    await expect(getProgram()).resolves.toEqual(programFixture())

    expect(mocks.from).toHaveBeenCalledWith('merchants')
    expect(mocks.from).toHaveBeenCalledWith('programs')
    expect(merchantBuilder.single).toHaveBeenCalledTimes(1)
    expect(programBuilder.single).toHaveBeenCalledTimes(1)
  })

  it('updateProgram zawsze ogranicza zapis po id', async () => {
    const builder = terminalBuilder({ data: programFixture({ display_name: 'Nowa' }), error: null })
    mocks.from.mockReturnValue(builder)

    await updateProgram('program-1', { display_name: 'Nowa' })

    expect(builder.update).toHaveBeenCalledWith({ display_name: 'Nowa' })
    expect(builder.eq).toHaveBeenCalledWith('id', 'program-1')
    expect(builder.single).toHaveBeenCalledTimes(1)
  })

  it('createMerchant zwraca nowy rekord po udanym insercie', async () => {
    const merchant = merchantFixture()
    const builder = terminalBuilder({ data: merchant, error: null })
    mocks.from.mockReturnValue(builder)

    await expect(createMerchant('user-1', 'owner@example.test', 'Studio Forma')).resolves.toEqual(merchant)

    expect(builder.insert).toHaveBeenCalledWith({
      auth_user_id: 'user-1',
      email: 'owner@example.test',
      company_name: 'Studio Forma',
    })
  })

  it('createMerchant po wyścigu 23505 odczytuje istniejący rekord', async () => {
    const insertBuilder = terminalBuilder({ data: null, error: postgrestError('23505') })
    const selectBuilder = terminalBuilder({ data: merchantFixture(), error: null })
    mocks.from.mockReturnValueOnce(insertBuilder).mockReturnValueOnce(selectBuilder)

    await expect(createMerchant('user-1', 'owner@example.test', 'Studio Forma')).resolves.toEqual(merchantFixture())

    expect(mocks.from).toHaveBeenNthCalledWith(1, 'merchants')
    expect(mocks.from).toHaveBeenNthCalledWith(2, 'merchants')
  })

  it('createMerchant nie ukrywa innych błędów inserta', async () => {
    const builder = terminalBuilder({ data: null, error: postgrestError('42501') })
    mocks.from.mockReturnValue(builder)

    await expect(createMerchant('user-1', 'owner@example.test', 'Studio Forma')).rejects.toMatchObject({
      code: 'permission_denied',
    })
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })

  it('createProgram po wyścigu 23505 odczytuje istniejący program', async () => {
    const insertBuilder = terminalBuilder({ data: null, error: postgrestError('23505') })
    const selectBuilder = terminalBuilder({ data: programFixture(), error: null })
    mocks.from.mockReturnValueOnce(insertBuilder).mockReturnValueOnce(selectBuilder)

    await expect(createProgram('merchant-1')).resolves.toEqual(programFixture())

    expect(insertBuilder.insert).toHaveBeenCalledWith({ merchant_id: 'merchant-1' })
    expect(mocks.from).toHaveBeenNthCalledWith(2, 'programs')
  })

  it('listMembers sortuje, limituje i nie dodaje pustego filtra', async () => {
    const rows = [memberFixture()]
    const builder = listBuilder({ data: rows, count: 1, error: null })
    mocks.from.mockReturnValue(builder)

    await expect(listMembers('')).resolves.toEqual({ rows, count: 1 })

    expect(mocks.from).toHaveBeenCalledWith('members')
    expect(builder.select).toHaveBeenCalledWith(expect.stringContaining('last_name'), { count: 'exact' })
    expect(builder.order).toHaveBeenCalledWith('joined_at', { ascending: false })
    expect(builder.limit).toHaveBeenCalledWith(200)
    expect(builder.or).not.toHaveBeenCalled()
  })

  it('listMembers przekazuje wyszukiwanie nazwiska i e-maila do PostgREST', async () => {
    const builder = listBuilder({ data: [], count: null, error: null })
    mocks.from.mockReturnValue(builder)

    await expect(listMembers('Kowalska')).resolves.toEqual({ rows: [], count: 0 })

    expect(builder.or).toHaveBeenCalledWith('last_name.ilike.*Kowalska*,email.ilike.*Kowalska*')
  })

  it('listTransactions zachowuje kolejność biznesową i filtruje po kliencie', async () => {
    const rows = [transactionFixture()]
    const builder = listBuilder({ data: rows, count: 1, error: null })
    mocks.from.mockReturnValue(builder)

    await expect(listTransactions('member-1')).resolves.toEqual({ rows, count: 1 })

    expect(mocks.from).toHaveBeenCalledWith('transactions')
    expect(builder.order).toHaveBeenNthCalledWith(1, 'performed_at', { ascending: false })
    expect(builder.order).toHaveBeenNthCalledWith(2, 'id', { ascending: true })
    expect(builder.limit).toHaveBeenCalledWith(200)
    expect(builder.eq).toHaveBeenCalledWith('member_id', 'member-1')
  })

  it('countMembers używa lekkiego zapytania head z dokładnym count', async () => {
    const builder = listBuilder({ data: null, count: 12, error: null })
    mocks.from.mockReturnValue(builder)

    await expect(countMembers()).resolves.toBe(12)

    expect(builder.select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
  })

  it('uploadLogo tworzy nowy klucz i zwraca publiczny URL', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const storage = {
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://cdn.example/logo.webp' } }),
    }
    mocks.storageFrom.mockReturnValue(storage)
    const file = new File(['logo'], 'logo.webp', { type: 'image/webp' })

    await expect(uploadLogo('merchant-1', file)).resolves.toBe('https://cdn.example/logo.webp')

    expect(mocks.storageFrom).toHaveBeenCalledWith('program-logos')
    expect(storage.upload).toHaveBeenCalledWith('merchant-1/logo-1700000000000.webp', file)
    expect(storage.getPublicUrl).toHaveBeenCalledWith('merchant-1/logo-1700000000000.webp')
  })

  it('uploadCardImage odróżnia odmowę Storage od awarii transportu', async () => {
    const file = new File(['image'], 'card.png', { type: 'image/png' })
    const storage = {
      upload: vi
        .fn()
        .mockResolvedValueOnce({ error: new StorageApiError('za duży', 413, '413') })
        .mockResolvedValueOnce({ error: new Error('offline') }),
      getPublicUrl: vi.fn(),
    }
    mocks.storageFrom.mockReturnValue(storage)

    await expect(uploadCardImage('merchant-1', file)).rejects.toMatchObject({ rejected: true })
    await expect(uploadCardImage('merchant-1', file)).rejects.toMatchObject({ rejected: false })
    expect(storage.getPublicUrl).not.toHaveBeenCalled()
  })
})
