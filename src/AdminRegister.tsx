import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

type Movement = {
  id: string; created_at: string; movement_type: 'purchase_receipt' | 'sale' | 'adjustment_in' | 'adjustment_out'
  action: 'entrada' | 'salida'; product_name: string; sku: string; size: string | null; color: string | null
  quantity: number; unit_price_usd: number | null; total_usd: number | null; unit_cost_usd: number
  cost_of_sale_usd: number | null; unit_sale_price_usd: number | null; note: string | null
}
type Period = '1d' | '3d' | 'week' | 'month' | 'quarter' | 'half' | 'year' | 'custom'
const money = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v || 0))
const dateLabel = (v: string) => new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v))
const label: Record<Movement['movement_type'], string> = { purchase_receipt: 'Entrada de mercancía', sale: 'Venta manual', adjustment_in: 'Ajuste de entrada', adjustment_out: 'Ajuste de salida' }
const isoDate = (d: Date) => { const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return x.toISOString().slice(0, 10) }
function range(period: Period, from: string, to: string) {
  const now = new Date(), end = new Date(now)
  end.setDate(end.getDate() + 1); end.setHours(0, 0, 0, 0)
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  if (period === '1d') start.setDate(start.getDate() - 0)
  if (period === '3d') start.setDate(start.getDate() - 2)
  if (period === 'week') start.setDate(start.getDate() - 6)
  if (period === 'month') start.setMonth(start.getMonth() - 1)
  if (period === 'quarter') start.setMonth(start.getMonth() - 3)
  if (period === 'half') start.setMonth(start.getMonth() - 6)
  if (period === 'year') start.setFullYear(start.getFullYear() - 1)
  if (period === 'custom') return { start: new Date(from + 'T00:00:00').toISOString(), end: new Date(to + 'T00:00:00').getTime() < Date.now() ? new Date(new Date(to + 'T00:00:00').getTime() + 86400000).toISOString() : end.toISOString() }
  return { start: start.toISOString(), end: end.toISOString() }
}
export default function AdminRegister() {
  const [movements, setMovements] = useState<Movement[]>([])
  const [period, setPeriod] = useState<Period>('month')
  const [from, setFrom] = useState(() => isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [to, setTo] = useState(() => isoDate(new Date()))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    const dates = range(period, from, to)
    const { data, error: queryError } = await supabase.from('admin_inventory_register')
      .select('id,created_at,movement_type,action,product_name,sku,size,color,quantity,unit_price_usd,total_usd,unit_cost_usd,cost_of_sale_usd,unit_sale_price_usd,note')
      .gte('created_at', dates.start).lt('created_at', dates.end).order('created_at', { ascending: false })
    if (queryError) { setError('No se pudo cargar el informe: ' + queryError.message); setMovements([]) }
    else { setError(''); setMovements((data ?? []) as Movement[]) }
    setLoading(false)
  }, [period, from, to])
  useEffect(() => { void load() }, [load])
  const summary = useMemo(() => movements.reduce((t, m) => {
    const amount = Number(m.total_usd ?? 0)
    if (m.movement_type === 'sale') { t.sales += amount; t.costOfSales += Number(m.cost_of_sale_usd ?? 0) }
    if (m.movement_type === 'purchase_receipt') t.purchases += amount
    return t
  }, { sales: 0, purchases: 0, costOfSales: 0 }), [movements])
  return <div className="admin-purchases">
    {error && <p className="admin-feedback admin-feedback-error" role="alert">{error}</p>}
    <section className="admin-section">
      <div className="admin-section-heading"><div><p className="admin-kicker">INFORME FINANCIERO</p><h2>Movimientos de dinero</h2></div><button className="admin-secondary" type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Actualizando…' : 'Actualizar'}</button></div>
      <label className="admin-register-month">Período del informe<select value={period} onChange={e => setPeriod(e.target.value as Period)}><option value="1d">1 día</option><option value="3d">3 días</option><option value="week">1 semana</option><option value="month">1 mes</option><option value="quarter">1 trimestre</option><option value="half">6 meses</option><option value="year">1 año</option><option value="custom">Rango personalizado</option></select></label>
      {period === 'custom' && <div className="admin-product-form"><label>Desde<input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} /></label><label>Hasta<input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} /></label></div>}
      <div className="admin-register-summary"><article><span>Ingresos por ventas</span><strong>{money(summary.sales)}</strong></article><article><span>Coste de ventas (FIFO)</span><strong>{money(summary.costOfSales)}</strong></article><article><span>Beneficio bruto</span><strong>{money(summary.sales - summary.costOfSales)}</strong></article><article><span>Compras / entradas</span><strong>{money(summary.purchases)}</strong></article></div>
      <p className="admin-footnote">Las compras muestran el valor de adquisición de la mercancía recibida; las ventas reflejan los ingresos registrados manualmente. El beneficio bruto es ventas menos coste FIFO de las unidades vendidas; no equivale al flujo neto de caja ni incluye gastos operativos.</p>
    </section>
    <section className="admin-section"><div className="admin-section-heading"><div><p className="admin-kicker">DETALLE</p><h2>Registro cronológico</h2></div><span className="admin-status">{movements.length} movimientos</span></div>
      {loading ? <p className="admin-empty">Cargando movimientos…</p> : movements.length === 0 ? <p className="admin-empty">No hay movimientos en el período seleccionado.</p> : <div className="admin-record-list">{movements.map(m => <article className="admin-record" key={m.id}><div className="admin-record-head"><div><h3>{m.product_name}</h3><p>{dateLabel(m.created_at)} · {label[m.movement_type]}</p></div><span className={'admin-status ' + (m.action === 'entrada' ? 'admin-status-published' : 'admin-status-archived')}>{m.action === 'entrada' ? '+' : '−'}{m.quantity} ud.</span></div><div className="admin-record-metrics"><span>Variante <strong>{[m.size, m.color].filter(Boolean).join(' · ') || 'Sin talla/color'}</strong></span><span>SKU <strong>{m.sku}</strong></span><span>{m.movement_type === 'sale' ? 'Precio de venta' : 'Coste unitario'} <strong>{money(Number(m.unit_price_usd ?? 0))}</strong></span><span>{m.movement_type === 'sale' ? 'Ingreso' : 'Valor de entrada'} <strong>{money(Number(m.total_usd ?? 0))}</strong></span></div>{m.note && <p className="admin-footnote">{m.note}</p>}</article>)}</div>}
    </section>
  </div>
}
