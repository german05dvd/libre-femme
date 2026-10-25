import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

type Movement = {
  id: string
  created_at: string
  movement_type: 'purchase_receipt' | 'sale' | 'adjustment_in' | 'adjustment_out'
  action: 'entrada' | 'salida'
  product_name: string
  sku: string
  size: string | null
  color: string | null
  quantity: number
  unit_price_usd: number | null
  total_usd: number | null
  unit_cost_usd: number
  cost_of_sale_usd: number | null
  unit_sale_price_usd: number | null
  note: string | null
}
type Period = 'today' | '3days' | 'week' | 'month' | 'quarter' | 'halfyear' | 'year' | 'custom'
const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0))
const dateInput = (date: Date) => {
  const year = date.getFullYear(), month = String(date.getMonth() + 1).padStart(2, '0'), day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
const dateLabel = (value: string) => new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
const movementLabel: Record<Movement['movement_type'], string> = {
  purchase_receipt: 'Entrada de compra',
  sale: 'Venta confirmada',
  adjustment_in: 'Ajuste de entrada',
  adjustment_out: 'Ajuste de salida',
}
function getRange(period: Period, from: string, to: string) {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  if (period === 'today') { /* start remains today */ }
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
  const [movements, setMovements] = useState<Movement[]>([])
  const [period, setPeriod] = useState<Period>('month')
  const [from, setFrom] = useState(() => dateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [to, setTo] = useState(() => dateInput(new Date()))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const range = useMemo(() => getRange(period, from, to), [period, from, to])

  const load = useCallback(async () => {
    if (!supabase || !range) { setMovements([]); setLoading(false); return }
    setLoading(true)
    const { data, error: queryError } = await supabase
      .from('admin_inventory_register')
      .select('id,created_at,movement_type,action,product_name,sku,size,color,quantity,unit_price_usd,total_usd,unit_cost_usd,cost_of_sale_usd,unit_sale_price_usd,note')
      .gte('created_at', range.start)
      .lt('created_at', range.end)
      .order('created_at', { ascending: false })
    if (queryError) {
      setError('No se pudo cargar el libro de movimientos: ' + queryError.message)
      setMovements([])
    } else {
      setError('')
      setMovements((data ?? []) as Movement[])
    }
    setLoading(false)
  }, [range])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  const summary = useMemo(() => movements.reduce((totals, movement) => {
    const amount = Number(movement.total_usd ?? 0)
    if (movement.movement_type === 'sale') {
      totals.sales += amount
      totals.costOfSales += Number(movement.cost_of_sale_usd ?? (Number(movement.unit_cost_usd) * Number(movement.quantity)))
    }
    if (movement.movement_type === 'purchase_receipt') totals.purchases += amount
    return totals
  }, { sales: 0, purchases: 0, costOfSales: 0 }), [movements])

  return <div className="admin-purchases">
    {error && <p className="admin-feedback admin-feedback-error" role="alert">{error}</p>}
    <section className="admin-section">
      <div className="admin-section-heading">
        <div><p className="admin-kicker">HISTORIAL CONTABLE Y DE INVENTARIO</p><h2>Libro de movimientos</h2></div>
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
        <article><span>Ventas confirmadas</span><strong>{money(summary.sales)}</strong></article>
        <article><span>Coste de lo vendido (FIFO)</span><strong>{money(summary.costOfSales)}</strong></article>
        <article><span>Ganancia bruta</span><strong>{money(summary.sales - summary.costOfSales)}</strong></article>
        <article><span>Compras recibidas</span><strong>{money(summary.purchases)}</strong></article>
      </div>
      <p className="admin-footnote">El informe suma las ventas confirmadas y las entradas de mercancía del periodo. La ganancia bruta es ventas menos coste FIFO de lo vendido; no equivale al flujo neto de caja ni descuenta gastos operativos.</p>
    </section>
    <section className="admin-section">
      <div className="admin-section-heading"><div><p className="admin-kicker">ORDEN CRONOLÓGICO</p><h2>Movimientos del periodo</h2></div><span className="admin-status">{movements.length} registros</span></div>
      {loading ? <p className="admin-empty">Cargando movimientos…</p> : movements.length === 0 ? <p className="admin-empty">No hay movimientos en este periodo. Las entradas se registran al recibir mercancía y las ventas cuando se confirman.</p> : (
        <div className="admin-record-list">
          {movements.map(movement => <article className="admin-record" key={movement.id}>
            <div className="admin-record-head">
              <div><h3>{movement.product_name}</h3><p>{dateLabel(movement.created_at)} · {movementLabel[movement.movement_type]}</p></div>
              <span className={'admin-status ' + (movement.action === 'entrada' ? 'admin-status-published' : 'admin-status-archived')}>{movement.action === 'entrada' ? '+' : '−'}{movement.quantity} ud.</span>
            </div>
            <div className="admin-record-metrics">
              <span>Variante <strong>{[movement.size, movement.color].filter(Boolean).join(' · ') || 'Sin talla/color'}</strong></span>
              <span>SKU <strong>{movement.sku}</strong></span>
              <span>{movement.movement_type === 'sale' ? 'Precio de venta' : 'Coste unitario'} <strong>{money(Number(movement.unit_price_usd ?? 0))}</strong></span>
              <span>{movement.movement_type === 'sale' ? 'Venta total' : 'Valor de entrada'} <strong>{money(Number(movement.total_usd ?? 0))}</strong></span>
            </div>
            {movement.note && <p className="admin-footnote">{movement.note}</p>}
          </article>)}
        </div>
      )}
    </section>
  </div>
}
