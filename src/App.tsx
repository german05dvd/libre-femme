import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { isSupabaseConfigured, supabase } from './lib/supabase'

type Variant = {
  id: string
  size: string | null
  color: string | null
  color_hex: string | null
  sale_price: number
  is_available: boolean
}
type Product = {
  id: string
  name: string
  slug: string
  category: string
  description: string
  variants: Variant[]
  images: { url: string; alt: string }[]
}
type CartLine = { key: string; product: Product; variant: Variant; quantity: number }

const whatsappNumber = '5358352149'
const colorNames: Record<string, string> = { rose: 'rosa arcilla', chocolate: 'chocolate', cream: 'crema', sand: 'arena', olive: 'oliva', clay: 'arcilla', plum: 'ciruela' }
const fallbackColors = ['rose', 'sand', 'olive', 'clay', 'cream', 'plum']
const categories = ['Todo']

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(price)
}

function App() {
  const [products, setProducts] = useState<Product[]>([])
  const [activeCategory, setActiveCategory] = useState('Todo')
  const [searchTerm, setSearchTerm] = useState('')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [cartOpen, setCartOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [cartNotice, setCartNotice] = useState('')
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({})
  const [selectedProductImages, setSelectedProductImages] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const [sloganText, setSloganText] = useState('Viste como te sientes.')

  useEffect(() => {
    let cancelled = false
    async function loadCatalog() {
      if (!supabase) {
        setCatalogError('Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para cargar el catálogo publicado.')
        setLoading(false)
        return
      }
      const client = supabase
      setLoading(true)
      setCatalogError('')
      const { data: productRows, error: productError } = await client
        .from('public_catalog_products')
        .select('id, name, slug, description, category')
        .order('name')
      if (productError) {
        if (!cancelled) {
          setCatalogError('No pudimos cargar la colección. Comprueba la configuración y los permisos públicos de Supabase.')
          setLoading(false)
        }
        return
      }
      const [{ data: variantRows, error: variantError }, { data: imageRows }] = await Promise.all([
        client.from('public_catalog_variants').select('id, product_id, size, color, color_hex, sale_price, is_available'),
        client.from('public_catalog_images').select('id, product_id, storage_path, alt_text, position').order('position'),
      ])
      if (cancelled) return
      if (variantError) {
        setCatalogError('No pudimos cargar las variantes de la colección.')
        setLoading(false)
        return
      }
      const nextProducts: Product[] = (productRows ?? []).map((row) => {
        const images = (imageRows ?? [])
          .filter((item) => item.product_id === row.id)
          .map((image) => {
            const imagePath = image.storage_path as string
            const url = imagePath.startsWith('https://') || imagePath.startsWith('http://')
              ? imagePath
              : client.storage.from('product-images').getPublicUrl(imagePath).data.publicUrl
            return { url, alt: image.alt_text || row.name }
          })
        return {
          id: row.id,
          name: row.name,
          slug: row.slug,
          category: row.category || 'Otros',
          description: row.description || 'Una pieza elegida para ti.',
          variants: (variantRows ?? [])
            .filter((variant) => variant.product_id === row.id)
            .map((variant) => ({ id: variant.id, size: variant.size, color: variant.color, color_hex: variant.color_hex, sale_price: Number(variant.sale_price), is_available: Boolean(variant.is_available) })),
          images,
        }
      }).filter((product) => product.variants.length > 0)
      setProducts(nextProducts)
      setLoading(false)
    }
    void loadCatalog()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!cartOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCartOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [cartOpen])

  useEffect(() => {
    if (!cartNotice) return
    const timeout = window.setTimeout(() => setCartNotice(''), 2400)
    return () => window.clearTimeout(timeout)
  }, [cartNotice])

  useEffect(() => {
    const slogans = ['Viste como te sientes.', 'Viste a tu manera.', 'Viste tu libertad.', 'Viste para ti.']
    let index = 0
    let phase: 'hold' | 'erase' | 'type' = 'hold'
    let position = slogans[0].length
    let pauseTicks = 0
    const timer = window.setInterval(() => {
      if (phase === 'hold') {
        pauseTicks += 1
        if (pauseTicks >= 22) { phase = 'erase'; pauseTicks = 0 }
        return
      }
      if (phase === 'erase') {
        position -= 1
        setSloganText(slogans[index].slice(0, position))
        if (position <= 0) { index = (index + 1) % slogans.length; phase = 'type'; position = 0 }
        return
      }
      position += 1
      setSloganText(slogans[index].slice(0, position))
      if (position >= slogans[index].length) { phase = 'hold'; pauseTicks = 0 }
    }, 90)
    return () => window.clearInterval(timer)
  }, [])

  const availableCategories = useMemo(() => [...categories, ...new Set(products.map((product) => product.category).filter(Boolean))], [products])
  const visibleProducts = useMemo(
    () => products.filter((product) => (activeCategory === 'Todo' || product.category === activeCategory) && `${product.name} ${product.category} ${product.description}`.toLocaleLowerCase('es').includes(searchTerm.trim().toLocaleLowerCase('es'))),
    [products, activeCategory, searchTerm],
  )
  const cartItems: CartLine[] = Object.entries(cart).flatMap(([key, quantity]) => {
    const [productId, variantId] = key.split('::')
    const product = products.find((item) => item.id === productId)
    const variant = product?.variants.find((item) => item.id === variantId)
    return product && variant && quantity > 0 ? [{ key, product, variant, quantity }] : []
  })
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)
  const cartTotal = cartItems.reduce((sum, item) => sum + item.variant.sale_price * item.quantity, 0)

  const addToCart = (product: Product) => {
    const variantId = selectedVariants[product.id] ?? product.variants[0]?.id
    const variant = product.variants.find((item) => item.id === variantId)
    if (!variant) {
      setCartNotice('Esta pieza no tiene variantes disponibles para consulta.')
      return
    }
    const key = product.id + '::' + variant.id
    if (!variant.is_available) {
      setCartNotice('Esta variante está agotada por el momento.')
      return
    }
    if ((cart[key] ?? 0) >= 1) {
      setCartNotice('Ya tienes en tu bolsa todas las unidades disponibles de esta variante.')
      return
    }
    changeQuantity(key, 1)
    setCartNotice(product.name + ' · ' + [variant.size && 'talla ' + variant.size, variant.color && (colorNames[variant.color.toLowerCase()] ?? variant.color)].filter(Boolean).join(' · ') + ' añadida a tu bolsa')
  }

  const changeQuantity = (key: string, delta: number) => {
    setCart((current) => {
      const [productId, variantId] = key.split('::')
      const variant = products.find(product => product.id === productId)?.variants.find(item => item.id === variantId)
      const maxQuantity = variant?.is_available ? 1 : 0
      const nextQuantity = Math.min(maxQuantity, Math.max(0, (current[key] ?? 0) + delta))
      const next = { ...current }
      if (nextQuantity === 0) delete next[key]
      else next[key] = nextQuantity
      return next
    })
  }

  const whatsappMessage = [
    'Hola, le escribo para solicitar un pedido de:',
    ...cartItems.map(({ product, variant, quantity }) => '• ' + product.name + (variant.size ? ' · talla ' + variant.size : '') + (variant.color ? ' · color ' + (colorNames[variant.color.toLowerCase()] ?? variant.color) : '') + ' × ' + quantity + ' — ' + formatPrice(variant.sale_price * quantity)),
    `Total estimado: ${formatPrice(cartTotal)} USD`,
    '¿Podemos confirmar disponibilidad y detalles de entrega?',
  ].join('\\n')
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`

  return (
    <div className="storefront">
      <div className="sr-only" role="status" aria-live="polite">{cartNotice}</div>
      {cartNotice && <div className="cart-toast" role="status"><span aria-hidden="true">✓</span>{cartNotice}<button type="button" onClick={() => setCartOpen(true)}>Ver bolsa</button></div>}
      <div className="announcement">Una forma más libre de vestir <span>✳</span> Piezas elegidas para ti</div>
      <header className="site-header">
        <button className="mobile-menu-button" type="button" aria-label="Abrir menú" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>{mobileMenuOpen ? 'Cerrar' : 'Menú'}</button>
        <a className="wordmark" href="#inicio" aria-label="LIBRE femme, inicio">LIBRE <span>femme</span></a>
        <nav className={mobileMenuOpen ? 'main-nav is-open' : 'main-nav'} aria-label="Navegación principal">
          <a href="#coleccion" onClick={() => setMobileMenuOpen(false)}>Colección</a>
          <a href="#detalles" onClick={() => setMobileMenuOpen(false)}>Detalles</a>
        </nav>
        <button className="cart-trigger" type="button" onClick={() => setCartOpen(true)} aria-label={`Abrir bolsa, ${cartCount} artículos`}>Bolsa <span className="cart-count">{cartCount}</span></button>
      </header>

      <main>
        <section className="hero-section hero-editorial" id="inicio">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-line" /> LIBRE FEMME · VESTIR CON LIBERTAD</p>
            <h1 aria-label={sloganText}>{sloganText}<span className="type-caret" aria-hidden="true" /></h1>
            <p className="hero-description">Prendas que hablan de ti. Texturas, formas y detalles elegidos para acompañarte a tu manera.</p>
            <a className="hero-discover" href="#coleccion">EXPLORAR PRENDAS <span aria-hidden="true">↗</span></a>
            <div className="hero-edition"><span>01 — 26</span><span>UNA EXPRESIÓN PROPIA</span></div>
          </div>
          <div className="hero-gallery" aria-label="Inspiración editorial LIBRE femme">
            <figure className="hero-photo hero-photo-main"><img src="https://images.unsplash.com/photo-1539100387613-e6a8b7f0a5e6?auto=format&fit=crop&w=1200&q=85" alt="Inspiración de moda femenina con silueta elegante" onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.parentElement?.classList.add('photo-fallback') }} /><span className="photo-label">LIBRE FEMME / EDITORIAL</span></figure>
            <figure className="hero-photo hero-photo-detail"><img src="https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=85" alt="Detalles de estilo y prendas femeninas" onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.parentElement?.classList.add('photo-fallback') }} /><span className="photo-detail-index">FORMA · TEXTURA · ACTITUD</span></figure>
            <span className="gallery-stamp">VISTE<br /><em>tu esencia</em></span>
          </div>
        </section>

        <section className="collection-section section-wrap" id="coleccion">
          <div className="section-heading"><div><p className="eyebrow">SELECCIÓN LIBRE</p><h2>Nuestros <em>productos.</em></h2></div><p className="section-intro">Prendas versátiles, detalles cuidados y espacio para que tu personalidad sea la protagonista.</p></div>
          <div className="collection-toolbar">
            <label className="product-search"><span className="sr-only">Buscar prendas</span><span className="search-icon" aria-hidden="true">⌕</span><input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar una prenda…" /></label>
            <div className="category-filters" role="group" aria-label="Filtrar por categoría">
              {availableCategories.map((category) => <button key={category} type="button" className={activeCategory === category ? 'filter-chip active' : 'filter-chip'} onClick={() => setActiveCategory(category)} aria-pressed={activeCategory === category}>{category}</button>)}
            </div>
            <span className="product-count">{loading ? 'CARGANDO…' : `${visibleProducts.length} ${visibleProducts.length === 1 ? 'PIEZA' : 'PIEZAS'}`}</span>
          </div>
          {catalogError && <div className="no-results" role="status"><span>✳</span><h3>La colección aún no está disponible.</h3><p>{catalogError}</p></div>}
          {!catalogError && loading && <div className="no-results" role="status"><h3>Estamos preparando la colección…</h3><p>Un momento, estamos cargando las piezas publicadas.</p></div>}
          {!catalogError && !loading && <div className="product-grid">
            {visibleProducts.map((product, index) => {
              const selectedVariant = product.variants.find((variant) => variant.id === selectedVariants[product.id]) ?? product.variants[0]
              const colors = [...new Set(product.variants.map((variant) => variant.color).filter((color): color is string => Boolean(color)))]
              const sizes = [...new Set(product.variants.map((variant) => variant.size).filter((size): size is string => Boolean(size)))]
              const visualColor = (selectedVariant.color ?? fallbackColors[index % fallbackColors.length]).toLowerCase().replace(/[^a-z]/g, '')
              return <article className="product-card" key={product.id} style={{ animationDelay: `${index * 65}ms` }}>
                <div className={`product-art product-art-${visualColor}`}>
                  <span className="product-number">{String(index + 1).padStart(2, '0')}</span>
                  {product.images.length > 0 ? <>
                    <img className="catalog-product-image" src={product.images[(selectedProductImages[product.id] ?? 0) % product.images.length].url} alt={product.images[(selectedProductImages[product.id] ?? 0) % product.images.length].alt} loading="lazy" />
                    {product.images.length > 1 && <div className="product-gallery-controls" aria-label={`Fotografías de ${product.name}`}>
                      <button type="button" aria-label="Fotografía anterior" onClick={() => setSelectedProductImages(current => ({ ...current, [product.id]: ((current[product.id] ?? 0) - 1 + product.images.length) % product.images.length }))}>‹</button>
                      <span>{(selectedProductImages[product.id] ?? 0) + 1} / {product.images.length}</span>
                      <button type="button" aria-label="Fotografía siguiente" onClick={() => setSelectedProductImages(current => ({ ...current, [product.id]: ((current[product.id] ?? 0) + 1) % product.images.length }))}>›</button>
                    </div>}
                  </> : <div className="garment-shape" aria-hidden="true"><span /></div>}
                  <button className="quick-add" type="button" onClick={() => addToCart(product)} aria-label={`Añadir ${product.name} a la bolsa`}>+ Añadir</button>
                </div>
                {product.images.length > 1 && <div className="product-gallery-thumbnails" aria-label={`Elegir fotografía de ${product.name}`}>
                  {product.images.map((image, imageIndex) => <button key={image.url} type="button" className={(selectedProductImages[product.id] ?? 0) === imageIndex ? 'active' : ''} aria-label={`Ver fotografía ${imageIndex + 1}`} aria-pressed={(selectedProductImages[product.id] ?? 0) === imageIndex} onClick={() => setSelectedProductImages(current => ({ ...current, [product.id]: imageIndex }))}><img src={image.url} alt="" loading="lazy" /></button>)}
                </div>}
                <div className="product-info"><div><h3>{product.name}</h3><p>{product.description}</p></div><span className="product-price">{formatPrice(selectedVariant.sale_price)}</span></div>
                <div className="product-options">
                  {sizes.length > 0 && <div className="size-picker" role="group" aria-label={`Elegir talla para ${product.name}`}><span className="option-label">TALLA</span>{sizes.map((size) => { const variant = product.variants.find((item) => item.size === size && (!selectedVariant.color || item.color === selectedVariant.color)) ?? product.variants.find((item) => item.size === size); return <button key={size} type="button" className={selectedVariant.id === variant?.id ? 'size-option selected' : 'size-option'} aria-pressed={selectedVariant.id === variant?.id} onClick={() => variant && setSelectedVariants((current) => ({ ...current, [product.id]: variant.id }))}>{size}</button> })}</div>}
                  {colors.length > 0 && <div className="color-picker" role="group" aria-label={`Elegir color para ${product.name}`}><span className="option-label">COLORES</span><div className="swatches">{colors.map((color) => { const variant = product.variants.find((item) => item.color === color && (!selectedVariant.size || item.size === selectedVariant.size)) ?? product.variants.find((item) => item.color === color); const swatch = color.toLowerCase().replace(/[^a-z]/g, ''); return <button key={color} type="button" className={`color-swatch swatch-${swatch} ${selectedVariant.id === variant?.id ? 'selected' : ''}`} style={variant?.color_hex ? { backgroundColor: variant.color_hex } : undefined} aria-label={`Color ${color}`} aria-pressed={selectedVariant.id === variant?.id} onClick={() => variant && setSelectedVariants((current) => ({ ...current, [product.id]: variant.id }))} /> })}</div></div>}
                  <p className="variant-stock-note">{selectedVariant.is_available ? "Disponible para consulta" : "Agotado por el momento"}</p><button className="product-add-link" type="button" disabled={!selectedVariant.is_available} onClick={() => addToCart(product)}>{selectedVariant.is_available ? "Añadir a la bolsa" : "Agotado"} <span>↗</span></button>
                </div>
              </article>
            })}
          </div>}
          {!loading && !catalogError && visibleProducts.length === 0 && <div className="no-results"><span>✳</span><h3>{products.length ? 'No encontramos esa pieza.' : 'Pronto habrá piezas para descubrir.'}</h3><p>{products.length ? 'Prueba con otro nombre o cambia los filtros.' : 'Cuando se publiquen productos en el panel de administración, aparecerán aquí.'}</p>{products.length > 0 && <button className="text-link" type="button" onClick={() => { setSearchTerm(''); setActiveCategory('Todo') }}>Limpiar búsqueda</button>}</div>}
          <p className="demo-note">{isSupabaseConfigured ? 'Precios y variantes proceden del catálogo publicado. La disponibilidad de existencias y la entrega se confirman por WhatsApp.' : 'La tienda está pendiente de configuración con Supabase; no se muestran productos ni precios de demostración.'}</p>
        </section>

        <section className="details-editorial" id="detalles">
          <div className="details-heading"><p className="eyebrow">ANTES DE ELEGIR</p><h2>Los detalles<br /><em>también visten.</em></h2></div>
          <div className="details-content">
            <article className="detail-note"><span className="detail-index">01 / TALLAS</span><h3>Elige cómo quieres sentirte.</h3><p>Selecciona una de las tallas publicadas en cada pieza. Si dudas entre dos, escríbenos antes de confirmar y te ayudaremos a elegir el ajuste que buscas.</p></article>
            <article className="detail-note"><span className="detail-index">02 / COLOR</span><h3>Un mismo diseño, otra intención.</h3><p>Las opciones que aparecen en cada tarjeta proceden de las variantes registradas para ese producto.</p></article>
            <article className="detail-note detail-note-dark"><span className="detail-index">03 / TU PEDIDO</span><h3>Primero lo confirmamos contigo.</h3><p>Tu bolsa reúne las piezas elegidas y abre una consulta por WhatsApp. Confirmamos disponibilidad y entrega antes de cerrar el pedido; añadir algo no reserva existencias.</p><a className="details-link" href="https://wa.me/5358352149?text=Hola%2C%20LIBRE%20femme.%20Quisiera%20consultar%20sobre%20las%20tallas%2C%20colores%20y%20disponibilidad%20de%20la%20colecci%C3%B3n." target="_blank" rel="noreferrer">Consultar por WhatsApp <span aria-hidden="true">↗</span></a></article>
          </div>
          <div className="details-signature"><span>LIBRE femme</span><span>Elegido por ti. A tu manera.</span><span>LA HABANA · CUBA</span></div>
        </section>
      </main>
      <footer className="site-footer"><a className="wordmark footer-wordmark" href="#inicio">LIBRE <span>femme</span></a><p>Vestir con libertad, vivir con intención.</p><span>© 2026 LIBRE femme</span></footer>

      {cartOpen && <div className="drawer-backdrop" role="presentation" onClick={() => setCartOpen(false)}><aside className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-heading"><div><p className="eyebrow">TU SELECCIÓN</p><h2 id="cart-title">Tu bolsa <span>({cartCount})</span></h2></div><button className="close-drawer" type="button" onClick={() => setCartOpen(false)} aria-label="Cerrar bolsa">×</button></div>
        {cartItems.length === 0 ? <div className="empty-cart"><span>✳</span><h3>Tu bolsa está esperando.</h3><p>Explora la colección y añade las piezas que más conecten contigo.</p><button className="button button-dark" type="button" onClick={() => { setCartOpen(false); document.getElementById('coleccion')?.scrollIntoView({ behavior: 'smooth' }) }}>Ver colección</button></div> : <>
          <div className="cart-lines">{cartItems.map(({ key, product, variant, quantity }) => <div className="cart-line" key={key}><div className="cart-thumb product-art-cream"><div className="garment-shape" aria-hidden="true"><span /></div></div><div className="cart-line-info"><h3>{product.name}</h3><span>{formatPrice(variant.sale_price)}{variant.size ? ' · Talla ' + variant.size : ''}{variant.color ? ' · ' + (colorNames[variant.color.toLowerCase()] ?? variant.color) : ''}</span><div className="quantity-control"><button type="button" aria-label={`Quitar una unidad de ${product.name}`} onClick={() => changeQuantity(key, -1)}>−</button><span>{quantity}</span><button type="button" aria-label={`Añadir una unidad de ${product.name}`} onClick={() => changeQuantity(key, 1)}>+</button></div></div><strong>{formatPrice(variant.sale_price * quantity)}</strong></div>)}</div>
          <div className="cart-summary"><div><span>Subtotal estimado</span><strong>{formatPrice(cartTotal)} USD</strong></div><p>La disponibilidad, entrega y total final se confirman por WhatsApp. Este envío no reserva existencias.</p><a className="button button-dark checkout-button" href={whatsappUrl} target="_blank" rel="noreferrer">Solicitar pedido por WhatsApp <span aria-hidden="true">↗</span></a></div>
        </>}
      </aside></div>}
    </div>
  )
}

export default App
