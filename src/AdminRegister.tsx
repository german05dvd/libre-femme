import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

type FinancialEntry = {
  id: string
  created_at: string
  entry_type: 'purchase' | 'sale' | 'adjustment_in' | 'adjustment_out'
  status: string
  reference: string | null
  notes: string | null
  purchase_total_usd: number | null
  sales_total_usd: number | null
  cost_of_sales_usd: number | null
  unit_count: number
}
type Period = 'today' | '3days' | 'week' | 'month' | 'quarter' | 'halfyear' | 'year' | 'custom'
const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0))
const dateInput = (date: Date) => {
  const year = date.getFullYear(), month = String(date.getMonth() + 1).padStart(2, '0'), day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
const dateLabel = (value: string) => new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
const entryLabel: Record<FinancialEntry['entry_type'], string> = {
  purchase: 'Compra de lote',
  sale: 'Venta registrada',
  adjustment_in: 'Ajuste de entrada',
  adjustment_out: 'Ajuste de salida',
}
function getRange(period: Period, from: string, to: string) {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  if (period === '3days') start.setDate(start.getDate() - 2)
  if (period === 'week') start.setDate(start.getDate() - 6)
  if (period === 'month') start.setDate(1)
  if (period === 'quarter') start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1)
  if (period === 'halfyear') start.setMonth(start.getMonth() < 6 ? 0 : 6, 1)
  if (period === 'year') start.setMonth(0, 1)
  if (period === 'custom') {
    const customStart = new Date(`${from}T00:00:00`)
    const customEnd = new Date(`${to}T00:00:00`)
    if (Number.isNaN(customStart.getTime()) || Number.isNaN(customEnd.getTime()) || customStart > customEnd) return null
    customEnd.setDate(customEnd.getDate() + 1)
    return { start: customStart.toISOString(), end: customEnd.toISOString() }
  }
  const tomorrow = new Date(end)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  return { start: start.toISOString(), end: tomorrow.toISOString() }
}

