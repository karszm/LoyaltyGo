// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { programFixture } from '../test/fixtures'
import { AppShell } from './AppShell'
import { SideNav } from './SideNav'

describe('AppShell', () => {
  it('ma skip link i przenosi fokus na tytuł ekranu', () => {
    render(
      <AppShell sideNav={<nav aria-label="Testowa nawigacja" />}>
        <h1 id="screen-title" tabIndex={-1}>Klienci</h1>
      </AppShell>,
    )

    expect(screen.getByRole('link', { name: 'Przejdź do treści' })).toHaveAttribute('href', '#main')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
    expect(screen.getByRole('heading', { name: 'Klienci' })).toHaveFocus()
  })

  it('przenosi fokus na nowy tytuł po zmianie ekranu', () => {
    const view = render(
      <AppShell sideNav={null}>
        <h1 id="screen-title" key="first" tabIndex={-1}>Klienci</h1>
      </AppShell>,
    )
    expect(screen.getByRole('heading', { name: 'Klienci' })).toHaveFocus()

    view.rerender(
      <AppShell sideNav={null}>
        <h1 id="screen-title" key="second" tabIndex={-1}>Transakcje</h1>
      </AppShell>,
    )

    expect(screen.getByRole('heading', { name: 'Transakcje' })).toHaveFocus()
  })
})

describe('SideNav', () => {
  it('renderuje wszystkie miejsca panelu i oznacza aktywną trasę', () => {
    render(
      <MemoryRouter initialEntries={['/klienci']}>
        <SideNav program={programFixture({ status: 'published' })} merchantEmail="owner@example.test" onLogout={vi.fn()} />
      </MemoryRouter>,
    )

    expect(screen.getAllByRole('link', { name: 'Klienci' })).toHaveLength(2)
    for (const link of screen.getAllByRole('link', { name: 'Klienci' })) {
      expect(link).toHaveAttribute('aria-current', 'page')
    }
    expect(screen.getAllByText('Studio Forma')).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: 'Opublikowany' })).toHaveLength(2)
  })

  it('wywołuje logout z obu wariantów nawigacji', async () => {
    const logout = vi.fn()
    render(
      <MemoryRouter>
        <SideNav program={programFixture()} onLogout={logout} />
      </MemoryRouter>,
    )

    const buttons = screen.getAllByRole('button', { name: 'Wyloguj' })
    await userEvent.setup().click(buttons[0])
    await userEvent.setup().click(buttons[1])

    expect(logout).toHaveBeenCalledTimes(2)
  })

  it('w stanie ładowania nie pokazuje nieprawdziwej nazwy ani statusu', () => {
    render(<MemoryRouter><SideNav onLogout={vi.fn()} /></MemoryRouter>)

    expect(screen.queryByText('Studio Forma')).not.toBeInTheDocument()
    expect(screen.queryByText('Wersja robocza')).not.toBeInTheDocument()
    expect(document.querySelectorAll('.skeleton')).toHaveLength(2)
  })
})
