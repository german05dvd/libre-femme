import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from './lib/supabase'

type Supplier = { id: string; name: string; is_active: boolean }
type Variant = { id: string; sku: string; size: string | null; color: string | null; weight_lb: number | null; products: { name: string } | null }
type PurchaseItem = { id: string; variant_id: string; quantity: number; unit_cost: number; line_total: number; allocated_cost_usd: number; product_variants: { sku: string; size: string | null; color: string | null; products: { name: string } | null } | null }
type Expense = { id: string; category: string; description: string; amount_usd: number; allocation_method: string }
type Purchase = { id: string; reference: string | null; status: 'draft' | 'ordered' | 'received' | 'cancelled'; purchase_date: string; currency: string; exchange_rate_to_usd: number; notes: string | null; supplier_id: string | null; suppliers: { name: string } | null; purchase_items: PurchaseItem[]; purchase_expenses: Expense[] }
type Stock = { variant_id: string; quantity_on_hand: number; average_cost_usd: number; product_variants: { sku: string; size: string | null; color: string | null; products: { name: string } | null } | null }

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0))
const errorMessage = (error: { message: string } | null, fallback: string) => error ? fallback + ': ' + error.message : ''

export default function AdminPurchases() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [variants, setVariants] = useState<Variant[]>([])
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [stock, setStock] = useState<Stock[]>([])
  const [supplierName, setSupplierName] = useState('')
  const [supplierPhone, setSupplierPhone] = useState('')
  const [supplierBusy, setSupplierBusy] = useState(false)
  const [purchaseSupplier, setPurchaseSupplier] = useState('')
  const [purchaseReference, setPurchaseReference] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10))
  const [purchaseNotes, setPurchaseNotes] = useState('')
  const [itemPurchase, setItemPurchase] = useState('')
  const [itemVariant, setItemVariant] = useState('')
  const [itemQuantity, setItemQuantity] = useState('1')
  const [itemCost, setItemCost] = useState('')
  const [expensePurchase, setExpensePurchase] = useState('')
  const [expenseCategory, setExpenseCategory] = useState('freight')
  const [expenseDescription, setExpenseDescription] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseMethod, setExpenseMethod] = useState('weight')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    if (!supabase) return
    const [s, v, p, st] = await Promise.all([
      supabase.from('suppliers').select('id,name,is_active').eq('is_active', true).order('name'),
      supabase.from('product_variants').select('id,sku,size,color,weight_lb,products(name)').eq('is_active', true).order('sku'),
      supabase.from('purchases').select('id,reference,status,purchase_date,currency,exchange_rate_to_usd,notes,supplier_id,suppliers(name),purchase_items(id,variant_id,quantity,unit_cost,line_total,allocated_cost_usd,product_variants(sku,size,color,products(name))),purchase_expenses(id,category,description,amount_usd,allocation_method)').order('created_at', { ascending: false }),
      supabase.from('inventory_stock').select('variant_id,quantity_on_hand,average_cost_usd,product_variants(sku,size,color,products(name))').order('updated_at', { ascending: false }),
    ])
    const firstError = s.error || v.error || p.error || st.error
    if (firstError) setError('No se pudieron cargar compras e inventario. ' + firstError.message)
    else {
      setSuppliers((s.data ?? []) as Supplier[])
      setVariants((v.data ?? []) as unknown as Variant[])
      setPurchases((p.data ?? []) as unknown as Purchase[])
      setStock((st.data ?? []) as unknown as Stock[])
      setError('')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  async function addSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setSupplierBusy(true); setError(''); setNotice('')
    const { error: e } = await supabase.from('suppliers').insert({ name: supplierName.trim(), phone: supplierPhone.trim() || null })
    setSupplierBusy(false)
    if (e) setError(errorMessage(e, 'No se pudo guardar el proveedor'))
    else { setSupplierName(''); setSupplierPhone(''); setNotice('Proveedor registrado.'); await load() }
  }

  async function createPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setBusy('create'); setError(''); setNotice('')
    const { data, error: e } = await supabase.from('purchases').insert({
      supplier_id: purchaseSupplier || null, reference: purchaseReference.trim() || null,
      purchase_date: purchaseDate, notes: purchaseNotes.trim() || null, currency: 'USD', exchange_rate_to_usd: 1,
    }).select('id').single()
    setBusy('')
    if (e || !data) setError(errorMessage(e, 'No se pudo crear la compra'))
    else {
      setPurchaseReference(''); setPurchaseNotes(''); setItemPurchase(data.id)
      setNotice('Compra creada como borrador. Añade las líneas y gastos antes de marcarla como recibida.')
      await load()
    }
  }

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !itemPurchase) return
    setBusy('item'); setError(''); setNotice('')
    const { error: e } = await supabase.from('purchase_items').upsert({ purchase_id: itemPurchase, variant_id: itemVariant, quantity: Number(itemQuantity), unit_cost: Number(itemCost) }, { onConflict: 'purchase_id,variant_id' })
    setBusy('')
    if (e) setError(errorMessage(e, 'No se pudo añadir la línea. Comprueba que no exista ya esa variante en la compra.'))
    else { setItemCost(''); setNotice('Línea añadida a la compra.'); await load() }
  }

  async function addExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !expensePurchase) return
    setBusy('expense'); setError(''); setNotice('')
    const { error: e } = await supabase.from('purchase_expenses').insert({
      purchase_id: expensePurchase, category: expenseCategory, description: expenseDescription.trim(),
      amount_usd: Number(expenseAmount), allocation_method: expenseMethod,
    })
    setBusy('')
    if (e) setError(errorMessage(e, 'No se pudo registrar el gasto'))
    else { setExpenseDescription(''); setExpenseAmount(''); setNotice('Gasto asociado a la compra. La distribución se calcula al recibirla.'); await load() }
  }

  async function changeStatus(purchase: Purchase, status: 'ordered' | 'received' | 'cancelled') {
    if (!supabase) return
    const promptText = status === 'received'
      ? '¿Confirmas que toda esta compra llegó correctamente? Se recalcularán los costes y se sumará el stock; esta acción no se puede deshacer.'
      : status === 'cancelled' ? '¿Cancelar esta compra? No podrá reabrirse.' : '¿Marcar esta compra como ordenada al proveedor?'
    if (!window.confirm(promptText)) return
    setBusy(purchase.id); setError(''); setNotice('')
    const { error: e } = await supabase.from('purchases').update({ status }).eq('id', purchase.id)
    setBusy('')
    if (e) setError(errorMessage(e, 'No se pudo cambiar el estado'))
    else { setNotice(status === 'received' ? 'Recepción confirmada: se registró la entrada de inventario.' : status === 'ordered' ? 'Compra marcada como ordenada.' : 'Compra cancelada.'); await load() }
  }

  const selectedItemPurchase = purchases.find(p => p.id === itemPurchase)
  const selectedExpensePurchase = purchases.find(p => p.id === expensePurchase)
  const editablePurchase = (p: Purchase) => p.status === 'draft' || p.status === 'ordered'
  const statusLabel: Record<Purchase['status'], string> = { draft: 'Borrador', ordered: 'Ordenada', received: 'Recibida', cancelled: 'Cancelada' }
  const categoryLabel: Record<string, string> = { agency: 'Agencia', freight: 'Flete', customs: 'Aduana', other: 'Otro' }
  const methodLabel: Record<string, string> = { purchase_value: 'Valor de compra', weight: 'Peso', quantity: 'Cantidad' }

  return <div className="admin-purchases">
    {(error || notice) && <p className={error ? 'admin-feedback admin-feedback-error' : 'admin-feedback'} role="status">{error || notice}</p>}
    <section className="admin-section">
      <div className="admin-section-heading"><div><p className="admin-kicker">PROVEEDORES</p><h2>Registrar proveedor</h2></div></div>
      <form className="admin-inline-form" onSubmit={addSupplier}>
        <label>Nombre<input required maxLength={160} value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="Proveedor o agencia" /></label>
        <label>Teléfono (opcional)<input value={supplierPhone} onChange={e => setSupplierPhone(e.target.value)} placeholder="+53…" /></label>
        <button className="admin-submit" type="submit" disabled={supplierBusy}>{supplierBusy ? 'Guardando…' : 'Añadir proveedor'}</button>
      </form>
      <p className="admin-footnote">{suppliers.length} proveedor(es) activo(s). El proveedor puede dejarse sin asignar en una compra.</p>
    </section>

    <section className="admin-section">
      <div className="admin-section-heading"><div><p className="admin-kicker">ADQUISICIONES</p><h2>Nueva compra</h2></div></div>
      <form className="admin-inline-form admin-purchase-create" onSubmit={createPurchase}>
        <label>Proveedor<select value={purchaseSupplier} onChange={e => setPurchaseSupplier(e.target.value)}><option value="">Sin asignar</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>Referencia<input value={purchaseReference} onChange={e => setPurchaseReference(e.target.value)} placeholder="Factura / envío" /></label>
        <label>Fecha<input type="date" required value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} /></label>
        <label className="admin-field-wide">Notas<textarea rows={2} value={purchaseNotes} onChange={e => setPurchaseNotes(e.target.value)} placeholder="Detalles de la compra" /></label>
        <button className="admin-submit" type="submit" disabled={busy === 'create'}>{busy === 'create' ? 'Creando…' : 'Crear borrador de compra'}</button>
      </form>
    </section>

    <section className="admin-section">
      <div className="admin-section-heading"><div><p className="admin-kicker">LÍNEAS DE COMPRA</p><h2>Añadir productos comprados</h2></div></div>
      <form className="admin-inline-form" onSubmit={addItem}>
        <label>Compra<select required value={itemPurchase} onChange={e => setItemPurchase(e.target.value)}><option value="">Selecciona borrador/orden</option>{purchases.filter(editablePurchase).map(p => <option key={p.id} value={p.id}>{p.reference || p.id.slice(0, 8)} · {statusLabel[p.status]}</option>)}</select></label>
        <label>Variante / SKU<select required value={itemVariant} onChange={e => setItemVariant(e.target.value)}><option value="">Selecciona variante</option>{variants.map(v => <option key={v.id} value={v.id}>{v.sku} · {v.products?.name ?? 'Producto'}{v.size ? ' · '+v.size : ''}{v.color ? ' · '+v.color : ''}</option>)}</select></label>
        <label>Cantidad<input required type="number" min="1" step="1" value={itemQuantity} onChange={e => setItemQuantity(e.target.value)} /></label>
        <label>Coste unitario (USD)<input required type="number" min="0" step="0.01" value={itemCost} onChange={e => setItemCost(e.target.value)} placeholder="8.50" /></label>
        <button className="admin-submit" type="submit" disabled={busy === 'item' || !itemPurchase || !itemVariant || !itemCost || !selectedItemPurchase || !editablePurchase(selectedItemPurchase)}>{busy === 'item' ? 'Añadiendo…' : 'Añadir línea'}</button>
      </form>
      <p className="admin-footnote">Solo se permite una línea por variante y compra. Si ya existe, guarda aquí la cantidad total deseada y el coste unitario actualizado; solo funciona antes de recibir la compra.</p>
    </section>

    <section className="admin-section">
      <div className="admin-section-heading"><div><p className="admin-kicker">GASTOS ASOCIADOS</p><h2>Costes de importación y logística</h2></div></div>
      <form className="admin-inline-form" onSubmit={addExpense}>
        <label>Compra<select required value={expensePurchase} onChange={e => setExpensePurchase(e.target.value)}><option value="">Selecciona compra</option>{purchases.filter(editablePurchase).map(p => <option key={p.id} value={p.id}>{p.reference || p.id.slice(0, 8)} · {statusLabel[p.status]}</option>)}</select></label>
        <label>Tipo<select value={expenseCategory} onChange={e => { const c=e.target.value; setExpenseCategory(c); setExpenseMethod(c === 'agency' ? 'purchase_value' : c === 'freight' ? 'weight' : 'quantity') }}><option value="agency">Agencia</option><option value="freight">Flete</option><option value="customs">Aduana</option><option value="other">Otro</option></select></label>
        <label>Descripción<input required value={expenseDescription} onChange={e => setExpenseDescription(e.target.value)} placeholder="Flete del envío…" /></label>
        <label>Importe (USD)<input required type="number" min="0" step="0.01" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)} /></label>
        <label>Distribuir por<select value={expenseMethod} onChange={e => setExpenseMethod(e.target.value)}><option value="purchase_value">Valor de compra</option><option value="weight">Peso</option><option value="quantity">Cantidad</option></select></label>
        <button className="admin-submit" type="submit" disabled={busy === 'expense' || !expensePurchase || !expenseAmount || !selectedExpensePurchase || !editablePurchase(selectedExpensePurchase)}>{busy === 'expense' ? 'Guardando…' : 'Registrar gasto'}</button>
      </form>
      <p className="admin-footnote">Regla del esquema: agencia → valor; flete → peso (requiere peso positivo en cada variante); aduana/otros → método elegido. Los gastos se asignan a las líneas al recibir.</p>
    </section>

    <section className="admin-section">
      <div className="admin-section-heading"><div><p className="admin-kicker">HISTORIAL</p><h2>Compras y recepción</h2></div><button className="admin-secondary" type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Actualizando…' : 'Actualizar'}</button></div>
      {loading ? <p className="admin-empty">Cargando compras e inventario…</p> : purchases.length === 0 ? <p className="admin-empty">Todavía no hay compras registradas.</p> : <div className="admin-record-list">{purchases.map(p => {
        const goods = p.purchase_items ?? []
        const expenses = p.purchase_expenses ?? []
        const base = goods.reduce((sum, i) => sum + Number(i.line_total), 0)
        const expenseTotal = expenses.reduce((sum, e) => sum + Number(e.amount_usd), 0)
        return <article className="admin-record" key={p.id}>
          <div className="admin-record-head"><div><h3>{p.reference || 'Compra '+p.id.slice(0, 8)}</h3><p>{p.suppliers?.name ?? 'Sin proveedor'} · {p.purchase_date}</p></div><span className={'admin-status admin-status-'+(p.status === 'received' ? 'published' : p.status === 'cancelled' ? 'archived' : 'draft')}>{statusLabel[p.status]}</span></div>
          <div className="admin-record-metrics"><span>Mercancía <strong>{money(base)}</strong></span><span>Gastos <strong>{money(expenseTotal)}</strong></span><span>Total estimado <strong>{money(base+expenseTotal)}</strong></span></div>
          {goods.length ? <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Producto / SKU</th><th>Cant.</th><th>Coste unit.</th><th>Gastos asignados</th></tr></thead><tbody>{goods.map(i => <tr key={i.id}><td>{i.product_variants?.products?.name ?? 'Producto'} · {i.product_variants?.sku ?? i.variant_id.slice(0,8)}</td><td>{i.quantity}</td><td>{money(Number(i.unit_cost))}</td><td>{money(Number(i.allocated_cost_usd))}</td></tr>)}</tbody></table></div> : <p className="admin-footnote">Sin líneas todavía. Añade al menos una antes de recibir.</p>}
          {expenses.length > 0 && <ul className="admin-expense-list">{expenses.map(e => <li key={e.id}><span>{categoryLabel[e.category] ?? e.category}: {e.description} · {methodLabel[e.allocation_method] ?? e.allocation_method}</span><strong>{money(Number(e.amount_usd))}</strong></li>)}</ul>}
          <div className="admin-product-actions">{p.status === 'draft' && <button className="admin-secondary" type="button" disabled={busy===p.id} onClick={() => void changeStatus(p,'ordered')}>Marcar ordenada</button>}{p.status === 'ordered' && <button className="admin-submit" type="button" disabled={busy===p.id || goods.length===0} onClick={() => void changeStatus(p,'received')}>{busy===p.id ? 'Procesando…' : 'Confirmar recepción y sumar stock'}</button>}{editablePurchase(p) && <button className="admin-secondary admin-danger-action" type="button" disabled={busy===p.id} onClick={() => void changeStatus(p,'cancelled')}>Cancelar compra</button>}</div>
        </article>
      })}</div>}
    </section>

    <section className="admin-section">
      <div className="admin-section-heading"><div><p className="admin-kicker">EXISTENCIAS</p><h2>Stock actual</h2></div></div>
      {stock.length === 0 ? <p className="admin-empty">No hay saldos de inventario registrados. El stock se inicializa al confirmar la recepción de una compra.</p> : <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Producto / SKU</th><th>Disponible</th><th>Coste medio (USD)</th></tr></thead><tbody>{stock.map(s => <tr key={s.variant_id}><td>{s.product_variants?.products?.name ?? 'Producto'} · {s.product_variants?.sku ?? s.variant_id.slice(0,8)}{s.product_variants?.size ? ' · '+s.product_variants.size : ''}{s.product_variants?.color ? ' · '+s.product_variants.color : ''}</td><td>{s.quantity_on_hand}</td><td>{money(Number(s.average_cost_usd))}</td></tr>)}</tbody></table></div>}
      <p className="admin-footnote">El saldo se lee desde el libro de movimientos de inventario. No se modifica manualmente desde esta pantalla.</p>
    </section>
  </div>
}
