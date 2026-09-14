// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataTable, SkeletonRows, type DataTableColumn } from './DataTable'
import { DraftGate } from './DraftGate'
import { Empty } from './Empty'
import { ProgramStateChip } from './ProgramStateChip'

afterEach(() => cleanup())

describe('komponenty wspólne panelu', () => {
  it('DraftGate wyjaśnia blokadę i prowadzi do karty programu', () => {
    render(
      <MemoryRouter>
        <DraftGate note="Najpierw opublikuj program." />
      </MemoryRouter>,
    )

    expect(screen.getByText('Program jest jeszcze w wersji roboczej.')).toBeInTheDocument()
    expect(screen.getByText('Najpierw opublikuj program.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Przejdź do karty programu' })).toHaveAttribute('href', '/karta')
  })

  it.each([
    ['draft', 'Wersja robocza'],
    ['published', 'Opublikowany'],
    ['suspended', 'Zawieszony'],
    ['closed', 'Zamknięty'],
  ] as const)('pokazuje etykietę statusu %s', (status, label) => {
    render(<MemoryRouter><ProgramStateChip status={status} /></MemoryRouter>)

    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', '/karta')
  })

  it('Empty obsługuje akcję nawigacyjną', () => {
    render(
      <MemoryRouter>
        <Empty headline="Brak danych" note="Dodaj pierwszy rekord." action={{ label: 'Dodaj', to: '/nowy' }} />
      </MemoryRouter>,
    )

    expect(screen.getByText('Brak danych')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Dodaj' })).toHaveAttribute('href', '/nowy')
  })

  it('Empty obsługuje akcję ponowienia', async () => {
    const retry = vi.fn()
    render(
      <MemoryRouter>
        <Empty headline="Błąd" note="Spróbuj ponownie." action={{ label: 'Ponów', onClick: retry, variant: 'ghost' }} />
      </MemoryRouter>,
    )

    await userEvent.setup().click(screen.getByRole('button', { name: 'Ponów' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('DataTable wystawia role i wartości widoczne dla użytkownika', () => {
    const columns: DataTableColumn<{ id: string; name: string; points: number }>[] = [
      { key: 'name', header: 'Klient', minWidth: '1fr', render: (row) => row.name },
      { key: 'points', header: 'Punkty', minWidth: '80px', numeric: true, render: (row) => row.points },
    ]
    render(
      <>
        <h1 id="screen-title">Klienci</h1>
        <DataTable
          columns={columns}
          rows={[{ id: '1', name: 'Anna Kowalska', points: 42 }]}
          rowKey={(row) => row.id}
          scrollLabel="Lista klientów"
        />
      </>,
    )

    expect(screen.getByRole('region', { name: 'Lista klientów' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('table')).toHaveAttribute('aria-labelledby', 'screen-title')
    expect(screen.getAllByRole('columnheader')).toHaveLength(2)
    expect(screen.getAllByRole('row')).toHaveLength(2)
    expect(screen.getByRole('cell', { name: 'Anna Kowalska' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '42' })).toHaveClass('data-table__cell--num')
  })

  it('SkeletonRows jest semantycznie ukryty w nazwanym regionie', () => {
    const columns: DataTableColumn<{ id: string }>[] = [
      { key: 'id', header: 'ID', minWidth: '1fr', render: (row) => row.id },
    ]
    render(<SkeletonRows columns={columns} scrollLabel="Wczytywana lista" />)

    expect(screen.getByRole('region', { name: 'Wczytywana lista' })).toBeInTheDocument()
    expect(document.querySelector('[role="table"]')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
