import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import seoContent from '../content/seo-pages.json'
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

type SeoPage = typeof seoContent.pages[number]

function EditorialPage({ page, featuredProduct }: { page: SeoPage; featuredProduct?: Product }) {
  const featuredImage = featuredProduct?.images[0]
  return <div className="seo-editorial-page">
    <header className="seo-editorial-nav">
      <a className="wordmark" href="/">LIBRE <span>femme</span></a>
      <a href="/#coleccion">LA COLECCIÓN <span>↗</span></a>
    </header>
    <main>
      <section className="seo-editorial-hero">
        <div className="seo-editorial-hero-copy">
          <p className="eyebrow">LIBRE FEMME <span>·</span> INSPIRACIÓN Y ESTILO</p>
          <p className="seo-editorial-kicker">UNA MIRADA A TU MANERA DE VESTIR</p>
          <h1>{page.h1}</h1>
          <p className="seo-editorial-intro">{page.intro}</p>
          <a className="seo-editorial-cta" href={page.links[0]?.href || '/#coleccion'}>{page.links[0]?.label || 'Explorar colección'} <span>↗</span></a>
          <span className="seo-editorial-index">ESTILO LIBRE — 01 / 04</span>
        </div>
        <div className="seo-editorial-hero-visual">
          {featuredImage
            ? <img src={featuredImage.url} alt={featuredImage.alt || featuredProduct?.name || page.h1} />
            : <div className="seo-editorial-art" aria-hidden="true"><span>LIBRE</span><i>femme</i><b>01</b></div>}
          <p>{featuredProduct?.name || 'Piezas elegidas para acompañarte'}</p>
        </div>
      </section>
      <section className="seo-editorial-story">
        <div className="seo-editorial-story-aside">
          <p className="eyebrow">EL ESTILO ESTÁ EN LOS DETALLES</p>
          <span>LIBRE<br/>FEMME</span>
        </div>
        <div className="seo-editorial-sections">
          {page.sections.map((section, index) => <article className="seo-editorial-section" key={section.heading}>
            <span className="seo-editorial-number">0{index + 1}</span>
            <div><h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
          </article>)}
        </div>
      </section>
      <section className="seo-editorial-discover">
        <div><p className="eyebrow">ENCUENTRA TU PRÓXIMA PIEZA</p><h2>Elige lo que <em>habla de ti.</em></h2></div>
        <div className="seo-editorial-discover-links">
          {page.links.map((link, index) => <a key={link.href} href={link.href}><span>0{index + 1}</span>{link.label}<b>↗</b></a>)}
        </div>
      </section>
    </main>
    <footer className="seo-editorial-footer"><a className="wordmark" href="/">LIBRE <span>femme</span></a><p>Prendas que hablan de ti. Texturas, formas y detalles elegidos para acompañarte a tu manera.</p><a href="/#coleccion">DESCUBRIR LA COLECCIÓN ↗</a></footer>
  </div>
}

