import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

type Variant = { id: string; sku: string; size: string | null; color: string | null; color_hex: string | null; sale_price: number; product: { name: string } | null }
type VariantQueryRow = { id: string; sku: string; size: string | null; color: string | null; color_hex: string | null; sale_price: number; products: { name: string } | null }
type Line = { variantId: string; quantity: string; cost: string; salePrice: string }
type HistoryRow = { id: string; created_at: string; movement_type: string; action: string; product_name: string; sku: string; size: string | null; color: string | null; quantity: number; total_usd: number | null; note: string | null; reference: string | null; register_status: string | null }
const movementName: Record<string, string> = { purchase_receipt: 'Entrada de mercancía', sale: 'Venta', adjustment_in: 'Ajuste de entrada', adjustment_out: 'Ajuste de salida' }
const dateLabel = (value: string) => new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
const money = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)
const localDateTimeInput = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export default function AdminManualRegister() {
  const [variants, setVariants] = useState<Variant[]>([])
  const [type, setType] = useState<'purchase' | 'sale'>('purchase')
  const [occurredAt, setOccurredAt] = useState(() => localDateTimeInput(new Date()))
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [batchCost, setBatchCost] = useState('')
  const [lines, setLines] = useState<Line[]>([{ variantId: '', quantity: '1', cost: '', salePrice: '' }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')

  const loadHistory = useCallback(async () => {
    if (!supabase) return
    setHistoryLoading(true)
    const { data, error: queryError } = await supabase.from('admin_inventory_register')
      .select('id,created_at,movement_type,action,product_name,sku,size,color,quantity,total_usd,note,reference,register_status')
      .order('created_at', { ascending: false }).limit(100)
    if (queryError) setHistoryError('No se pudo cargar el historial: ' + queryError.message)
    else { setHistoryError(''); setHistory((data ?? []) as HistoryRow[]) }
    setHistoryLoading(false)
  }, [])

  const loadVariants = useCallback(async () => {
    if (!supabase) return
    const { data, error: queryError } = await supabase.from('product_variants')
      .select('id,sku,size,color,color_hex,sale_price,products(name)')
      .eq('is_active', true).order('sku')
    if (queryError) setError('No se pudieron cargar las variantes: ' + queryError.message)
    else setVariants(((data ?? []) as unknown as VariantQueryRow[]).map(({ products, ...variant }) => ({ ...variant, product: products })))
  }, [])
  useEffect(() => { void Promise.resolve().then(loadVariants) }, [loadVariants])
  useEffect(() => { void Promise.resolve().then(loadHistory) }, [loadHistory])

  function updateLine(index: number, patch: Partial<Line>) {
    setLines(current => current.map((line, i) => i === index ? { ...line, ...patch } : line))
  }
  function addLine() {
    setLines(current => [...current, { variantId: '', quantity: '1', cost: '', salePrice: '' }])
  }
  function removeLine(index: number) {
    setLines(current => current.length === 1 ? current : current.filter((_, i) => i !== index))
  }

  async function submitEntry() {
    if (!supabase) return
    setError(''); setNotice('')
    if (lines.some(l => !l.variantId || !Number.isInteger(Number(l.quantity)) || Number(l.quantity) < 1)) {
      setError('Selecciona una variante y una cantidad entera positiva para cada línea.'); return
    }
    if (new Set(lines.map(l => l.variantId)).size !== lines.length) {
      setError('No repitas una variante en varias líneas: agrupa su cantidad en una sola línea y usa el coste unitario correspondiente.'); return
    }
    if (type === 'purchase' && (batchCost === '' || !Number.isFinite(Number(batchCost)) || Number(batchCost) < 0)) {
      setError('Indica el coste total de la caja o lote, incluyendo compra y transporte hasta Cuba.'); return
    }
    if (type === 'sale' && lines.some(l => l.salePrice === '' || !Number.isFinite(Number(l.salePrice)) || Number(l.salePrice) < 0)) {
      setError('Indica el precio unitario real de venta de cada línea.'); return
    }
    const occurredDate = new Date(occurredAt)
    if (!occurredAt || Number.isNaN(occurredDate.getTime())) {
      setError('Indica una fecha y hora válidas para el movimiento.'); return
    }

    setBusy(true)
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw new Error('No se pudo verificar la sesión: ' + authError.message)
      const { data: entry, error: entryError } = await supabase.from('manual_register_entries').insert({
        entry_type: type, occurred_at: occurredDate.toISOString(), reference: reference.trim() || null,
        notes: notes.trim() || null,
        batch_total_cost_usd: type === 'purchase' ? Number(batchCost) : null,
        created_by: authData.user?.id ?? null,
      }).select('id').single()
      if (entryError || !entry) {
        throw new Error('No se pudo crear el registro: ' + (entryError?.message ?? 'respuesta vacía'))
      }
      const totalUnits = lines.reduce((sum, line) => sum + Number(line.quantity), 0)
      const averageLandedCost = type === 'purchase' && totalUnits > 0 ? Number(batchCost) / totalUnits : 0
      const rows = lines.map(line => ({
        entry_id: entry.id, variant_id: line.variantId, quantity: Number(line.quantity),
        unit_cost_usd: type === 'purchase' ? averageLandedCost : 0,
        unit_sale_price_usd: type === 'sale' ? Number(line.salePrice) : 0,
      }))
      const { error: linesError } = await supabase.from('manual_register_lines').insert(rows)
      if (linesError) {
        setError('Se creó un borrador, pero fallaron sus líneas: ' + linesError.message + '. El inventario aún no ha cambiado.')
        return
      }
      const { error: confirmError } = await supabase.rpc('confirm_manual_register_entry', { p_entry_id: entry.id })
      if (confirmError) {
        setError('El registro quedó como borrador y no cambió el inventario: ' + confirmError.message)
        return
      }
      setNotice(type === 'purchase' ? 'Entrada confirmada. El inventario y los costes se actualizaron.' : 'Venta confirmada. El inventario se descontó y quedó registrada.')
      setReference(''); setNotes(''); setBatchCost(''); setLines([{ variantId: '', quantity: '1', cost: '', salePrice: '' }])
      await Promise.all([loadHistory(), loadVariants()])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ocurrió un error inesperado al registrar el movimiento.')
    } finally {
      setBusy(false)
    }
  }

  const total = type === 'purchase' ? Number(batchCost || 0) : lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.salePrice || 0), 0)
  return <section className="admin-section" aria-labelledby="manual-register-title">
    <div className="admin-section-heading"><div><p className="admin-kicker">OPERACIONES REALES</p><h2 id="manual-register-title">Registro de movimientos</h2></div></div>
    <p className="admin-footnote">Cada operación se registra una sola vez. En una compra puedes detallar las prendas para inventario y registrar un único coste total del lote; el sistema reparte ese coste por unidad para calcular el coste de lo vendido. La bolsa de WhatsApp no reserva ni descuenta stock.</p>
    {(error || notice) && <p className={error ? 'admin-feedback admin-feedback-error' : 'admin-feedback'} role="status">{error || notice}</p>}
    <div className="admin-product-form">
      <label>Tipo de movimiento<select value={type} onChange={e => setType(e.target.value as 'purchase' | 'sale')}><option value="purchase">Entrada de mercancía / compra</option><option value="sale">Venta manual</option></select></label>
      {type === 'purchase' && <label>Coste total del lote (USD)<input type="number" min="0" step="0.01" value={batchCost} onChange={e => setBatchCost(e.target.value)} placeholder="300.00" required /><span className="admin-footnote">Incluye compra, envío, peso, impuestos y cualquier coste hasta tener la ropa lista para vender.</span></label>}
      <label>Fecha y hora<input type="datetime-local" value={occurredAt} onChange={e => setOccurredAt(e.target.value)} required /></label>
      <label>Referencia (opcional)<input value={reference} onChange={e => setReference(e.target.value)} placeholder="Factura, recibo o nota" /></label>
      <label>Notas (opcional)<input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Proveedor, cliente o detalle" /></label>
    </div>
    <div className="admin-section-heading"><div><p className="admin-kicker">LÍNEAS DE LA OPERACIÓN</p><h3>Productos y variantes</h3></div><button className="admin-secondary" type="button" onClick={addLine}>Añadir producto</button></div>
    <div className="admin-register-lines">
      {lines.map((line, index) => <article className="admin-register-line" key={index}>
        <label>Producto / variante<select value={line.variantId} onChange={e => updateLine(index, { variantId: e.target.value, salePrice: variants.find(v => v.id === e.target.value)?.sale_price.toString() ?? line.salePrice })} required>
          <option value="">Seleccionar variante…</option>{variants.map(v => <option key={v.id} value={v.id}>{v.product?.name ?? 'Producto'} · {v.sku}{v.size ? ' · Talla ' + v.size : ''}{v.color ? ' · ' + v.color : ''}</option>)}
        </select></label>
        <label>Cantidad<input type="number" min="1" step="1" value={line.quantity} onChange={e => updateLine(index, { quantity: e.target.value })} required /></label>
        {type === 'purchase' ? <div><span className="admin-field-label">Coste unitario estimado</span><p className="admin-footnote">Se reparte el coste total entre las {lines.reduce((sum, item) => sum + Number(item.quantity || 0), 0)} unidades del lote.</p></div> : <label>Precio de venta (USD)<input type="number" min="0" step="0.01" value={line.salePrice} onChange={e => updateLine(index, { salePrice: e.target.value })} required /></label>}
        <button className="admin-secondary admin-danger-action" type="button" disabled={lines.length === 1} onClick={() => removeLine(index)}>Quitar</button>
      </article>)}
    </div>
    <div className="admin-register-total"><span>Total declarado de la operación</span><strong>{money(total)}</strong></div>
    <button className="admin-submit" type="button" disabled={busy || variants.length === 0} onClick={() => void submitEntry()}>{busy ? 'Registrando…' : type === 'purchase' ? 'Confirmar entrada y actualizar stock' : 'Confirmar venta y descontar stock'} <span aria-hidden="true">↗</span></button>
    {variants.length === 0 && <p className="admin-empty">Primero crea al menos un producto con una variante activa.</p>}

    <section className="admin-movement-history" aria-labelledby="movement-history-title">
      <div className="admin-section-heading">
        <div><p className="admin-kicker">HISTORIAL</p><h3 id="movement-history-title">Movimientos registrados</h3><p className="admin-footnote">Últimos 100 movimientos confirmados, del más reciente al más antiguo.</p></div>
        <button className="admin-secondary" type="button" disabled={historyLoading} onClick={() => void loadHistory()}>{historyLoading ? 'Actualizando…' : 'Actualizar'}</button>
      </div>
      {historyError && <p className="admin-feedback admin-feedback-error" role="alert">{historyError}</p>}
      {historyLoading ? <p className="admin-empty">Cargando historial…</p> : history.length === 0 ? <p className="admin-empty">Todavía no hay movimientos confirmados.</p> : (
        <div className="admin-history-list">
          {history.map(item => <article className="admin-history-row" key={item.id}>
            <div className="admin-history-main">
              <strong>{item.product_name}</strong>
              <span>{movementName[item.movement_type] ?? item.movement_type} · {item.sku}{item.size ? ' · Talla ' + item.size : ''}{item.color ? ' · ' + item.color : ''}</span>
              <small>{dateLabel(item.created_at)}{item.reference ? ' · ' + item.reference : ''}</small>
              {item.note && <small>{item.note}</small>}
            </div>
            <div className="admin-history-metrics">
              <strong>{item.action === 'salida' ? '−' : '+'}{item.quantity} uds.</strong>
              <span>{money(Number(item.total_usd ?? 0))}</span>
            </div>
          </article>)}
        </div>
      )}
    </section>
  </section>
}
