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
const whatsappNumber = (import.meta.env.VITE_WHATSAPP_NUMBER as string | undefined)?.replace(/\D/g, '') ?? ''

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(price)
}

function App() {
  const [activeCategory, setActiveCategory] = useState('Todo')
  const [cart, setCart] = useState<Record<number, number>>({})
  const [cartOpen, setCartOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [cartNotice, setCartNotice] = useState('')

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

  const visibleProducts = useMemo(
    () => activeCategory === 'Todo' ? products : products.filter((product) => product.category === activeCategory),
    [activeCategory],
  )
  const cartItems = products.filter((product) => (cart[product.id] ?? 0) > 0)
  const cartCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0)
  const cartTotal = cartItems.reduce((sum, product) => sum + product.price * (cart[product.id] ?? 0), 0)

  const addToCart = (product: Product) => {
    changeQuantity(product.id, 1)
    setCartNotice(`${product.name} añadida a tu bolsa`)
  }

  const changeQuantity = (productId: number, delta: number) => {
    setCart((current) => {
      const nextQuantity = Math.max(0, (current[productId] ?? 0) + delta)
      const next = { ...current }
      if (nextQuantity === 0) delete next[productId]
      else next[productId] = nextQuantity
      return next
    })
  }

  const whatsappMessage = [
    'Hola, LIBRE femme. Quisiera consultar disponibilidad de estas piezas:',
    ...cartItems.map((product) => `• ${product.name} × ${cart[product.id]} — ${formatPrice(product.price * (cart[product.id] ?? 0))}`),
    `Total estimado: ${formatPrice(cartTotal)} USD`,
    '¿Me pueden confirmar disponibilidad y detalles de entrega?',
  ].join('\n')
  const whatsappUrl = whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}` : ''

  return (
    <div className="storefront">\n      <div className="sr-only" role="status" aria-live="polite">{cartNotice}</div>\n      {cartNotice && <div className="cart-toast" role="status"><span aria-hidden="true">✓</span>{cartNotice}<button type="button" onClick={() => setCartOpen(true)}>Ver bolsa</button></div>}
      <div className="announcement">Una forma más libre de vestir <span>✳</span> Piezas elegidas para ti</div>
      <header className="site-header">
        <button className="mobile-menu-button" type="button" aria-label="Abrir menú" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>{mobileMenuOpen ? 'Cerrar' : 'Menú'}</button>
        <a className="wordmark" href="#inicio" aria-label="LIBRE femme, inicio">LIBRE <span>femme</span></a>
        <nav className={mobileMenuOpen ? 'main-nav is-open' : 'main-nav'} aria-label="Navegación principal">
          <a href="#coleccion" onClick={() => setMobileMenuOpen(false)}>Colección</a>
          <a href="#filosofia" onClick={() => setMobileMenuOpen(false)}>Nuestra esencia</a>
          <a href="#contacto" onClick={() => setMobileMenuOpen(false)}>Contacto</a>
        </nav>
        <button className="cart-trigger" type="button" onClick={() => setCartOpen(true)} aria-label={`Abrir bolsa, ${cartCount} artículos`}>
          Bolsa <span className="cart-count">{cartCount}</span>
        </button>
      </header>

      <main>
        <section className="hero-section" id="inicio">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-line" /> ESTILO CON INTENCIÓN</p>
            <h1>Viste como<br />te <em>sientes.</em></h1>
            <p className="hero-description">Piezas que acompañan tu forma de ser. Una selección consciente para expresarte con libertad, todos los días.</p>
            <a className="button button-dark" href="#coleccion">Descubrir la colección <span aria-hidden="true">↗</span></a>
            <div className="hero-note"><span className="note-star">✳</span><span>Menos ruido.<br /><strong>Más tú.</strong></span></div>
          </div>
          <div className="hero-art" aria-label="Composición editorial de tonos cálidos y siluetas">
            <div className="art-sun" />
            <div className="art-shape art-shape-back" />
            <div className="art-shape art-shape-front" />
            <div className="art-fabric" />
            <span className="art-caption">COLECCIÓN / 01</span>
            <span className="art-index">L.F — 2026</span>
          </div>
          <div className="hero-footer"><span>DISEÑADO PARA TU DÍA A DÍA</span><span>HECHO PARA SER TÚ <span aria-hidden="true">↓</span></span></div>
        </section>

        <section className="collection-section section-wrap" id="coleccion">
          <div className="section-heading">
            <div><p className="eyebrow">SELECCIÓN LIBRE</p><h2>Piezas para <em>habitarte.</em></h2></div>
            <p className="section-intro">Prendas versátiles, detalles cuidados y espacio para que tu personalidad sea la protagonista.</p>
          </div>
          <div className="collection-toolbar">
            <div className="category-filters" role="group" aria-label="Filtrar por categoría">
              {categories.map((category) => <button key={category} type="button" className={activeCategory === category ? 'filter-chip active' : 'filter-chip'} onClick={() => setActiveCategory(category)} aria-pressed={activeCategory === category}>{category}</button>)}
            </div>
            <span className="product-count">{visibleProducts.length} PIEZAS</span>
          </div>
          <div className="product-grid">
            {visibleProducts.map((product, index) => (
              <article className="product-card" key={product.id} style={{ animationDelay: `${index * 65}ms` }}>
                <div className={`product-art product-art-${product.color}`}>
                  <span className="product-number">0{index + 1}</span>
                  {product.label && <span className="product-label">{product.label}</span>}
                  <div className="garment-shape" aria-hidden="true"><span /></div>
                  <button className="quick-add" type="button" onClick={() => addToCart(product)} aria-label={`Añadir ${product.name} a la bolsa`}>+ Añadir</button>
                </div>
                <div className="product-info"><div><h3>{product.name}</h3><p>{product.description}</p></div><span className="product-price">{formatPrice(product.price)}</span></div>
              </article>
            ))}
          </div>
          <p className="demo-note">Vista de demostración: precios y productos de ejemplo. La disponibilidad real se conectará al inventario.</p>
        </section>

        <section className="philosophy-section" id="filosofia">
          <div className="philosophy-mark">L<span>F</span></div>
          <div className="philosophy-copy"><p className="eyebrow">LA ESENCIA DE LIBRE</p><h2>Tu estilo.<br /><em>Tus reglas.</em></h2><p>No creemos en vestirte para encajar. Creemos en encontrar esas piezas que te hacen sentir cómoda, segura y genuinamente tú.</p><a href="#coleccion" className="text-link">Encuentra tus piezas <span aria-hidden="true">↗</span></a></div>
          <div className="philosophy-aside"><span>01 / 03</span><p>Elegir con intención.<br />Vestir con libertad.</p><span className="aside-flower">✳</span></div>
        </section>

        <section className="contact-strip" id="contacto"><div><p className="eyebrow">ESTAMOS AQUÍ PARA TI</p><h2>¿Buscas algo especial?</h2><p>Escríbenos y te ayudamos a encontrar tu próxima pieza favorita.</p></div><a className="button button-light" href={whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent('Hola, LIBRE femme. Quisiera conocer más sobre la colección.')}` : '#coleccion'} target={whatsappNumber ? '_blank' : undefined} rel={whatsappNumber ? 'noreferrer' : undefined}>{whatsappNumber ? 'Hablemos por WhatsApp' : 'Explorar colección'} <span aria-hidden="true">↗</span></a></section>
      </main>

      <footer className="site-footer"><a className="wordmark footer-wordmark" href="#inicio">LIBRE <span>femme</span></a><p>Vestir con libertad, vivir con intención.</p><span>© 2026 LIBRE femme</span></footer>

      {cartOpen && <div className="drawer-backdrop" role="presentation" onClick={() => setCartOpen(false)}>
        <aside className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title" onClick={(event) => event.stopPropagation()}>
          <div className="drawer-heading"><div><p className="eyebrow">TU SELECCIÓN</p><h2 id="cart-title">Tu bolsa <span>({cartCount})</span></h2></div><button className="close-drawer" type="button" onClick={() => setCartOpen(false)} aria-label="Cerrar bolsa">×</button></div>
          {cartItems.length === 0 ? <div className="empty-cart"><span>✳</span><h3>Tu bolsa está esperando.</h3><p>Explora la colección y añade las piezas que más conecten contigo.</p><button className="button button-dark" type="button" onClick={() => { setCartOpen(false); document.getElementById('coleccion')?.scrollIntoView({ behavior: 'smooth' }) }}>Ver colección</button></div> : <>
            <div className="cart-lines">{cartItems.map((product) => <div className="cart-line" key={product.id}><div className={`cart-thumb product-art-${product.color}`}><div className="garment-shape" aria-hidden="true"><span /></div></div><div className="cart-line-info"><h3>{product.name}</h3><span>{formatPrice(product.price)}</span><div className="quantity-control"><button type="button" aria-label={`Quitar una unidad de ${product.name}`} onClick={() => changeQuantity(product.id, -1)}>−</button><span>{cart[product.id]}</span><button type="button" aria-label={`Añadir una unidad de ${product.name}`} onClick={() => changeQuantity(product.id, 1)}>+</button></div></div><strong>{formatPrice(product.price * (cart[product.id] ?? 0))}</strong></div>)}</div>
            <div className="cart-summary"><div><span>Subtotal estimado</span><strong>{formatPrice(cartTotal)} USD</strong></div><p>La disponibilidad, entrega y total final se confirman por WhatsApp. Este envío no reserva existencias.</p>{whatsappNumber ? <a className="button button-dark checkout-button" href={whatsappUrl} target="_blank" rel="noreferrer">Consultar por WhatsApp <span aria-hidden="true">↗</span></a> : <div className="setup-notice">Para activar el pedido, configura <code>VITE_WHATSAPP_NUMBER</code> con el número comercial en formato internacional, sin el signo +.</div>}</div>
          </>}
        </aside>
      </div>}
    </div>
  )
}

export default App
