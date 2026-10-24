import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import './admin.css'
import AdminPurchases from './AdminPurchases'
import AdminManualRegister from './AdminManualRegister'
import AdminRegister from './AdminRegister'

type GateState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'not-admin'; email: string }
  | { status: 'admin'; email: string; displayName: string }

type ProductStatus = 'draft' | 'published' | 'archived'
type Variant = {
  id: string
  sku: string
  size: string | null
  color: string | null
  color_hex: string | null
  sale_price: number
  is_active: boolean
  weight_lb: number | null
}
type Product = {
  id: string
  name: string
  slug: string
  description: string | null
  category: string | null
  status: ProductStatus
  product_variants: Variant[]
  product_images?: { id: string; storage_path: string; alt_text: string | null; position: number }[]
}
type ProductForm = {
  id: string
  variantId: string
  name: string
  category: string
  description: string
  sku: string
  size: string
  color: string
  colorHex: string
  price: string
  weight: string
}
const emptyForm: ProductForm = {
  id: '', variantId: '', name: '', category: '', description: '',
  sku: '', size: '', color: '', colorHex: '#000000', price: '', weight: '',
}

function slugify(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

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
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
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

function ProductManagement({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [products, setProducts] = useState<Product[]>([])
  const [form, setForm] = useState<ProductForm>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyProduct, setBusyProduct] = useState('')
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [uploadingImage, setUploadingImage] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [activeModule, setActiveModule] = useState<'products' | 'inventory' | 'register' | 'finance'>('products')

  const loadProducts = useCallback(async () => {
    if (!supabase) return
    const { data, error: queryError } = await supabase
      .from('products')
      .select('id, name, slug, description, category, status, product_variants(id, sku, size, color, color_hex, sale_price, is_active, weight_lb)')
      .order('updated_at', { ascending: false })
    if (queryError) {
      setError('No se pudo cargar el catálogo: ' + queryError.message)
    } else {
      const { data: images, error: imageError } = await supabase
        .from('product_images')
        .select('id, product_id, storage_path, alt_text, position')
        .order('position')
      if (imageError) setError('Se cargaron los productos, pero no las imágenes: ' + imageError.message)
      const imageRows = images ?? []
      setProducts((data ?? []).map((product) => ({
        ...(product as Product),
        product_images: imageRows.filter((image) => image.product_id === product.id),
      })))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void Promise.resolve().then(loadProducts)
  }, [loadProducts])

  function editProduct(product: Product) {
    const variant = product.product_variants?.[0]
    setForm({
      id: product.id, variantId: variant?.id ?? '', name: product.name,
      category: product.category ?? '', description: product.description ?? '',
      sku: variant?.sku ?? '', size: variant?.size ?? '', color: variant?.color ?? '', colorHex: variant?.color_hex ?? '#000000',
      price: variant ? String(variant.sale_price) : '', weight: variant?.weight_lb == null ? '' : String(variant.weight_lb),
    })
    setNotice('')
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setSaving(true)
    setError('')
    setNotice('')
    const slug = slugify(form.name)
    if (!slug) {
      setError('El nombre no genera un slug válido.')
      setSaving(false)
      return
    }
    const productPayload = {
      name: form.name.trim(), slug, category: form.category.trim() || null,
      description: form.description.trim() || null,
    }
    let productId = form.id
    if (productId) {
      const { error: updateError } = await supabase.from('products').update(productPayload).eq('id', productId)
      if (updateError) {
        setError('No se pudo actualizar el producto: ' + updateError.message)
        setSaving(false)
        return
      }
    } else {
      const { data, error: insertError } = await supabase.from('products')
        .insert(productPayload).select('id').single()
      if (insertError || !data) {
        setError('No se pudo crear el producto: ' + (insertError?.message ?? 'respuesta vacía'))
        setSaving(false)
        return
      }
      productId = data.id
    }

    const variantPayload = {
      product_id: productId, sku: form.sku.trim(), size: form.size.trim() || null,
      color: form.color.trim() || null, color_hex: form.colorHex.trim() || null, sale_price: Number(form.price),
      weight_lb: form.weight.trim() ? Number(form.weight) : null,
    }
    const variantResult = form.variantId
      ? await supabase.from('product_variants').update(variantPayload).eq('id', form.variantId)
      : await supabase.from('product_variants').insert(variantPayload)
    if (variantResult.error) {
      setError('El producto se guardó, pero falló la variante: ' + variantResult.error.message + '. Revisa el SKU y vuelve a guardar.')
      setSaving(false)
      await loadProducts()
      return
    }
    setForm(emptyForm)
    setNotice(form.id ? 'Producto actualizado correctamente.' : 'Producto creado como borrador. Ya puedes publicarlo.')
    setSaving(false)
    await loadProducts()
  }

  async function uploadProductImages() {
    if (!supabase || !form.id || imageFiles.length === 0) return
    setUploadingImage(true)
    setError('')
    setNotice('')
    const existingImages = products.find(product => product.id === form.id)?.product_images ?? []
    let position = existingImages.reduce((max, image) => Math.max(max, image.position), -1) + 1
    let uploadedCount = 0

    for (const imageFile of imageFiles) {
      if (imageFile.size > 10 * 1024 * 1024) {
        setError(`“${imageFile.name}” supera el límite de 10 MB. Las imágenes anteriores de esta tanda sí pueden haberse guardado.`)
        break
      }
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
      if (!allowedTypes.includes(imageFile.type)) {
        setError(`“${imageFile.name}” no es JPEG, PNG, WebP ni AVIF. Las imágenes anteriores de esta tanda sí pueden haberse guardado.`)
        break
      }
      const extension = imageFile.name.split('.').pop()?.toLowerCase() || 'jpg'
      const storagePath = `${form.id}/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(storagePath, imageFile, { contentType: imageFile.type, upsert: false })
      if (uploadError) {
        setError(`No se pudo subir “${imageFile.name}”: ${uploadError.message}`)
        break
      }
      const { error: recordError } = await supabase.from('product_images').insert({
        product_id: form.id,
        storage_path: storagePath,
        alt_text: form.name.trim() || null,
        position,
      })
      if (recordError) {
        await supabase.storage.from('product-images').remove([storagePath])
        setError(`No se pudo registrar “${imageFile.name}”: ${recordError.message}`)
        break
      }
      uploadedCount += 1
      position += 1
    }

    setImageFiles([])
    const input = document.getElementById('product-image-files') as HTMLInputElement | null
    if (input) input.value = ''
    if (uploadedCount > 0) setNotice(`${uploadedCount} ${uploadedCount === 1 ? 'fotografía subida' : 'fotografías subidas'} correctamente.`)
    setUploadingImage(false)
    await loadProducts()
  }

  async function deleteProductImage(image: NonNullable<Product['product_images']>[number]) {
    if (!supabase || !form.id) return
    setError('')
    setNotice('')
    setUploadingImage(true)
    const { error: storageError } = await supabase.storage.from('product-images').remove([image.storage_path])
    if (storageError) {
      setError('No se pudo eliminar el archivo: ' + storageError.message)
      setUploadingImage(false)
      return
    }
    const { error: recordError } = await supabase.from('product_images').delete().eq('id', image.id)
    if (recordError) {
      setError('Se eliminó el archivo, pero no su registro: ' + recordError.message)
      setUploadingImage(false)
      await loadProducts()
      return
    }
    setNotice('Fotografía eliminada.')
    setUploadingImage(false)
    await loadProducts()
  }

  async function setProductStatus(product: Product, status: ProductStatus) {
    if (!supabase) return
    setBusyProduct(product.id)
    setError('')
    setNotice('')
    const { error: updateError } = await supabase.from('products').update({ status }).eq('id', product.id)
    if (updateError) setError('No se pudo cambiar el estado: ' + updateError.message)
    else {
      setNotice(status === 'published' ? 'Producto publicado en el catálogo.' : status === 'archived' ? 'Producto archivado.' : 'Producto devuelto a borrador.')
      await loadProducts()
    }
    setBusyProduct('')
  }

  return (
    <main className="admin-shell admin-shell-dashboard">
      <section className="admin-dashboard admin-workspace">
        <header className="admin-dashboard-header">
          <a className="admin-wordmark" href="/">LIBRE <span>femme</span></a>
          <div className="admin-account"><span>{email}</span><button className="admin-signout" type="button" onClick={onSignOut}>Cerrar sesión</button></div>
        </header>
        <p className="admin-eyebrow">GESTIÓN DEL NEGOCIO</p>
        <h1>Administración.</h1>
        <p className="admin-intro">Administra el catálogo real de LIBRE femme. Los cambios se guardan en Supabase con los permisos de tu cuenta.</p>
        <nav className="admin-module-nav" aria-label="Módulos de administración">
          <button type="button" className={activeModule === 'products' ? 'active' : ''} onClick={() => setActiveModule('products')}>Productos</button><button type="button" className={activeModule === 'register' ? 'active' : ''} onClick={() => setActiveModule('register')}>Registro de movimientos</button><button type="button" className={activeModule === 'inventory' ? 'active' : ''} onClick={() => setActiveModule('inventory')}>Inventario</button><button type="button" className={activeModule === 'finance' ? 'active' : ''} onClick={() => setActiveModule('finance')}>Movimientos de dinero</button>
        </nav>
        {(error || notice) && <p className={error ? 'admin-feedback admin-feedback-error' : 'admin-feedback'} role="status">{error || notice}</p>}

        {activeModule === 'products' && <>
        <section className="admin-section" aria-labelledby="product-form-title">
          <div className="admin-section-heading">
            <div><p className="admin-kicker">CATÁLOGO</p><h2 id="product-form-title">{form.id ? 'Editar producto' : 'Nuevo producto'}</h2></div>
            {form.id && <button className="admin-secondary" type="button" onClick={() => { setForm(emptyForm); setError(''); setNotice('') }}>Cancelar edición</button>}
          </div>
          <form className="admin-product-form" onSubmit={saveProduct}>
            <label>Nombre del producto<input required maxLength={160} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ej. Vestido Alba" /></label>
            <label>Categoría<input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Vestidos, tops…" /></label>
            <label className="admin-field-wide">Descripción<textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Descripción para la tienda" /></label>
            <label>SKU de variante<input required maxLength={100} value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} placeholder="VEST-ALBA-M-ROSE" /></label>
            <label>Precio de venta (USD)<input required type="number" min="0" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="38.00" /></label>
            <label>Talla<input value={form.size} onChange={e => setForm({ ...form, size: e.target.value })} placeholder="M" /></label>
            <label>Nombre del color<input value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} placeholder="Rosa arcilla" /></label>
            <label>Código HEX del color<div className="admin-color-control"><input type="color" aria-label="Selector de color" value={/^#[0-9A-Fa-f]{6}$/.test(form.colorHex) ? form.colorHex : '#000000'} onChange={e => setForm({ ...form, colorHex: e.target.value })} /><input value={form.colorHex} pattern="^#[0-9A-Fa-f]{6}$" onChange={e => setForm({ ...form, colorHex: e.target.value })} placeholder="#C58A82" /></div></label>
            <label>Peso (lb, opcional)<input type="number" min="0.001" step="0.001" value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} placeholder="0.350" /></label>
            <div className="admin-field-wide admin-form-actions">
              <button className="admin-submit" type="submit" disabled={saving}>{saving ? 'Guardando…' : form.id ? 'Guardar cambios' : 'Crear producto y variante'} <span aria-hidden="true">↗</span></button>
              <p className="admin-footnote">Los productos nuevos quedan como borrador. No aparecen en la tienda hasta publicarlos.</p>
            </div>
          </form>
          {form.id && (
            <div className="admin-image-manager">
              <div className="admin-section-heading">
                <div><p className="admin-kicker">IMAGEN DEL PRODUCTO</p><h3>Fotografías</h3></div>
              </div>
              <p className="admin-footnote">Puedes seleccionar varias fotografías. Formatos: JPEG, PNG, WebP o AVIF; máximo 10 MB por archivo. La primera fotografía queda como portada de forma predeterminada.</p>
              <div className="admin-image-upload">
                <label>Elegir fotografías
                  <input id="product-image-files" type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" onChange={event => setImageFiles(Array.from(event.target.files ?? []))} />
                </label>
                <button className="admin-secondary" type="button" disabled={imageFiles.length === 0 || uploadingImage} onClick={() => void uploadProductImages()}>{uploadingImage ? 'Procesando…' : `Subir ${imageFiles.length || ''} ${imageFiles.length === 1 ? 'fotografía' : 'fotografías'}`}</button>
              </div>
              {imageFiles.length > 0 && <p className="admin-footnote">{imageFiles.map(file => file.name).join(' · ')}</p>}
              {(products.find(product => product.id === form.id)?.product_images ?? []).length > 0 ? (
                <ul className="admin-image-grid">
                  {[...(products.find(product => product.id === form.id)?.product_images ?? [])]
                    .sort((a, b) => a.position - b.position)
                    .map((image, index) => {
                      const imageUrl = supabase?.storage.from('product-images').getPublicUrl(image.storage_path).data.publicUrl
                      return <li key={image.id} className="admin-image-card">
                        {imageUrl && <img src={imageUrl} alt={image.alt_text || `Fotografía ${index + 1} de ${form.name}`} loading="lazy" />}
                        <div className="admin-image-card-info">
                          <span>{index === 0 ? 'Portada' : `Fotografía ${index + 1}`}</span>
                          <small>{image.alt_text || image.storage_path.split('/').pop()}</small>
                          <button className="admin-secondary admin-danger-action" type="button" disabled={uploadingImage} onClick={() => void deleteProductImage(image)}>Eliminar</button>
                        </div>
                      </li>
                    })}
                </ul>
              ) : <p className="admin-empty">Este producto todavía no tiene fotografías.</p>}
            </div>
          )}
        </section>

        <section className="admin-section" aria-labelledby="product-list-title">
          <div className="admin-section-heading"><div><p className="admin-kicker">CATÁLOGO</p><h2 id="product-list-title">Productos registrados</h2></div><button className="admin-secondary" type="button" onClick={() => void loadProducts()} disabled={loading}>{loading ? 'Actualizando…' : 'Actualizar'}</button></div>
          {loading ? <p className="admin-empty">Cargando catálogo…</p> : products.length === 0 ? <p className="admin-empty">Todavía no hay productos. Crea el primero con el formulario.</p> : (
            <div className="admin-product-list">
              {products.map(product => {
                const variants = product.product_variants ?? []
                const price = variants.length ? Math.min(...variants.map(v => Number(v.sale_price))) : null
                return <article className="admin-product-row" key={product.id}>
                  <div className="admin-product-main"><div className="admin-product-title-line"><h3>{product.name}</h3><span className={'admin-status admin-status-' + product.status}>{product.status === 'published' ? 'Publicado' : product.status === 'archived' ? 'Archivado' : 'Borrador'}</span></div><p>{product.category || 'Sin categoría'} · {variants.length} {variants.length === 1 ? 'variante' : 'variantes'}{price !== null ? ' · desde $' + price.toFixed(2) + ' USD' : ' · sin precio'}</p><small>{variants.map(v => v.sku).join(' · ') || 'Sin SKU'}</small></div>
                  <div className="admin-product-actions"><button className="admin-secondary" type="button" onClick={() => editProduct(product)}>Editar</button>{product.status !== 'published' && <button className="admin-secondary" type="button" disabled={busyProduct === product.id || variants.length === 0} onClick={() => void setProductStatus(product, 'published')}>{busyProduct === product.id ? 'Guardando…' : 'Publicar'}</button>}{product.status === 'published' && <button className="admin-secondary" type="button" disabled={busyProduct === product.id} onClick={() => void setProductStatus(product, 'draft')}>Retirar</button>}{product.status !== 'archived' && <button className="admin-secondary admin-danger-action" type="button" disabled={busyProduct === product.id} onClick={() => void setProductStatus(product, 'archived')}>Archivar</button>}</div>
                </article>
              })}
            </div>
          )}
        </section>
        </>}
        {activeModule === 'inventory' && <AdminPurchases />}
        {activeModule === 'register' && <AdminManualRegister />}
        {activeModule === 'finance' && <AdminRegister />}
        <a className="admin-back-link" href="/">← Volver a la tienda pública</a>
      </section>
    </main>
  )
}

export default function AdminGate() {
  const [gate, setGate] = useState<GateState>(() => supabase ? { status: 'loading' } : { status: 'signed-out' })

  const checkSession = useCallback(async (session: Session | null) => {
    if (!supabase) return
    if (!session) {
      setGate({ status: 'signed-out' })
      return
    }
    setGate({ status: 'loading' })
    const { data, error } = await supabase.from('profiles').select('role, display_name').eq('id', session.user.id).maybeSingle()
    if (error || !data || data.role !== 'admin') {
      setGate({ status: 'not-admin', email: session.user.email ?? '' })
      return
    }
    setGate({ status: 'admin', email: session.user.email ?? '', displayName: data.display_name })
  }, [])

  useEffect(() => {
    if (!supabase) return
    let active = true
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) setGate({ status: 'signed-out' })
      else void checkSession(data.session)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) void checkSession(session)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [checkSession])

  async function refreshAfterLogin() {
    if (!supabase) return
    const { data } = await supabase.auth.getSession()
    await checkSession(data.session)
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut()
    setGate({ status: 'signed-out' })
    window.history.replaceState({}, '', '/admin/login')
  }

  if (gate.status === 'loading') return <main className="admin-shell"><div className="admin-loading" role="status">Comprobando acceso privado…</div></main>
  if (gate.status === 'signed-out') return <AdminLogin onSignedIn={() => void refreshAfterLogin()} />
  if (gate.status === 'not-admin') return <main className="admin-shell"><section className="admin-panel"><a className="admin-wordmark" href="/">LIBRE <span>femme</span></a><p className="admin-eyebrow">ACCESO RESTRINGIDO</p><h1>Esta cuenta no tiene permisos.</h1><p className="admin-intro">La sesión se inició, pero el usuario no está habilitado como administrador. No se ha concedido acceso al panel.</p><button className="admin-submit" type="button" onClick={() => void signOut()}>Cerrar sesión</button><a className="admin-back-link" href="/">Volver a la tienda</a></section></main>
  return <ProductManagement displayName={gate.displayName} email={gate.email} onSignOut={() => void signOut()} />
}
