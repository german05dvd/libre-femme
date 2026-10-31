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
  stock_quantity: number
}
type Product = {
  id: string
  name: string
  slug: string
  category: string
  description: string
  variants: Variant[]
  images: { url: string; alt: string; color_hex: string | null }[]
}
type CartLine = { key: string; product: Product; variant: Variant; quantity: number }

const whatsappNumber = '5358352149'
const colorNames: Record<string, string> = { rose: 'rosa arcilla', chocolate: 'chocolate', cream: 'crema', sand: 'arena', olive: 'oliva', clay: 'arcilla', plum: 'ciruela' }
const publicColorHex: Record<string, string> = {
  negro: '#22201e', black: '#22201e',
  blanco: '#fffdf8', white: '#fffdf8',
  verde: '#648b68', green: '#648b68',
  marron: '#55351f', marrón: '#55351f', brown: '#55351f', carmelita: '#a66f43',
  rosa: '#c98f91', rosado: '#c98f91', pink: '#c98f91',
  beige: '#d8c5a9', arena: '#d8c5a9', crema: '#f0e6d6', cream: '#f0e6d6',
  azul: '#6e8eae', blue: '#6e8eae', gris: '#92918d', gray: '#92918d', grey: '#92918d',
}
const fallbackColors = ['rose', 'sand', 'olive', 'clay', 'cream', 'plum']
const categories = ['Todo']

function slugifyCategory(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(price)
}

