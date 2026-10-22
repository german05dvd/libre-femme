import { useEffect, useMemo, useState } from 'react'
import './App.css'

type Product = {
  id: number
  name: string
  category: string
  price: number
  color: string
  label: string
  description: string
}

const products: Product[] = [
  { id: 1, name: 'Vestido Alba', category: 'Vestidos', price: 38, color: 'rose', label: 'NUEVO', description: 'Línea fluida · edición limitada' },
  { id: 2, name: 'Blusa Amalia', category: 'Tops', price: 24, color: 'sand', label: 'ESENCIAL', description: 'Textura suave · corte relajado' },
  { id: 3, name: 'Pantalón Siena', category: 'Pantalones', price: 32, color: 'olive', label: '', description: 'Silueta recta · tiro alto' },
  { id: 4, name: 'Conjunto Clara', category: 'Conjuntos', price: 46, color: 'clay', label: 'FAVORITO', description: 'Dos piezas · estilo versátil' },
  { id: 5, name: 'Top Noa', category: 'Tops', price: 19, color: 'cream', label: '', description: 'Minimalismo cotidiano' },
  { id: 6, name: 'Vestido Vera', category: 'Vestidos', price: 41, color: 'plum', label: '', description: 'Movimiento natural · noche y día' },
]

const categories = ['Todo', 'Vestidos', 'Tops', 'Pantalones', 'Conjuntos']
const whatsappNumber = '5358352149'
const colorNames: Record<string, string> = { rose: 'rosa arcilla', chocolate: 'chocolate', cream: 'crema', sand: 'arena', olive: 'oliva', clay: 'arcilla', plum: 'ciruela' }
type CartLine = { key: string; product: Product; size: string; color: string; quantity: number }

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(price)
}

