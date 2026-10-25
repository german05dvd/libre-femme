import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

type StockRow = { variant_id: string; quantity_on_hand: number; average_cost_usd: number; product_variants: { sku: string; size: string | null; color: string | null; color_hex: string | null; sale_price: number; products: { name: string } | null } | null }
type Movement = { id: string; created_at: string; movement_type: string; action: string; product_name: string; sku: string; size: string | null; color: string | null; quantity: number; total_usd: number | null; note: string | null }
const money = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v || 0))
const dateLabel = (v: string) => new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v))
const movementLabel: Record<string, string> = { purchase_receipt: 'Entrada por compra', sale: 'Venta manual', adjustment_in: 'Ajuste de entrada', adjustment_out: 'Ajuste de salida' }

export default function AdminInventory() {
  const [stock, setStock] = useState<StockRow[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    const [stockResult, movementResult] = await Promise.all([
      supabase.from('inventory_stock').select('variant_id,quantity_on_hand,average_cost_usd,product_variants(sku,size,color,color_hex,sale_price,products(name))').order('variant_id'),
      supabase.from('admin_inventory_register').select('id,created_at,movement_type,action,product_name,sku,size,color,quantity,total_usd,note').order('created_at', { ascending: false }).limit(100),
    ])
    const issues = [stockResult.error?.message, movementResult.error?.message].filter(Boolean)
    setError(issues.length ? 'No se pudo cargar toda la información: ' + issues.join(' · ') : '')
    setStock((stockResult.data ?? []) as unknown as StockRow[])
    setMovements((movementResult.data ?? []) as Movement[])
    setLoading(false)
  }, [])
  useEffect(() => { void Promise.resolve().then(load) }, [load])
  const units = stock.reduce((sum, row) => sum + Number(row.quantity_on_hand || 0), 0)
  const value = stock.reduce((sum, row) => sum + Number(row.quantity_on_hand || 0) * Number(row.average_cost_usd || 0), 0)
  return <div className="admin-purchases">
    <section className="admin-section"><div className="admin-section-heading"><div><p className="admin-kicker">EXISTENCIAS ACTUALES</p><h2>Inventario</h2></div><button className="admin-secondary" type="button" disabled={loading} onClick={() => void load()}>{loading ? 'Actualizando…' : 'Actualizar'}</button></div>
      {error && <p className="admin-feedback admin-feedback-error" role="alert">{error}</p>}
      <div className="admin-register-summary"><article><span>Variantes registradas</span><strong>{stock.length}</strong></article><article><span>Unidades disponibles</span><strong>{units}</strong></article><article><span>Valor estimado del stock</span><strong>{money(value)}</strong></article></div>
      {loading ? <p className="admin-empty">Cargando existencias…</p> : stock.length === 0 ? <p className="admin-empty">Todavía no hay variantes de producto.</p> : <div className="admin-record-list">{stock.map(row => { const v = row.product_variants; return <article className="admin-record" key={row.variant_id}><div className="admin-record-head"><div><h3>{v?.products?.name ?? 'Producto'}</h3><p>SKU {v?.sku ?? '—'} · {[v?.size && 'Talla ' + v.size, v?.color].filter(Boolean).join(' · ') || 'Sin talla/color'}</p></div><span className={'admin-status ' + (row.quantity_on_hand > 0 ? 'admin-status-published' : 'admin-status-archived')}>{row.quantity_on_hand} ud.</span></div><div className="admin-record-metrics"><span>Coste medio <strong>{money(row.average_cost_usd)}</strong></span><span>Precio de venta <strong>{money(Number(v?.sale_price ?? 0))}</strong></span><span>Valor de existencias <strong>{money(Number(row.quantity_on_hand) * Number(row.average_cost_usd))}</strong></span></div></article> })}</div>}
    </section>
    <section className="admin-section"><div className="admin-section-heading"><div><p className="admin-kicker">TRAZABILIDAD</p><h2>Registro cronológico</h2></div><span className="admin-status">{movements.length} movimientos</span></div>
      {loading ? <p className="admin-empty">Cargando historial…</p> : movements.length === 0 ? <p className="admin-empty">Todavía no hay movimientos registrados.</p> : <div className="admin-record-list">{movements.map(m => <article className="admin-record" key={m.id}><div className="admin-record-head"><div><h3>{m.product_name}</h3><p>{dateLabel(m.created_at)} · {movementLabel[m.movement_type] ?? m.movement_type}</p></div><span className={'admin-status ' + (m.action === 'entrada' ? 'admin-status-published' : 'admin-status-archived')}>{m.action === 'entrada' ? '+' : '−'}{m.quantity} ud.</span></div><div className="admin-record-metrics"><span>Variante <strong>{[m.size, m.color].filter(Boolean).join(' · ') || 'Sin talla/color'}</strong></span><span>SKU <strong>{m.sku}</strong></span><span>Valor registrado <strong>{money(Number(m.total_usd ?? 0))}</strong></span></div>{m.note && <p className="admin-footnote">{m.note}</p>}</article>)}</div>}
    </section>
  </div>
}