function App() {
  const [products, setProducts] = useState<Product[]>([])
  const categoryPath = window.location.pathname.match(/^\/categoria\/([^/]+)\/?$/)?.[1] ?? null
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
        client.from('public_catalog_variants').select('id, product_id, size, color, sale_price, quantity_on_hand'),
        client.from('public_catalog_images').select('id, product_id, storage_path, alt_text, position').order('position'),
      ])
      const [{ data: colorRows, error: colorError }, { data: variantImageRows, error: variantImageError }] = await Promise.all([
        client.from('public_catalog_variant_colors').select('id, color_hex'),
        client.from('public_catalog_variant_images').select('id, product_id, color_hex, storage_path, alt_text, position').order('position'),
      ])
      if (cancelled) return
      if (variantError) {
        setCatalogError('No pudimos cargar las variantes de la colección.')
        setLoading(false)
        return
      }
      if (colorError || variantImageError) {
        setCatalogError('No pudimos cargar los colores o las fotografías por variante. Comprueba que la migración del catálogo esté aplicada en Supabase.')
        setLoading(false)
        return
      }
      const nextProducts: Product[] = (productRows ?? []).map((row) => {
        const productImages = (imageRows ?? []).filter((item) => item.product_id === row.id).map((image) => ({ ...image, color_hex: null as string | null }))
        const variantImages = (variantImageRows ?? []).filter((item) => item.product_id === row.id)
        const images = [...productImages, ...variantImages]
          .map((image) => {
            const imagePath = image.storage_path as string
            const url = imagePath.startsWith('https://') || imagePath.startsWith('http://')
              ? imagePath
              : client.storage.from('product-images').getPublicUrl(imagePath).data.publicUrl
            return { url, alt: image.alt_text || row.name, color_hex: image.color_hex }
          })
        return {
          id: row.id,
          name: row.name,
          slug: row.slug,
          category: row.category || 'Otros',
          description: row.description || 'Una pieza elegida para ti.',
          variants: (variantRows ?? [])
            .filter((variant) => variant.product_id === row.id)
            .map((variant) => ({ id: variant.id, size: variant.size, color: variant.color, color_hex: (colorRows ?? []).find((item) => item.id === variant.id)?.color_hex ?? null, sale_price: Number(variant.sale_price), is_available: Number(variant.quantity_on_hand ?? 0) > 0, stock_quantity: Math.max(0, Number(variant.quantity_on_hand ?? 0)) })),
          images,
        }
      }).filter((product) => product.variants.length > 0)
      setProducts(nextProducts)
      if (categoryPath) {
        const requestedCategory = nextProducts.find((product) => slugifyCategory(product.category) === categoryPath)?.category
        if (requestedCategory) setActiveCategory(requestedCategory)
      }
      setLoading(false)
    }
    void loadCatalog()
    return () => { cancelled = true }
  }, [categoryPath])

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
    const slogans = ['Tu estilo, sin pedir permiso.', 'Piezas que hablan de ti.', 'Libertad para ser tú.', 'Lo que llevas, lo eliges tú.', 'Cada día, a tu manera.']
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
  const categoryLanding = categoryPath ? products.find((product) => slugifyCategory(product.category) === categoryPath)?.category ?? null : null
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
    if ((cart[key] ?? 0) >= variant.stock_quantity) {
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
      const maxQuantity = variant?.stock_quantity ?? 0
      const nextQuantity = Math.min(maxQuantity, Math.max(0, (current[key] ?? 0) + delta))
      const next = { ...current }
      if (nextQuantity === 0) delete next[key]
      else next[key] = nextQuantity
      return next
    })
  }

  const whatsappMessage = [
    'Hola, LIBRE femme. Quisiera consultar este pedido:',
    '',
    ...cartItems.map(({ product, variant, quantity }) => {
      const details = [
        variant.size ? 'Talla ' + variant.size : '',
        variant.color ? 'Color ' + (colorNames[variant.color.toLowerCase()] ?? variant.color) : '',
      ].filter(Boolean)
      return [
        '• ' + product.name,
        details.length ? '  ' + details.join(' · ') : '',
        '  Cantidad: ' + quantity,
        '  Precio: ' + formatPrice(variant.sale_price) + ' c/u',
        '  Subtotal: ' + formatPrice(variant.sale_price * quantity),
      ].filter(Boolean).join('\n')
    }),
    '',
    'Subtotal estimado: ' + formatPrice(cartTotal) + ' USD',
    'La disponibilidad y la entrega están pendientes de confirmación.',
    '',
    '¿Me ayudan a confirmar este pedido, por favor?',
  ].filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== '')).join('\n')
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
            <figure className="hero-photo hero-photo-main"><img src="/images/hero-main.webp" alt="Modelo con vestido oliva, inspiración editorial de LIBRE femme" width="750" height="1000" fetchPriority="high" decoding="async" onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.parentElement?.classList.add('photo-fallback') }} /><span className="photo-label">LIBRE FEMME / EDITORIAL</span></figure>
            <figure className="hero-photo hero-photo-detail"><img src="/images/hero-detail.webp" alt="Identidad visual LIBRE femme en tonos arena y chocolate" width="800" height="756" decoding="async" /><span className="photo-detail-index">FORMA · TEXTURA · ACTITUD</span></figure>
            <span className="gallery-stamp">VISTE<br /><em>tu esencia</em></span>
          </div>
        </section>

        <section className="collection-section section-wrap" id="coleccion">
          <div className="section-heading"><div><p className="eyebrow">{categoryLanding ? 'COLECCIÓN POR CATEGORÍA' : 'SELECCIÓN LIBRE'}</p><h2>{categoryLanding ? <>{categoryLanding} <em>para ti.</em></> : <>Nuestros <em>productos.</em></>}</h2></div><p className="section-intro">{categoryLanding ? `Descubre nuestra selección de ${categoryLanding.toLocaleLowerCase('es')} en LIBRE femme. Moda femenina en Cuba, elegida para expresar tu estilo a tu manera.` : 'Prendas versátiles, detalles cuidados y espacio para que tu personalidad sea la protagonista.'}</p></div>
          <nav className="category-filters category-seo-links" aria-label="Explorar categorías">{availableCategories.filter((category) => category !== 'Todo').map((category) => <a key={category} href={`/categoria/${slugifyCategory(category)}/`} className={categoryLanding === category ? 'filter-chip active' : 'filter-chip'} aria-current={categoryLanding === category ? 'page' : undefined}>{category}</a>)}</nav>
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
                  {(() => { const selectedHex = selectedVariant.color_hex?.trim().toLowerCase() || null; const colorImages = selectedHex ? product.images.filter(image => image.color_hex?.trim().toLowerCase() === selectedHex) : []; const gallery = colorImages.length > 0 ? colorImages : product.images.filter(image => image.color_hex === null); return gallery.length > 0 ? <>
                    <img className="catalog-product-image" src={gallery[(selectedProductImages[product.id] ?? 0) % gallery.length].url} alt={gallery[(selectedProductImages[product.id] ?? 0) % gallery.length].alt} loading="lazy" />
                    {gallery.length > 1 && <div className="product-gallery-controls" aria-label={`Fotografías de ${product.name}`}>
                      <button type="button" aria-label="Fotografía anterior" onClick={() => setSelectedProductImages(current => ({ ...current, [product.id]: ((current[product.id] ?? 0) - 1 + gallery.length) % gallery.length }))}>‹</button>
                      <span>{((selectedProductImages[product.id] ?? 0) % gallery.length) + 1} / {gallery.length}</span>
                      <button type="button" aria-label="Fotografía siguiente" onClick={() => setSelectedProductImages(current => ({ ...current, [product.id]: ((current[product.id] ?? 0) + 1) % gallery.length }))}>›</button>
                    </div>}
                  </> : <div className="garment-shape" aria-hidden="true"><span /></div> })()}
                  <button className="quick-add" type="button" onClick={() => addToCart(product)} aria-label={`Añadir ${product.name} a la bolsa`}>+ Añadir</button>
                </div>
                {(() => { const selectedHex = selectedVariant.color_hex?.trim().toLowerCase() || null; const colorImages = selectedHex ? product.images.filter(image => image.color_hex?.trim().toLowerCase() === selectedHex) : []; const gallery = colorImages.length > 0 ? colorImages : product.images.filter(image => image.color_hex === null); return gallery.length > 1 && <div className="product-gallery-thumbnails" aria-label={`Elegir fotografía de ${product.name}`}>
                  {gallery.map((image, imageIndex) => <button key={image.url} type="button" className={((selectedProductImages[product.id] ?? 0) % gallery.length) === imageIndex ? 'active' : ''} aria-label={`Ver fotografía ${imageIndex + 1}`} aria-pressed={((selectedProductImages[product.id] ?? 0) % gallery.length) === imageIndex} onClick={() => setSelectedProductImages(current => ({ ...current, [product.id]: imageIndex }))}><img src={image.url} alt="" loading="lazy" /></button>)}
                </div> })()}
                <div className="product-info"><div><h3>{product.name}</h3><p>{product.description}</p></div><span className="product-price">{formatPrice(selectedVariant.sale_price)}</span></div>
                <div className="product-options">
                  {sizes.length > 0 && <div className="size-picker" role="group" aria-label={`Elegir talla para ${product.name}`}><span className="option-label">TALLA</span>{sizes.map((size) => { const variant = product.variants.find((item) => item.size === size && (!selectedVariant.color || item.color === selectedVariant.color)) ?? product.variants.find((item) => item.size === size); return <button key={size} type="button" className={selectedVariant.id === variant?.id ? 'size-option selected' : 'size-option'} aria-pressed={selectedVariant.id === variant?.id} onClick={() => variant && setSelectedVariants((current) => ({ ...current, [product.id]: variant.id }))}>{size}</button> })}</div>}
                  {colors.length > 0 && <div className="color-picker" role="group" aria-label={`Elegir color para ${product.name}`}><span className="option-label">COLORES</span><div className="swatches">{colors.map((color) => { const variant = product.variants.find((item) => item.color === color && (!selectedVariant.size || item.size === selectedVariant.size)) ?? product.variants.find((item) => item.color === color); const swatch = color.toLowerCase().replace(/[^a-z]/g, ''); return <button key={color} type="button" className={`color-swatch swatch-${swatch} ${selectedVariant.id === variant?.id ? 'selected' : ''}`} style={(variant?.color_hex || publicColorHex[color.trim().toLocaleLowerCase('es')]) ? { backgroundColor: variant?.color_hex || publicColorHex[color.trim().toLocaleLowerCase('es')] } : undefined} aria-label={`Color ${color}`} aria-pressed={selectedVariant.id === variant?.id} onClick={() => variant && setSelectedVariants((current) => ({ ...current, [product.id]: variant.id }))} /> })}</div></div>}
                  <p className="variant-stock-note">{selectedVariant.stock_quantity > 0 ? `Disponible · ${selectedVariant.stock_quantity} ${selectedVariant.stock_quantity === 1 ? 'unidad' : 'unidades'}` : "Agotado por el momento"}</p><button className="product-add-link" type="button" disabled={!selectedVariant.is_available} onClick={() => addToCart(product)}>{selectedVariant.is_available ? "Añadir a la bolsa" : "Agotado"} <span>↗</span></button>
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