function App() {
  const [products, setProducts] = useState<Product[]>([])
  const categoryPath = window.location.pathname.match(/^\/categoria\/([^/]+)\/?$/)?.[1] ?? null
  const productPath = window.location.pathname.match(/^\/producto\/([^/]+)\/?$/)?.[1] ?? null
  const guidePath = window.location.pathname.match(/^\/guia\/([^/]+)\/?$/)?.[1] ?? null
  const editorialPage = seoContent.pages.find((page) => page.slug === guidePath) ?? null
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
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const galleryTouchStart = useRef<number | null>(null)
  const productReturnPath = useRef('/')

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
      if (productPath) {
        const routeProduct = nextProducts.find((product) => slugifyCategory(product.slug) === productPath)
        if (routeProduct) setSelectedProduct(routeProduct)
      }
      if (categoryPath) {
        const requestedCategory = nextProducts.find((product) => slugifyCategory(product.category) === categoryPath)?.category
        if (requestedCategory) setActiveCategory(requestedCategory)
      }
      setLoading(false)
    }
    void loadCatalog()
    return () => { cancelled = true }
  }, [categoryPath, productPath])

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
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => {
      setSelectedProductImages((current) => {
        const next = { ...current }
        products.forEach((product) => {
          const variant = product.variants.find((item) => item.id === selectedVariants[product.id]) ?? product.variants[0]
          const activeHex = variant?.color_hex?.trim().toLowerCase() || null
          const colorImages = activeHex ? product.images.filter((image) => image.color_hex?.trim().toLowerCase() === activeHex) : []
          const gallery = colorImages.length ? colorImages : product.images.filter((image) => image.color_hex === null)
          if (gallery.length > 1) next[product.id] = ((current[product.id] ?? 0) + 1) % gallery.length
        })
        return next
      })
    }, 7000)
    return () => window.clearInterval(timer)
  }, [products, selectedVariants])

  const availableCategories = useMemo(() => [...categories, ...new Set(products.map((product) => product.category).filter(Boolean))], [products])
  const categoryLanding = categoryPath ? products.find((product) => slugifyCategory(product.category) === categoryPath)?.category ?? null : null

  useEffect(() => {
    const title = selectedProduct
      ? selectedProduct.name + ' | LIBRE femme · ' + selectedProduct.category + ' en Cuba'
      : editorialPage
        ? editorialPage.title
        : categoryLanding
          ? categoryLanding + ' para mujer en Cuba | LIBRE femme'
          : 'Tienda de ropa para mujer en Cuba | LIBRE femme'
    const description = selectedProduct
      ? (selectedProduct.description || selectedProduct.name) + ' Consulta tallas, colores y disponibilidad por WhatsApp.'
      : editorialPage
        ? editorialPage.description
        : categoryLanding
          ? 'Descubre nuestra selección de ' + categoryLanding.toLocaleLowerCase('es') + ' para mujer en Cuba en LIBRE femme.'
          : 'Tienda de moda femenina en Cuba. Descubre ropa para mujer, vestidos, tops, conjuntos, bolsos y accesorios en LIBRE femme.'
    document.title = title
    const descriptionTag = document.querySelector('meta[name="description"]')
    if (descriptionTag) descriptionTag.setAttribute('content', description.slice(0, 155))
    const canonical = selectedProduct
      ? '/producto/' + slugifyCategory(selectedProduct.slug) + '/'
      : editorialPage
        ? '/' + editorialPage.path + '/'
        : categoryLanding && categoryPath
          ? '/categoria/' + categoryPath + '/'
          : '/'
    const canonicalTag = document.querySelector('link[rel="canonical"]')
    if (canonicalTag) canonicalTag.setAttribute('href', window.location.origin + canonical)
  }, [selectedProduct, editorialPage, categoryLanding, categoryPath])
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

  const openProduct = (product: Product) => {
    if (!window.location.pathname.startsWith('/producto/')) {
      productReturnPath.current = window.location.pathname + window.location.search + window.location.hash
    }
    window.history.pushState({ productModal: true }, '', '/producto/' + slugifyCategory(product.slug) + '/')
    setSelectedProduct(product)
  }

  const closeProduct = () => {
    if (window.location.pathname.startsWith('/producto/')) {
      window.history.replaceState({}, '', productReturnPath.current || '/')
    }
    setSelectedProduct(null)
  }

  useEffect(() => {
    const syncProductRoute = () => {
      const slug = window.location.pathname.match(/^\/producto\/([^/]+)\/?$/)?.[1] ?? null
      setSelectedProduct(slug ? products.find((product) => slugifyCategory(product.slug) === slug) ?? null : null)
      if (!slug) {
        const category = window.location.pathname.match(/^\/categoria\/([^/]+)\/?$/)?.[1]
        const categoryName = category ? products.find((product) => slugifyCategory(product.category) === category)?.category : null
        setActiveCategory(categoryName ?? 'Todo')
      }
    }
    window.addEventListener('popstate', syncProductRoute)
    return () => window.removeEventListener('popstate', syncProductRoute)
  }, [products])

  useEffect(() => {
    if (!selectedProduct) return
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { if (window.location.pathname.startsWith('/producto/')) window.history.replaceState({}, '', productReturnPath.current || '/'); setSelectedProduct(null) } }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedProduct])

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

  if (editorialPage) {
    const preferredCategory = editorialPage.slug.includes('bolso') ? 'Bolsos' : editorialPage.slug.includes('tops') ? 'Tops' : editorialPage.slug.includes('comprar') ? '' : 'Conjuntos'
    const featuredProduct = products.find((product) => preferredCategory && product.category.toLocaleLowerCase('es') === preferredCategory.toLocaleLowerCase('es') && product.images[0]) || products.find((product) => product.images[0])
    return <EditorialPage page={editorialPage} featuredProduct={featuredProduct} />
  }

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
          <a href="/#inspiracion" onClick={() => setMobileMenuOpen(false)}>Detalles</a>
        </nav>
        <button className="cart-trigger" type="button" onClick={() => setCartOpen(true)} aria-label={`Abrir bolsa, ${cartCount} artículos`}>Bolsa <span className="cart-count">{cartCount}</span></button>
      </header>

      <main>
        <section className="hero-section hero-editorial" id="inicio">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-line" /> LIBRE FEMME · VESTIR CON LIBERTAD</p>
            <h1 className="hero-headline">Viste a tu manera.<span className="hero-headline-accent"> Sin límites.</span></h1>
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
          <div className="section-heading"><div><p className="eyebrow">{categoryLanding ? 'COLECCIÓN POR CATEGORÍA' : 'SELECCIÓN LIBRE'}</p><h2>{categoryLanding ? <>{categoryLanding} <em>para ti.</em></> : <>Nuestros productos.</>}</h2></div><p className="section-intro">{categoryLanding ? `Descubre nuestra selección de ${categoryLanding.toLocaleLowerCase('es')} en LIBRE femme. Moda femenina en Cuba, elegida para expresar tu estilo a tu manera.` : 'Prendas versátiles, detalles cuidados y espacio para que tu personalidad sea la protagonista.'}</p></div>
          <div className="collection-toolbar">
            <label className="product-search"><span className="sr-only">Buscar prendas</span><span className="search-icon" aria-hidden="true">⌕</span><input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar una prenda…" /></label>
            <div className="category-filters" role="group" aria-label="Filtrar por categoría">
              {availableCategories.map((category) => category === 'Todo' ? <button key={category} type="button" className={activeCategory === category ? 'filter-chip active' : 'filter-chip'} onClick={() => { if (categoryPath) window.location.assign('/'); else setActiveCategory(category) }} aria-pressed={activeCategory === category}>{category}</button> : <a key={category} href={'/categoria/' + slugifyCategory(category) + '/'} className={activeCategory === category ? 'filter-chip active' : 'filter-chip'} aria-current={activeCategory === category ? 'page' : undefined}>{category}</a>)}
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
                <div className={`product-art product-art-${visualColor}`} role="button" tabIndex={0} aria-label={`Ver detalles de ${product.name}`} onClick={() => openProduct(product)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openProduct(product) } }}>
                  <span className="product-number">{String(index + 1).padStart(2, '0')}</span>
                  {(() => { const selectedHex = selectedVariant.color_hex?.trim().toLowerCase() || null; const colorImages = selectedHex ? product.images.filter(image => image.color_hex?.trim().toLowerCase() === selectedHex) : []; const gallery = colorImages.length > 0 ? colorImages : product.images.filter(image => image.color_hex === null); return gallery.length > 0 ? <>
                    <img className="catalog-product-image" src={gallery[(selectedProductImages[product.id] ?? 0) % gallery.length].url} alt={gallery[(selectedProductImages[product.id] ?? 0) % gallery.length].alt} loading="lazy" />
                    {gallery.length > 1 && <div className="product-gallery-arrows" onClick={(event) => event.stopPropagation()} aria-label={`Fotografías de ${product.name}`}>
                      <button type="button" aria-label="Fotografía anterior" onClick={() => setSelectedProductImages(current => ({ ...current, [product.id]: ((current[product.id] ?? 0) - 1 + gallery.length) % gallery.length }))}>‹</button>
                      <button type="button" aria-label="Fotografía siguiente" onClick={() => setSelectedProductImages(current => ({ ...current, [product.id]: ((current[product.id] ?? 0) + 1) % gallery.length }))}>›</button>
                    </div>}
                  </> : <div className="garment-shape" aria-hidden="true"><span /></div> })()}
                  <button className="quick-add" type="button" onClick={(event) => { event.stopPropagation(); addToCart(product) }} aria-label={`Añadir ${product.name} a la bolsa`}>+ Añadir</button>
                </div>
                <div className="product-info"><div><h3><a className="product-title-link" href={'/producto/' + slugifyCategory(product.slug) + '/'} onClick={(event) => { event.preventDefault(); openProduct(product) }}>{product.name}</a></h3><p className="product-description-preview">{product.description}</p></div><span className="product-price">{formatPrice(selectedVariant.sale_price)}</span></div>
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

        {categoryLanding && <section className="category-seo-faq" aria-labelledby="category-faq-title">
          <p className="eyebrow">CONSULTAS FRECUENTES</p>
          <h2 id="category-faq-title">Sobre {categoryLanding.toLocaleLowerCase('es')}</h2>
          <details><summary>¿Cómo consulto la disponibilidad?</summary><p>Añade la pieza a tu bolsa y envía la selección por WhatsApp. Confirmamos contigo la disponibilidad y los detalles de entrega antes de cerrar el pedido.</p></details>
          <details><summary>¿Puedo elegir talla o color?</summary><p>Cuando una prenda tiene variantes publicadas, puedes seleccionar las opciones disponibles en su ficha. Los detalles se confirman por WhatsApp.</p></details>
        </section>}

        <section className="seo-guides-section" id="inspiracion" aria-labelledby="seo-guides-title">
          <div className="seo-guides-heading"><p className="eyebrow">INSPIRACIÓN LIBRE</p><h2 id="seo-guides-title">Ideas para vestir <em>a tu manera.</em></h2><p>Consejos sencillos para combinar prendas, explorar estilos y elegir lo que habla de ti.</p></div>
          <div className="seo-guides-grid">{seoContent.pages.filter((page) => page.kind === 'article').map((page) => <article className="seo-guide-card" key={page.slug}><p className="eyebrow">GUÍA DE ESTILO</p><h3><a href={'/' + page.path + '/'}>{page.h1}</a></h3><p>{page.description}</p><a className="seo-guide-link" href={'/' + page.path + '/'}>Leer guía ↗</a></article>)}</div>
          <a className="seo-how-to-buy" href="/guia/como-comprar-en-libre-femme/">Cómo comprar en LIBRE femme ↗</a>
        </section>


      </main>



      {selectedProduct && (() => {
        const activeVariant = selectedProduct.variants.find(item => item.id === selectedVariants[selectedProduct.id]) ?? selectedProduct.variants[0]
        const activeHex = activeVariant.color_hex?.trim().toLowerCase() || null
        const colorGallery = activeHex ? selectedProduct.images.filter(image => image.color_hex?.trim().toLowerCase() === activeHex) : []
        const generalGallery = selectedProduct.images.filter(image => image.color_hex === null)
        const gallery = colorGallery.length ? colorGallery : (generalGallery.length ? generalGallery : selectedProduct.images)
        const imageIndex = (selectedProductImages[selectedProduct.id] ?? 0) % Math.max(gallery.length, 1)
        const currentImage = gallery[imageIndex]
        const sizes = [...new Set(selectedProduct.variants.map(item => item.size).filter(Boolean))]
        const colors = [...new Set(selectedProduct.variants.map(item => item.color).filter((color): color is string => Boolean(color)))]
        return <div className="product-modal-backdrop" role="presentation" onClick={closeProduct}>
          <section className="product-modal" role="dialog" aria-modal="true" aria-label={selectedProduct.name} onClick={event => event.stopPropagation()}>
            <button className="product-modal-close" type="button" onClick={closeProduct} aria-label="Cerrar detalles">×</button>
            <div className="product-modal-image"
              onTouchStart={(event) => { galleryTouchStart.current = event.touches[0]?.clientX ?? null }}
              onTouchEnd={(event) => {
                const start = galleryTouchStart.current
                const end = event.changedTouches[0]?.clientX
                galleryTouchStart.current = null
                if (start === null || end === undefined || Math.abs(end - start) < 40 || gallery.length < 2) return
                const direction = end < start ? 1 : -1
                setSelectedProductImages(state => ({ ...state, [selectedProduct.id]: (imageIndex + direction + gallery.length) % gallery.length }))
              }}>
              {currentImage ? <img src={currentImage.url} alt={currentImage.alt} /> : <div className="garment-shape"><span /></div>}
              {gallery.length > 1 && <>
                <button className="gallery-arrow gallery-arrow-prev" type="button" aria-label="Foto anterior" onClick={() => setSelectedProductImages(state => ({...state,[selectedProduct.id]:(imageIndex-1+gallery.length)%gallery.length}))}>‹</button>
                <button className="gallery-arrow gallery-arrow-next" type="button" aria-label="Foto siguiente" onClick={() => setSelectedProductImages(state => ({...state,[selectedProduct.id]:(imageIndex+1)%gallery.length}))}>›</button>
                <span className="gallery-position" aria-live="polite">{imageIndex+1} / {gallery.length}</span>
              </>}
            </div>
            <div className="product-modal-info">
              <p className="eyebrow">{selectedProduct.category}</p>
              <h2>{selectedProduct.name}</h2>
              <p className="product-modal-description">{selectedProduct.description}</p>
              <strong className="product-modal-price">{formatPrice(activeVariant.sale_price)}</strong>
              <div className="product-modal-variant-grid">
              {sizes.length > 0 && <div className="product-modal-options"><span className="option-label">TALLA</span><div>{sizes.map(size => {
                const option = selectedProduct.variants.find(item => item.size === size && (!activeVariant.color || item.color === activeVariant.color)) ?? selectedProduct.variants.find(item => item.size === size)
                return <button key={size} type="button" className={activeVariant.id === option?.id ? 'selected' : ''} aria-pressed={activeVariant.id === option?.id} onClick={() => option && setSelectedVariants(state => ({...state,[selectedProduct.id]:option.id}))}>{size}</button>
              })}</div></div>}
              {colors.length > 0 && <div className="product-modal-options product-modal-color-options"><span className="option-label">COLOR</span><div>{colors.map(color => {
                const option = selectedProduct.variants.find(item => item.color === color && (!activeVariant.size || item.size === activeVariant.size)) ?? selectedProduct.variants.find(item => item.color === color)
                const hex = option?.color_hex || publicColorHex[color.trim().toLocaleLowerCase('es')] || '#d8c5a9'
                return <button key={color} type="button" className={activeVariant.color === color ? 'selected' : ''} aria-label={'Color ' + color} title={color} aria-pressed={activeVariant.color === color} onClick={() => option && setSelectedVariants(state => ({...state,[selectedProduct.id]:option.id}))}><span className="modal-color-swatch" style={{ backgroundColor: hex }} /></button>
              })}</div></div>}
              </div>
              <p className="variant-stock-note">{activeVariant.stock_quantity > 0 ? `Disponible · ${activeVariant.stock_quantity}` : 'Agotado por el momento'}</p>
              <button className="product-modal-add" type="button" disabled={!activeVariant.is_available} onClick={() => addToCart(selectedProduct)}>{activeVariant.is_available ? 'Añadir a la bolsa ↗' : 'Agotado'}</button>
            </div>
          </section>
        </div>
      })()}
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
