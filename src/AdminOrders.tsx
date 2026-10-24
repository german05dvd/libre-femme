import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from './lib/supabase'

type Variant = { id: string; sku: string; size: string | null; color: string | null; sale_price: number; is_active: boolean; products: { name: string } | null }
type OrderItem = { id: string; variant_id: string; sku_snapshot: string; product_name_snapshot: string; size_snapshot: string | null; color_snapshot: string | null; quantity: number; unit_sale_price_usd: number; unit_cost_usd: number | null; line_total_usd: number }
type Order = { id: string; status: 'draft' | 'pending' | 'confirmed' | 'cancelled'; source: string; customer_name: string | null; customer_phone: string | null; notes: string | null; created_at: string; confirmed_at: string | null; order_items: OrderItem[] }
type Stock = { variant_id: string; quantity_on_hand: number; product_variants: { sku: string } | null }
const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n || 0))

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [variants, setVariants] = useState<Variant[]>([])
  const [stock, setStock] = useState<Stock[]>([])
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [orderForItem, setOrderForItem] = useState('')
  const [variantId, setVariantId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    const [o, v, s] = await Promise.all([
      supabase.from('orders').select('id,status,source,customer_name,customer_phone,notes,created_at,confirmed_at,order_items(id,variant_id,sku_snapshot,product_name_snapshot,size_snapshot,color_snapshot,quantity,unit_sale_price_usd,unit_cost_usd,line_total_usd)').order('created_at', { ascending: false }),
      supabase.from('product_variants').select('id,sku,size,color,sale_price,is_active,products(name)').eq('is_active', true).order('sku'),
      supabase.from('inventory_stock').select('variant_id,quantity_on_hand,product_variants(sku)'),
    ])
    const firstError = o.error || v.error || s.error
    if (firstError) setError('No se pudieron cargar los pedidos. ' + firstError.message)
    else { setOrders((o.data ?? []) as unknown as Order[]); setVariants((v.data ?? []) as unknown as Variant[]); setStock((s.data ?? []) as unknown as Stock[]); setError('') }
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setBusy('create'); setError(''); setNotice('')
    const { data, error: e } = await supabase.from('orders').insert({ source: 'manual', customer_name: customerName.trim() || null, customer_phone: customerPhone.trim() || null, notes: notes.trim() || null }).select('id').single()
    setBusy('')
    if (e || !data) setError('No se pudo crear el pedido: ' + (e?.message ?? 'respuesta vacía'))
    else { setCustomerName(''); setCustomerPhone(''); setNotes(''); setOrderForItem(data.id); setNotice('Pedido creado como borrador. Añade las líneas y luego pásalo a pendiente.'); await load() }
  }

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    const order = orders.find(o => o.id === orderForItem)
    const variant = variants.find(v => v.id === variantId)
    if (!order || !variant || !['draft','pending'].includes(order.status)) return
    setBusy('item'); setError(''); setNotice('')
    const { error: e } = await supabase.from('order_items').upsert({
      order_id: order.id, variant_id: variant.id, sku_snapshot: variant.sku,
      product_name_snapshot: variant.products?.name ?? 'Producto',
      size_snapshot: variant.size, color_snapshot: variant.color,
      quantity: Number(quantity), unit_sale_price_usd: Number(variant.sale_price),
    }, { onConflict: 'order_id,variant_id' })
    setBusy('')
    if (e) setError('No se pudo guardar la línea: ' + e.message)
    else { setNotice('Línea guardada. Si el SKU ya estaba, se actualizó a la cantidad indicada.'); await load() }
  }

  async function changeStatus(order: Order, status: 'pending' | 'cancelled' | 'confirmed') {
    if (!supabase) return
    if (!window.confirm(status === 'confirmed'
      ? '¿Confirmar este pedido? Se comprobará el stock y se descontarán las unidades en una única operación. No se puede deshacer.'
      : status === 'pending' ? '¿Pasar este pedido a pendiente de confirmación?' : '¿Cancelar este pedido?')) return
    setBusy(order.id); setError(''); setNotice('')
    const result = status === 'confirmed'
      ? await supabase.rpc('confirm_order', { p_order_id: order.id })
      : await supabase.from('orders').update({ status }).eq('id', order.id)
    setBusy('')
    if (result.error) setError('No se pudo actualizar el pedido: ' + result.error.message)
    else { setNotice(status === 'confirmed' ? 'Pedido confirmado y stock descontado.' : status === 'pending' ? 'Pedido marcado como pendiente.' : 'Pedido cancelado.'); await load() }
  }

  const statusLabel: Record<Order['status'], string> = { draft: 'Borrador', pending: 'Pendiente', confirmed: 'Confirmado', cancelled: 'Cancelado' }
  const stockFor = (id: string) => stock.find(s => s.variant_id === id)?.quantity_on_hand ?? 0
  return <div className="admin-purchases">
    {(error || notice) && <p className={error ? 'admin-feedback admin-feedback-error' : 'admin-feedback'} role="status">{error || notice}</p>}
    <section className="admin-section">
      <div className="admin-section-heading"><div><p className="admin-kicker">VENTAS</p><h2>Crear pedido manual</h2></div></div>
      <form className="admin-inline-form" onSubmit={createOrder}>
        <label>Nombre del cliente<input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nombre y apellidos" /></label>
        <label>Teléfono<input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+53…" /></label>
        <label className="admin-field-wide">Notas<textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Origen WhatsApp, entrega pendiente, etc." /></label>
        <button className="admin-submit" type="submit" disabled={busy === 'create'}>{busy === 'create' ? 'Creando…' : 'Crear borrador'}</button>
      </form>
    </section>
    <section className="admin-section">
      <div className="admin-section-heading"><div><p className="admin-kicker">ARTÍCULOS</p><h2>Añadir variante al pedido</h2></div></div>
      <form className="admin-inline-form" onSubmit={addItem}>
        <label>Pedido<select required value={orderForItem} onChange={e => setOrderForItem(e.target.value)}><option value="">Selecciona borrador/pendiente</option>{orders.filter(o => o.status === 'draft' || o.status === 'pending').map(o => <option key={o.id} value={o.id}>{o.customer_name || 'Cliente sin nombre'} · {o.id.slice(0,8)} · {statusLabel[o.status]}</option>)}</select></label>
        <label>Variante<select required value={variantId} onChange={e => setVariantId(e.target.value)}><option value="">Selecciona SKU</option>{variants.map(v => <option key={v.id} value={v.id}>{v.sku} · {v.products?.name ?? 'Producto'} · {money(Number(v.sale_price))}</option>)}</select></label>
        <label>Cantidad<input required type="number" min="1" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
        <button className="admin-submit" type="submit" disabled={busy === 'item' || !orderForItem || !variantId}>{busy === 'item' ? 'Guardando…' : 'Guardar línea'}</button>
      </form>
      <p className="admin-footnote">El precio se toma de la variante actual y queda guardado como fotografía del pedido. El stock solo se descuenta al confirmar el pedido pendiente.</p>
    </section>
    <section className="admin-section">
      <div className="admin-section-heading"><div><p className="admin-kicker">SEGUIMIENTO</p><h2>Pedidos registrados</h2></div><button className="admin-secondary" type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Actualizando…' : 'Actualizar'}</button></div>
      {loading ? <p className="admin-empty">Cargando pedidos…</p> : orders.length === 0 ? <p className="admin-empty">Todavía no hay pedidos.</p> : <div className="admin-record-list">{orders.map(order => {
        const items = order.order_items ?? []
        const total = items.reduce((sum, item) => sum + Number(item.line_total_usd), 0)
        return <article className="admin-record" key={order.id}>
          <div className="admin-record-head"><div><h3>{order.customer_name || 'Cliente sin nombre'}</h3><p>{order.customer_phone || 'Sin teléfono'} · {new Date(order.created_at).toLocaleString('es')}</p><p>Pedido {order.id.slice(0,8)} · {order.source === 'whatsapp' ? 'WhatsApp' : 'Manual'}</p></div><span className={'admin-status admin-status-'+(order.status === 'confirmed' ? 'published' : order.status === 'cancelled' ? 'archived' : 'draft')}>{statusLabel[order.status]}</span></div>
          {order.notes && <p className="admin-footnote">{order.notes}</p>}
          {items.length ? <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Producto / SKU</th><th>Cant.</th><th>Precio</th><th>Subtotal</th><th>Stock actual</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.product_name_snapshot} · {item.sku_snapshot}{item.size_snapshot ? ' · '+item.size_snapshot : ''}{item.color_snapshot ? ' · '+item.color_snapshot : ''}</td><td>{item.quantity}</td><td>{money(Number(item.unit_sale_price_usd))}</td><td>{money(Number(item.line_total_usd))}</td><td>{stockFor(item.variant_id)}</td></tr>)}</tbody></table></div> : <p className="admin-footnote">Pedido sin líneas. Añade productos antes de pasarlo a pendiente.</p>}
          <div className="admin-record-metrics"><span>Subtotal estimado <strong>{money(total)} USD</strong></span>{order.confirmed_at && <span>Confirmado <strong>{new Date(order.confirmed_at).toLocaleString('es')}</strong></span>}</div>
          <div className="admin-product-actions">{order.status === 'draft' && <button className="admin-secondary" type="button" disabled={busy===order.id || items.length===0} onClick={() => void changeStatus(order,'pending')}>Pasar a pendiente</button>}{order.status === 'pending' && <button className="admin-submit" type="button" disabled={busy===order.id || items.length===0} onClick={() => void changeStatus(order,'confirmed')}>{busy===order.id ? 'Confirmando…' : 'Confirmar y descontar stock'}</button>}{(order.status === 'draft' || order.status === 'pending') && <button className="admin-secondary admin-danger-action" type="button" disabled={busy===order.id} onClick={() => void changeStatus(order,'cancelled')}>Cancelar pedido</button>}</div>
        </article>
      })}</div>}
    </section>
    <p className="admin-footnote">La confirmación usa la función transaccional de Supabase: verifica existencias, guarda el coste medio histórico y registra movimientos de salida. Si no hay stock suficiente, el pedido permanece pendiente.</p>
  </div>
}
