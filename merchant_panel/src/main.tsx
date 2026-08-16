// This import MUST run before anything that creates the Supabase client (./lib/supabase, first
// pulled in transitively by App.tsx below): it reads GoTrue's dead-link URL fragment before
// createClient()'s own detectSessionInUrl gets a chance to touch it. See lib/authHash.ts.
import './lib/authHash'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/inter'
import './styles.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
