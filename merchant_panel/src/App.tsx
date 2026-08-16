import { Navigate, Route, Routes } from 'react-router-dom'

// Placeholder screens — the real shell (sidebar, state chip, all five screens) is task 11's
// job (panel-shell-design.md). This only proves the route table and the / -> /karta redirect
// the spec fixes in its "First run" section (§7): "/" and unknown paths always land on /karta.
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
