import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AdminGate from './AdminGate.tsx'

const isAdminRoute = window.location.pathname === '/admin' ||
  window.location.pathname === '/admin/' ||
  window.location.pathname === '/admin/login'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAdminRoute ? <AdminGate /> : <App />}
  </StrictMode>,
)
