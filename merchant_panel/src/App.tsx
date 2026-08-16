import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth, SessionProvider } from './lib/session'
import { RequireProgram, RootRedirect, useProgram } from './lib/program'
import Login from './screens/Login'
import AuthCallback from './screens/AuthCallback'
import Onboarding from './screens/Onboarding'
import CardWizard from './screens/CardWizard'
import Members from './screens/Members'
import Transactions from './screens/Transactions'
import Invite from './screens/Invite'
import { DraftGate } from './components/DraftGate'

// Placeholder screen body for task 17 (/integracja) -- each real screen owns its own
// h1#screen-title and (for the gated ones) its own DraftGate note in that screen's terms
// (panel-shell-design.md §2(b)); until that task lands, this is enough to prove the
// shell/gate/routing wiring task 12 owns actually works end to end.
function PlaceholderScreen({ label, gateNote }: { label: string; gateNote?: string }) {
  const { program } = useProgram()
  const gated = gateNote !== undefined && program.status !== 'published'
  return (
    <>
      <h1
        id="screen-title"
        tabIndex={-1}
        style={{ fontSize: 20, lineHeight: '28px', fontWeight: 590, color: 'var(--text-1)' }}
      >
        {label}
      </h1>
      <div style={{ marginBlockStart: 'var(--space-8)' }}>
        {gated ? (
          <DraftGate note={gateNote} />
        ) : (
          <p style={{ color: 'var(--text-3)' }}>Ekran budowany w kolejnym zadaniu.</p>
        )}
      </div>
    </>
  )
}

function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth" element={<AuthCallback />} />
        <Route element={<RequireAuth />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<RequireProgram />}>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/karta" element={<CardWizard />} />
            <Route path="/klienci" element={<Members />} />
            <Route path="/transakcje" element={<Transactions />} />
            <Route
              path="/integracja"
              element={
                <PlaceholderScreen
                  label="Integracja"
                  gateNote="Klucz programu będzie dostępny po publikacji programu."
                />
              }
            />
            <Route path="/zaproszenie" element={<Invite />} />
            <Route path="*" element={<Navigate to="/karta" replace />} />
          </Route>
        </Route>
      </Routes>
    </SessionProvider>
  )
}

export default App
