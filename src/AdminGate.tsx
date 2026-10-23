import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import './admin.css'

type GateState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'not-admin'; email: string }
  | { status: 'admin'; email: string; displayName: string }

function AdminLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setBusy(false)
    if (signInError) {
      setError('No pudimos iniciar sesión. Revisa el correo y la contraseña.')
      return
    }
    onSignedIn()
  }

  return (
    <main className="admin-shell">
      <section className="admin-panel" aria-labelledby="admin-title">
        <a className="admin-wordmark" href="/">LIBRE <span>femme</span></a>
        <p className="admin-eyebrow">ESPACIO PRIVADO</p>
        <h1 id="admin-title">Administración.</h1>
        <p className="admin-intro">Acceso reservado a la administración de LIBRE femme.</p>
        {!isSupabaseConfigured ? (
          <div className="admin-notice" role="status">
            <strong>Falta configurar Supabase.</strong>
            <p>Crea el archivo <code>.env.local</code> a partir de <code>.env.example</code> y añade la URL del proyecto y la clave pública (publishable/anon). Reinicia el servidor de desarrollo después de guardarlo.</p>
          </div>
        ) : (
          <form className="admin-form" onSubmit={handleSubmit}>
            <label htmlFor="admin-email">Correo electrónico</label>
            <input id="admin-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
            <label htmlFor="admin-password">Contraseña</label>
            <input id="admin-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            {error && <p className="admin-error" role="alert">{error}</p>}
            <button className="admin-submit" type="submit" disabled={busy}>{busy ? 'Comprobando…' : 'Iniciar sesión'} <span aria-hidden="true">↗</span></button>
            <p className="admin-footnote">No hay registro público. Las cuentas se crean manualmente desde Supabase.</p>
          </form>
        )}
        <a className="admin-back-link" href="/">← Volver a la tienda</a>
      </section>
    </main>
  )
}

export default function AdminGate() {
  const [gate, setGate] = useState<GateState>(() =>
    supabase ? { status: 'loading' } : { status: 'signed-out' },
  )

  useEffect(() => {
    if (!supabase) return

    let active = true
    let latestCheck = 0

    async function checkSession(session: Session | null) {
      const checkId = ++latestCheck
      if (!session) {
        if (active) setGate({ status: 'signed-out' })
        return
      }

      if (active) setGate({ status: 'loading' })
      const { data, error } = await supabase!
        .from('profiles')
        .select('role, display_name')
        .eq('id', session.user.id)
        .maybeSingle()

      if (!active || checkId !== latestCheck) return
      if (error || !data || data.role !== 'admin') {
        setGate({ status: 'not-admin', email: session.user.email ?? '' })
        return
      }
      setGate({
        status: 'admin',
        email: session.user.email ?? '',
        displayName: data.display_name,
      })
    }

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        if (active) setGate({ status: 'signed-out' })
        return
      }
      return checkSession(data.session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void checkSession(session)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  async function refreshAfterLogin() {
    if (!supabase) return
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      setGate({ status: 'signed-out' })
      return
    }
    setGate({ status: 'loading' })
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role, display_name')
      .eq('id', data.session.user.id)
      .maybeSingle()
    if (error || !profile || profile.role !== 'admin') {
      setGate({ status: 'not-admin', email: data.session.user.email ?? '' })
      return
    }
    setGate({ status: 'admin', email: data.session.user.email ?? '', displayName: profile.display_name })
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut()
    setGate({ status: 'signed-out' })
    window.history.replaceState({}, '', '/admin/login')
  }

  if (gate.status === 'loading') {
    return <main className="admin-shell"><div className="admin-loading" role="status">Comprobando acceso privado…</div></main>
  }
  if (gate.status === 'signed-out') return <AdminLogin onSignedIn={() => void refreshAfterLogin()} />
  if (gate.status === 'not-admin') {
    return (
      <main className="admin-shell">
        <section className="admin-panel">
          <a className="admin-wordmark" href="/">LIBRE <span>femme</span></a>
          <p className="admin-eyebrow">ACCESO RESTRINGIDO</p>
          <h1>Esta cuenta no tiene permisos.</h1>
          <p className="admin-intro">La sesión se inició, pero el usuario no está habilitado como administrador. No se ha concedido acceso al panel.</p>
          <button className="admin-submit" type="button" onClick={() => void signOut()}>Cerrar sesión</button>
          <a className="admin-back-link" href="/">Volver a la tienda</a>
        </section>
      </main>
    )
  }

  return (
    <main className="admin-shell admin-shell-dashboard">
      <section className="admin-dashboard">
        <header className="admin-dashboard-header">
          <a className="admin-wordmark" href="/">LIBRE <span>femme</span></a>
          <button className="admin-signout" type="button" onClick={() => void signOut()}>Cerrar sesión</button>
        </header>
        <p className="admin-eyebrow">PANEL PRIVADO</p>
        <h1>Hola, {gate.displayName}.</h1>
        <p className="admin-intro">Has iniciado sesión con una cuenta autorizada. Este es el punto de partida del panel de gestión.</p>
        <div className="admin-status-card">
          <span className="admin-status-dot" />
          <div><strong>Acceso de administrador verificado</strong><p>{gate.email}</p></div>
        </div>
        <div className="admin-notice">
          <strong>Panel inicial</strong>
          <p>El catálogo, las compras, el inventario y los pedidos todavía no están conectados a esta interfaz. Antes de operar, validaremos las migraciones y los permisos de la base de datos.</p>
        </div>
        <a className="admin-back-link" href="/">← Volver a la tienda pública</a>
      </section>
    </main>
  )
}