export default function AdminRegister() {
  const [entries, setEntries] = useState<FinancialEntry[]>([])
  const [period, setPeriod] = useState<Period>('month')
  const [from, setFrom] = useState(() => dateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [to, setTo] = useState(() => dateInput(new Date()))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const range = useMemo(() => getRange(period, from, to), [period, from, to])

  const load = useCallback(async () => {
    if (!supabase || !range) { setEntries([]); setLoading(false); return }
    setLoading(true)
    const { data, error: queryError } = await supabase
      .from('admin_financial_entries')
      .select('id,created_at,entry_type,status,reference,notes,purchase_total_usd,sales_total_usd,cost_of_sales_usd,unit_count')
      .gte('created_at', range.start)
      .lt('created_at', range.end)
      .order('created_at', { ascending: false })
    if (queryError) {
      setError('No se pudo cargar el resumen financiero: ' + queryError.message)
      setEntries([])
    } else {
      setError('')
      setEntries((data ?? []) as FinancialEntry[])
    }
    setLoading(false)
  }, [range])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  const summary = useMemo(() => entries.reduce((totals, entry) => {
    if (entry.status !== 'confirmed') return totals
    if (entry.entry_type === 'purchase') totals.purchases += Number(entry.purchase_total_usd ?? 0)
    if (entry.entry_type === 'sale') {
      totals.sales += Number(entry.sales_total_usd ?? 0)
      totals.costOfSales += Number(entry.cost_of_sales_usd ?? 0)
    }
    return totals
  }, { sales: 0, purchases: 0, costOfSales: 0 }), [entries])

  return <div className="admin-purchases">
    {error && <p className="admin-feedback admin-feedback-error" role="alert">{error}</p>}
    <section className="admin-section">
      <div className="admin-section-heading">
        <div><p className="admin-kicker">RESULTADOS DEL NEGOCIO</p><h2>Resumen financiero</h2></div>
        <button className="admin-secondary" type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Actualizando…' : 'Actualizar'}</button>
      </div>
      <div className="admin-product-form admin-register-filters">
        <label>Periodo del informe<select value={period} onChange={event => setPeriod(event.target.value as Period)}>
          <option value="today">Hoy</option><option value="3days">Últimos 3 días</option><option value="week">Últimos 7 días</option><option value="month">Mes actual</option><option value="quarter">Trimestre actual</option><option value="halfyear">Semestre actual</option><option value="year">Año actual</option><option value="custom">Rango personalizado</option>
        </select></label>
        {period === 'custom' && <><label>Desde<input type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} /></label><label>Hasta<input type="date" value={to} min={from} onChange={event => setTo(event.target.value)} /></label></>}
      </div>
      {!range && <p className="admin-feedback admin-feedback-error" role="alert">Revisa las fechas: el inicio debe ser anterior o igual al final.</p>}
      <div className="admin-register-summary">
        <article><span>Ventas registradas</span><strong>{money(summary.sales)}</strong></article>
        <article><span>Coste de lo vendido</span><strong>{money(summary.costOfSales)}</strong></article>
        <article><span>Ganancia bruta</span><strong>{money(summary.sales - summary.costOfSales)}</strong></article>
        <article><span>Coste de lotes recibidos</span><strong>{money(summary.purchases)}</strong></article>
      </div>
      <p className="admin-footnote">Las compras se muestran por lote con su coste total, aunque dentro del inventario se detallen todas las prendas. La ganancia bruta es ventas menos el coste de las unidades vendidas (FIFO); no es lo mismo que el dinero en caja y no descuenta gastos operativos. No se crean ventas al preparar WhatsApp: registra aquí la venta real desde Registro de movimientos.</p>
    </section>
    <section className="admin-section">
      <div className="admin-section-heading"><div><p className="admin-kicker">OPERACIONES AGRUPADAS</p><h2>Compras y ventas</h2></div><span className="admin-status">{entries.filter(e => e.status === 'confirmed').length} registros confirmados</span></div>
      {loading ? <p className="admin-empty">Cargando operaciones…</p> : entries.length === 0 ? <p className="admin-empty">No hay operaciones en este periodo. Registra manualmente una compra de lote o una venta confirmada.</p> : (
        <div className="admin-record-list">
          {entries.map(entry => {
            const isPurchase = entry.entry_type === 'purchase'
            const isSale = entry.entry_type === 'sale'
            const total = isPurchase ? Number(entry.purchase_total_usd ?? 0) : isSale ? Number(entry.sales_total_usd ?? 0) : 0
            const cost = isSale ? Number(entry.cost_of_sales_usd ?? 0) : 0
            return <article className="admin-record" key={entry.id}>
              <div className="admin-record-head">
                <div><h3>{entryLabel[entry.entry_type] ?? entry.entry_type}</h3><p>{dateLabel(entry.created_at)}{entry.reference ? ' · ' + entry.reference : ''}</p></div>
                <span className={'admin-status ' + (entry.status === 'confirmed' ? 'admin-status-published' : 'admin-status-archived')}>{entry.status === 'confirmed' ? 'Confirmado' : entry.status === 'cancelled' ? 'Anulado' : 'Borrador'}</span>
              </div>
              <div className="admin-record-metrics">
                <span>Unidades <strong>{entry.unit_count}</strong></span>
                {isPurchase && <span>Coste total del lote <strong>{money(total)}</strong></span>}
                {isSale && <><span>Venta total <strong>{money(total)}</strong></span><span>Coste de lo vendido <strong>{money(cost)}</strong></span><span>Ganancia bruta <strong>{money(total - cost)}</strong></span></>}
              </div>
              {entry.notes && <p className="admin-footnote">{entry.notes}</p>}
            </article>
          })}
        </div>
      )}
    </section>
  </div>
}
