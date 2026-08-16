import { Navigate, Route, Routes } from 'react-router-dom'

// Placeholder screens — the real shell (AppShell, SideNav, ProgramStateChip, DraftGate) is
// task 12's job (panel-shell-design.md), the first screen inside a logged-in session; task 11
// is authentication, whose login screen sits outside the shell. This only proves the route
// table and the / -> /karta redirect the spec fixes in its "First run" section (§7): "/" and
// unknown paths always land on /karta.
function Screen({ label }: { label: string }) {
  return <p>{label}</p>
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/karta" replace />} />
      <Route path="/karta" element={<Screen label="Karta programu" />} />
      <Route path="/klienci" element={<Screen label="Klienci" />} />
      <Route path="/transakcje" element={<Screen label="Transakcje" />} />
      <Route path="/integracja" element={<Screen label="Integracja" />} />
      <Route path="/zaproszenie" element={<Screen label="Zaproszenie" />} />
      <Route path="*" element={<Navigate to="/karta" replace />} />
    </Routes>
  )
}

export default App
