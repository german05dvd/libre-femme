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
  unit_sale_price_usd: number | null
  note: string | null
}

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0))
const localMonth = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
const dateLabel = (value: string) => new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
const movementLabel: Record<Movement['movement_type'], string> = {
  purchase_receipt: 'Entrada de compra',
  sale: 'Venta confirmada',
  adjustment_in: 'Ajuste de entrada',
  adjustment_out: 'Ajuste de salida',
}

export default function AdminRegister() {
  const [movements, setMovements] = useState<Movement[]>([])
  const [month, setMonth] = useState(localMonth)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    const start = `${month}-01T00:00:00`
    const [year, monthNumber] = month.split('-').map(Number)
    const end = new Date(year, monthNumber, 1).toISOString()
    const { data, error: queryError } = await supabase
      .from('admin_inventory_register')
      .select('id,created_at,movement_type,action,product_name,sku,size,color,quantity,unit_price_usd,total_usd,unit_cost_usd,unit_sale_price_usd,note')
      .gte('created_at', new Date(start).toISOString())
      .lt('created_at', end)
      .order('created_at', { ascending: false })
    if (queryError) {
      setError('No se pudo cargar el libro de movimientos: ' + queryError.message)
      setMovements([])
    } else {
      setError('')
      setMovements((data ?? []) as Movement[])
    }
    setLoading(false)
  }, [month])

  useEffect(() => { void load() }, [load])

  const summary = useMemo(() => movements.reduce((totals, movement) => {
    const amount = Number(movement.total_usd ?? 0)
    if (movement.movement_type === 'sale') {
      totals.sales += amount
      totals.costOfSales += Number(movement.unit_cost_usd) * Number(movement.quantity)
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
      <label className="admin-register-month">Mes del registro<input type="month" value={month} onChange={event => setMonth(event.target.value)} /></label>
      <div className="admin-register-summary">
        <article><span>Ventas confirmadas</span><strong>{money(summary.sales)}</strong></article>
        <article><span>Coste de lo vendido (FIFO)</span><strong>{money(summary.costOfSales)}</strong></article>
        <article><span>Ganancia bruta</span><strong>{money(summary.sales - summary.costOfSales)}</strong></article>
        <article><span>Compras recibidas</span><strong>{money(summary.purchases)}</strong></article>
      </div>
      <p className="admin-footnote">Las ventas solo aparecen después de confirmarse en Pedidos. Las entradas aparecen cuando una compra se marca como recibida. La ganancia bruta no incluye gastos operativos ajenos al coste de adquisición.</p>
    </section>
    <section className="admin-section">
      <div className="admin-section-heading"><div><p className="admin-kicker">ORDEN CRONOLÓGICO</p><h2>Movimientos del mes</h2></div><span className="admin-status">{movements.length} registros</span></div>
      {loading ? <p className="admin-empty">Cargando movimientos…</p> : movements.length === 0 ? <p className="admin-empty">No hay movimientos en este mes. Las entradas se registran al recibir compras y las ventas al confirmar pedidos.</p> : (
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