function App() {
  const [activeCategory, setActiveCategory] = useState('Todo')
  const [searchTerm, setSearchTerm] = useState('')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [cartOpen, setCartOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [cartNotice, setCartNotice] = useState('')
  const [selectedSizes, setSelectedSizes] = useState<Record<number, string>>({})
  const [selectedColors, setSelectedColors] = useState<Record<number, string>>({})
  const [sloganText, setSloganText] = useState('Viste como te sientes.')

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

  const visibleProducts = useMemo(
    () => products.filter((product) => (activeCategory === 'Todo' || product.category === activeCategory) && `${product.name} ${product.category} ${product.description}`.toLocaleLowerCase('es').includes(searchTerm.trim().toLocaleLowerCase('es'))),
    [activeCategory, searchTerm],
  )
  const cartItems: CartLine[] = Object.entries(cart).flatMap(([key, quantity]) => {
    const [idText, size, color] = key.split('::')
    const product = products.find((item) => item.id === Number(idText))
    return product && quantity > 0 ? [{ key, product, size, color, quantity }] : []
  })
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)
  const cartTotal = cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0)

  const addToCart = (product: Product) => {
    const size = selectedSizes[product.id] ?? 'M'
    const color = selectedColors[product.id] ?? product.color
    const key = product.id + '::' + size + '::' + color
    changeQuantity(key, 1)
    setCartNotice(product.name + ' · talla ' + size + ' · ' + (colorNames[color] ?? color) + ' añadida a tu bolsa')
  }

  const changeQuantity = (key: string, delta: number) => {
    setCart((current) => {
      const nextQuantity = Math.max(0, (current[key] ?? 0) + delta)
      const next = { ...current }
      if (nextQuantity === 0) delete next[key]
      else next[key] = nextQuantity
      return next
    })
  }

  const whatsappMessage = [
    'Hola, LIBRE femme. Quisiera consultar disponibilidad de estas piezas:',
    ...cartItems.map(({ product, size, color, quantity }) => '• ' + product.name + ' · talla ' + size + ' · color ' + (colorNames[color] ?? color) + ' × ' + quantity + ' — ' + formatPrice(product.price * quantity)),
    `Total estimado: ${formatPrice(cartTotal)} USD`,
    '¿Me pueden confirmar disponibilidad y detalles de entrega?',
  ].join('\n')
  const whatsappUrl = whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}` : ''

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
        <button className="cart-trigger" type="button" onClick={() => setCartOpen(true)} aria-label={`Abrir bolsa, ${cartCount} artículos`}>
          Bolsa <span className="cart-count">{cartCount}</span>
        </button>
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
            <figure className="hero-photo hero-photo-main">
              <img src="https://images.unsplash.com/photo-1539100387613-e6a8b7f0a5e6?auto=format&fit=crop&w=1200&q=85" alt="Inspiración de moda femenina con silueta elegante" onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.parentElement?.classList.add('photo-fallback') }} />
              <span className="photo-label">LIBRE FEMME / EDITORIAL</span>
            </figure>
            <figure className="hero-photo hero-photo-detail">
              <img src="https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=85" alt="Detalles de estilo y prendas femeninas" onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.parentElement?.classList.add('photo-fallback') }} />
              <span className="photo-detail-index">FORMA · TEXTURA · ACTITUD</span>
            </figure>
            <span className="gallery-stamp">VISTE<br /><em>tu esencia</em></span>
          </div>
        </section>

        <section className="collection-section section-wrap" id="coleccion">
          <div className="section-heading">
            <div><p className="eyebrow">SELECCIÓN LIBRE</p><h2>Nuestros <em>productos.</em></h2></div>
            <p className="section-intro">Prendas versátiles, detalles cuidados y espacio para que tu personalidad sea la protagonista.</p>
          </div>
          <div className="collection-toolbar">
            <label className="product-search"><span className="sr-only">Buscar prendas</span><span className="search-icon" aria-hidden="true">⌕</span><input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar una prenda…" /></label>
            <div className="category-filters" role="group" aria-label="Filtrar por categoría">
              {categories.map((category) => <button key={category} type="button" className={activeCategory === category ? 'filter-chip active' : 'filter-chip'} onClick={() => setActiveCategory(category)} aria-pressed={activeCategory === category}>{category}</button>)}
            </div>
            <span className="product-count">{visibleProducts.length} {visibleProducts.length === 1 ? "PIEZA" : "PIEZAS"}</span>
          </div>
          <div className="product-grid">
            {visibleProducts.map((product, index) => (
              <article className="product-card" key={product.id} style={{ animationDelay: `${index * 65}ms` }}>
                <div className={`product-art product-art-${selectedColors[product.id] ?? product.color}`}>
                  <span className="product-number">0{index + 1}</span>
                  {product.label && <span className="product-label">{product.label}</span>}
                  <span className="availability-note">+10 disponibles</span>
                  <div className="garment-shape" aria-hidden="true"><span /></div>
                  <button className="quick-add" type="button" onClick={() => addToCart(product)} aria-label={`Añadir ${product.name} a la bolsa`}>+ Añadir</button>
                </div>
                <div className="product-info"><div><h3>{product.name}</h3><p>{product.description}</p></div><span className="product-price">{formatPrice(product.price)}</span></div>
                <div className="product-options">
                  <div className="size-picker" role="group" aria-label={`Elegir talla para ${product.name}`}><span className="option-label">TALLA</span>{['S', 'M', 'L', 'XL'].map((size) => <button key={size} type="button" className={`size-option ${(selectedSizes[product.id] ?? 'M') === size ? 'selected' : ''}`} aria-pressed={(selectedSizes[product.id] ?? 'M') === size} onClick={() => setSelectedSizes((current) => ({ ...current, [product.id]: size }))}>{size}</button>)}</div>
                  <div className="color-picker" role="group" aria-label={`Elegir color para ${product.name}`}><span className="option-label">COLORES</span><div className="swatches">{['rose', 'chocolate', 'cream'].map((color) => <button key={color} type="button" className={`color-swatch swatch-${color} ${(selectedColors[product.id] ?? product.color) === color ? 'selected' : ''}`} aria-label={`Color ${color}`} aria-pressed={(selectedColors[product.id] ?? product.color) === color} onClick={() => setSelectedColors((current) => ({ ...current, [product.id]: color }))} />)}</div></div>
                  <button className="product-add-link" type="button" onClick={() => addToCart(product)}>Añadir a la bolsa <span>↗</span></button>
                </div>
              </article>
            ))}
          </div>
          {visibleProducts.length === 0 && <div className="no-results"><span>✳</span><h3>No encontramos esa pieza.</h3><p>Prueba con otro nombre o cambia los filtros.</p><button className="text-link" type="button" onClick={() => { setSearchTerm(""); setActiveCategory("Todo") }}>Limpiar búsqueda</button></div>}
          <p className="demo-note">Vista de demostración: precios y productos de ejemplo. La disponibilidad real se conectará al inventario.</p>
        </section>

        <section className="details-editorial" id="detalles">
          <div className="details-heading">
            <p className="eyebrow">ANTES DE ELEGIR</p>
            <h2>Los detalles<br /><em>también visten.</em></h2>
          </div>
          <div className="details-content">
            <article className="detail-note"><span className="detail-index">01 / TALLAS</span><h3>Elige cómo quieres sentirte.</h3><p>Selecciona tu talla en cada pieza. Si dudas entre dos, escríbenos antes de confirmar y te ayudaremos a elegir el ajuste que buscas.</p></article>
            <article className="detail-note"><span className="detail-index">02 / COLOR</span><h3>Un mismo diseño, otra intención.</h3><p>Explora los tonos disponibles en cada tarjeta. Los colores que ves aquí son una vista previa y se confirmarán al consultar tu pedido.</p></article>
            <article className="detail-note detail-note-dark"><span className="detail-index">03 / TU PEDIDO</span><h3>Primero lo confirmamos contigo.</h3><p>Tu bolsa reúne las piezas elegidas y abre una consulta por WhatsApp. Confirmamos disponibilidad y entrega antes de cerrar el pedido; añadir algo no reserva existencias.</p><a className="details-link" href="https://wa.me/5358352149?text=Hola%2C%20LIBRE%20femme.%20Quisiera%20consultar%20sobre%20las%20tallas%2C%20colores%20y%20disponibilidad%20de%20la%20colecci%C3%B3n." target="_blank" rel="noreferrer">Consultar por WhatsApp <span aria-hidden="true">↗</span></a></article>
          </div>
          <div className="details-signature"><span>LIBRE femme</span><span>Elegido por ti. A tu manera.</span><span>LA HABANA · CUBA</span></div>
        </section>
      </main>

      <footer className="site-footer"><a className="wordmark footer-wordmark" href="#inicio">LIBRE <span>femme</span></a><p>Vestir con libertad, vivir con intención.</p><span>© 2026 LIBRE femme</span></footer>

      {cartOpen && <div className="drawer-backdrop" role="presentation" onClick={() => setCartOpen(false)}>
        <aside className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title" onClick={(event) => event.stopPropagation()}>
          <div className="drawer-heading"><div><p className="eyebrow">TU SELECCIÓN</p><h2 id="cart-title">Tu bolsa <span>({cartCount})</span></h2></div><button className="close-drawer" type="button" onClick={() => setCartOpen(false)} aria-label="Cerrar bolsa">×</button></div>
          {cartItems.length === 0 ? <div className="empty-cart"><span>✳</span><h3>Tu bolsa está esperando.</h3><p>Explora la colección y añade las piezas que más conecten contigo.</p><button className="button button-dark" type="button" onClick={() => { setCartOpen(false); document.getElementById('coleccion')?.scrollIntoView({ behavior: 'smooth' }) }}>Ver colección</button></div> : <>
            <div className="cart-lines">{cartItems.map(({ key, product, size, color, quantity }) => <div className="cart-line" key={key}><div className={`cart-thumb product-art-${color}`}><div className="garment-shape" aria-hidden="true"><span /></div></div><div className="cart-line-info"><h3>{product.name}</h3><span>{formatPrice(product.price)} · Talla {size} · {colorNames[color] ?? color}</span><div className="quantity-control"><button type="button" aria-label={`Quitar una unidad de ${product.name}, talla ${size}`} onClick={() => changeQuantity(key, -1)}>−</button><span>{quantity}</span><button type="button" aria-label={`Añadir una unidad de ${product.name}, talla ${size}`} onClick={() => changeQuantity(key, 1)}>+</button></div></div><strong>{formatPrice(product.price * quantity)}</strong></div>)}</div>
            <div className="cart-summary"><div><span>Subtotal estimado</span><strong>{formatPrice(cartTotal)} USD</strong></div><p>La disponibilidad, entrega y total final se confirman por WhatsApp. Este envío no reserva existencias.</p><a className="button button-dark checkout-button" href={whatsappUrl} target="_blank" rel="noreferrer">Consultar por WhatsApp <span aria-hidden="true">↗</span></a></div>
          </>}
        </aside>
      </div>}
    </div>
  )
}

export default App
