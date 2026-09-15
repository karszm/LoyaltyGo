import type { Merchant, Program, Member, TransactionRow } from '../lib/db'

export function merchantFixture(overrides: Partial<Merchant> = {}): Merchant {
  return {
    id: 'merchant-1',
    email: 'owner@example.test',
    contact_email: null,
    company_name: 'Studio Forma',
    created_at: '2026-09-01T10:00:00.000Z',
    ...overrides,
  }
}

export function programFixture(overrides: Partial<Program> = {}): Program {
  return {
    id: 'program-1',
    status: 'draft',
    display_name: 'Studio Forma',
    logo_url: null,
    background_color: '#34363c',
    description: null,
    points_per_pln: 0.1,
    invite_code: null,
    card_image_url: null,
    text_color: '#ffffff',
    ...overrides,
  }
}

export function memberFixture(overrides: Partial<Member> = {}): Member {
  return {
    id: 'member-1',
    first_name: 'Anna',
    last_name: 'Kowalska',
    email: 'anna@example.test',
    points_balance: 42,
    status: 'active',
    last_transaction_at: '2026-09-13T12:00:00.000Z',
    joined_at: '2026-09-01T10:00:00.000Z',
    ...overrides,
  }
}

export function transactionFixture(overrides: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: 'transaction-1',
    performed_at: '2026-09-13T12:00:00.000Z',
    synced_at: '2026-09-13T12:00:01.000Z',
    delayed_sync: false,
    amount: 100,
    points_awarded: 10,
    points_reverted: null,
    correction: null,
    status: 'registered',
    softpos_transaction_id: 'pos-1',
    source: 'softpos',
    description: null,
    members: { first_name: 'Anna', last_name: 'Kowalska' },
    coupon_redemptions: [],
    ...overrides,
  }
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}
