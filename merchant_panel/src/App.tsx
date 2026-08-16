import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth, SessionProvider } from './lib/session'
import Login from './screens/Login'
import AuthCallback from './screens/AuthCallback'

// Placeholder screens — the real shell (AppShell, SideNav, ProgramStateChip, DraftGate) is
// task 12's job (panel-shell-design.md), the first screen inside a logged-in session. This only
// proves the route table and the / -> /karta redirect the spec fixes in its "First run" section
// (§7): "/" and unknown paths always land on /karta, once authenticated.
function Screen({ label }: { label: string }) {
  return <p>{label}</p>
}

function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth" element={<AuthCallback />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<Navigate to="/karta" replace />} />
          <Route path="/karta" element={<Screen label="Karta programu" />} />
          <Route path="/klienci" element={<Screen label="Klienci" />} />
          <Route path="/transakcje" element={<Screen label="Transakcje" />} />
          <Route path="/integracja" element={<Screen label="Integracja" />} />
          <Route path="/zaproszenie" element={<Screen label="Zaproszenie" />} />
          <Route path="*" element={<Navigate to="/karta" replace />} />
        </Route>
      </Routes>
    </SessionProvider>
  )
}

export default App
