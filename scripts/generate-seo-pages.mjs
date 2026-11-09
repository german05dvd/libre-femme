import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const siteUrl = 'https://libre-femme.com'
const supabaseUrl = process.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

function slugify(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

function jsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function meta(title, description, canonical, structuredData, image = '') {
  return [
    '<title>' + escapeHtml(title) + '</title>',
    '<meta name="description" content="' + escapeHtml(description) + '" />',
    '<meta name="robots" content="index,follow,max-image-preview:large" />',
    '<link rel="canonical" href="' + canonical + '" />',
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="LIBRE femme" />',
    '<meta property="og:title" content="' + escapeHtml(title) + '" />',
    '<meta property="og:description" content="' + escapeHtml(description) + '" />',
    '<meta property="og:url" content="' + canonical + '" />',
    image ? '<meta property="og:image" content="' + escapeHtml(image) + '" />' : '',
    '<meta name="twitter:card" content="summary_large_image" />',
    '<style>.seo-editorial-page{min-height:100vh;background:#fbf8f2;color:#39281f;font-family:Arial,sans-serif}.seo-editorial-nav{height:76px;display:flex;align-items:center;justify-content:space-between;padding:0 7vw;border-bottom:1px solid #dfd4c8}.seo-editorial-nav a,.seo-editorial-footer a{text-decoration:none;color:inherit}.seo-editorial-nav .wordmark,.seo-editorial-footer .wordmark{font:27px Georgia,serif;letter-spacing:-2px}.seo-editorial-nav .wordmark span,.seo-editorial-footer .wordmark span{color:#ad785e;font-style:italic}.seo-editorial-nav>a:last-child,.seo-editorial-footer>a:last-child{font-size:9px;letter-spacing:2px}.seo-editorial-hero{display:grid;grid-template-columns:1.1fr .9fr;min-height:590px;background:#eee5da}.seo-editorial-hero-copy{display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:65px 8vw}.seo-editorial-page .eyebrow{color:#ad785e;font-size:9px;letter-spacing:2px}.seo-editorial-kicker{margin:38px 0 12px;color:#92745f;font-size:9px;letter-spacing:2px}.seo-editorial-hero h1{font:400 clamp(46px,6vw,78px)/.99 Georgia,serif;letter-spacing:-3px;margin:0 0 20px}.seo-editorial-intro{max-width:480px;color:#75685e;font-size:13px;line-height:1.9}.seo-editorial-cta{padding:15px 18px;background:#39281f;color:#fff!important;text-decoration:none;font-size:9px;letter-spacing:1px}.seo-editorial-index{margin-top:55px;color:#9c8979;font-size:8px;letter-spacing:2px}.seo-editorial-hero-visual{position:relative;min-height:590px;background:#d9c9b8;display:grid;place-items:center;overflow:hidden}.seo-editorial-art{position:absolute;inset:8%;display:flex;align-items:center;justify-content:center;flex-direction:column;background:#b18b70;color:#f7efe5}.seo-editorial-art span{font:clamp(65px,10vw,130px) Georgia,serif;letter-spacing:-8px}.seo-editorial-art i{margin-top:-20px;color:#f0d5bf;font:48px Georgia,serif}.seo-editorial-art b{position:absolute;right:20px;bottom:18px;font-size:10px}.seo-editorial-hero-visual>p{position:absolute;bottom:20px;left:28px;color:#fff;font:21px Georgia,serif}.seo-editorial-story{display:grid;grid-template-columns:.55fr 1.45fr;gap:8vw;max-width:1240px;margin:auto;padding:100px 38px}.seo-editorial-story-aside{display:flex;flex-direction:column;justify-content:space-between;min-height:260px}.seo-editorial-story-aside>span{color:#e4d8ca;font:60px/.9 Georgia,serif}.seo-editorial-sections{border-top:1px solid #d8cbbd}.seo-editorial-section{display:grid;grid-template-columns:52px 1fr;gap:20px;padding:28px 0;border-bottom:1px solid #dfd4c8}.seo-editorial-number{color:#ad785e;font-size:10px}.seo-editorial-section h2{font:400 32px/1.1 Georgia,serif;margin:0 0 12px}.seo-editorial-section p{color:#74685e;font-size:13px;line-height:1.9}.seo-editorial-discover{display:grid;grid-template-columns:.8fr 1.2fr;gap:60px;padding:70px 8vw;background:#eee5da}.seo-editorial-discover h2{font:400 clamp(38px,5vw,62px)/1.03 Georgia,serif}.seo-editorial-discover h2 em{color:#ad785e}.seo-editorial-discover-links{border-top:1px solid #cbb9a8}.seo-editorial-discover-links a{display:grid;grid-template-columns:40px 1fr 20px;gap:14px;padding:18px 0;border-bottom:1px solid #cbb9a8;color:#39281f;text-decoration:none;font:20px Georgia,serif}.seo-editorial-discover-links a span{color:#a58b76;font-size:10px}.seo-editorial-footer{display:flex;align-items:center;justify-content:space-between;gap:30px;padding:35px 7vw;background:#39281f;color:#f8f0e7}.seo-editorial-footer p{max-width:390px;color:#d5c3b2;font-size:10px;line-height:1.7}@media(max-width:700px){.seo-editorial-nav{height:66px;padding:0 20px}.seo-editorial-hero{grid-template-columns:1fr}.seo-editorial-hero-copy{min-height:440px;padding:50px 24px 30px}.seo-editorial-hero h1{font-size:48px}.seo-editorial-hero-visual{min-height:420px}.seo-editorial-story{grid-template-columns:1fr;gap:25px;padding:60px 23px}.seo-editorial-story-aside{min-height:0;flex-direction:row;align-items:center}.seo-editorial-section{grid-template-columns:30px 1fr;gap:10px}.seo-editorial-section h2{font-size:26px}.seo-editorial-discover{grid-template-columns:1fr;gap:25px;padding:55px 24px}.seo-editorial-footer{align-items:flex-start;flex-direction:column;padding:30px 24px}}</style>',
    '<script type="application/ld+json">' + jsonLd(structuredData) + '</script>',
  ].filter(Boolean).join('\n    ')
}

function injectPage(baseHtml, title, description, canonical, structuredData, fallback, image) {
  return baseHtml
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta name="description"[^>]*>/, '')
    .replace(/<link rel="canonical"[^>]*>/, '')
    .replace(/<meta property="og:(type|site_name|title|description|url|image)"[^>]*>/g, '')
    .replace(/<meta name="twitter:card"[^>]*>/g, '')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '')
    .replace('</head>', meta(title, description, canonical, structuredData, image) + '\n  </head>')
    .replace('<div id="root"></div>', '<div id="root">' + fallback + '</div>')
}

async function fetchPublic(table, query) {
  const response = await fetch(supabaseUrl + '/rest/v1/' + table + '?' + query, {
    headers: { apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey },
  })
  if (!response.ok) {
    throw new Error('Could not read ' + table + ' for SEO generation (' + response.status + '): ' + await response.text())
  }
  return response.json()
}

function publicImageUrl(path) {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  return supabaseUrl + '/storage/v1/object/public/product-images/' + String(path).split('/').map(encodeURIComponent).join('/')
}

async function main() {
  const distIndexPath = join(process.cwd(), 'dist', 'index.html')
  const baseHtml = await readFile(distIndexPath, 'utf8')
  const editorialContent = JSON.parse(await readFile(join(process.cwd(), 'content', 'seo-pages.json'), 'utf8'))
  const sitemapUrls = [siteUrl + '/']

  for (const page of editorialContent.pages) {
    const canonical = siteUrl + '/' + page.path.replace(/^\/+|\/+$/g, '') + '/'
    const structuredData = {
      '@context': 'https://schema.org',
      '@type': page.kind === 'article' ? 'Article' : 'WebPage',
      headline: page.h1,
      name: page.title,
      description: page.description,
      inLanguage: 'es',
      mainEntityOfPage: canonical,
      author: { '@type': 'Organization', name: 'LIBRE femme', url: siteUrl + '/' },
      publisher: { '@type': 'Organization', name: 'LIBRE femme', url: siteUrl + '/' },
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: siteUrl + '/' },
          { '@type': 'ListItem', position: 2, name: page.h1, item: canonical },
        ],
      },
    }
    const sections = page.sections.map((section, index) =>
      '<article class="seo-editorial-section"><span class="seo-editorial-number">0' + (index + 1) + '</span><div><h2>' + escapeHtml(section.heading) + '</h2>' +
      section.paragraphs.map((paragraph) => '<p>' + escapeHtml(paragraph) + '</p>').join('') + '</div></article>'
    ).join('')
    const links = page.links.map((link, index) => '<a href="' + escapeHtml(link.href) + '"><span>0' + (index + 1) + '</span>' + escapeHtml(link.label) + '<b>↗</b></a>').join('')
    const fallback = '<div class="seo-editorial-page" lang="es"><nav class="seo-editorial-nav"><a class="wordmark" href="/">LIBRE <span>femme</span></a><a href="/#coleccion">LA COLECCIÓN ↗</a></nav><main>' +
      '<section class="seo-editorial-hero"><div class="seo-editorial-hero-copy"><p class="eyebrow">LIBRE FEMME · INSPIRACIÓN Y ESTILO</p><p class="seo-editorial-kicker">UNA MIRADA A TU MANERA DE VESTIR</p><h1>' + escapeHtml(page.h1) + '</h1><p class="seo-editorial-intro">' + escapeHtml(page.intro) + '</p><a class="seo-editorial-cta" href="' + escapeHtml(page.links[0]?.href || '/#coleccion') + '">' + escapeHtml(page.links[0]?.label || 'Explorar colección') + ' ↗</a><span class="seo-editorial-index">ESTILO LIBRE — 01 / 04</span></div><div class="seo-editorial-hero-visual"><div class="seo-editorial-art"><span>LIBRE</span><i>femme</i><b>01</b></div><p>Piezas elegidas para acompañarte</p></div></section>' +
      '<section class="seo-editorial-story"><aside class="seo-editorial-story-aside"><p class="eyebrow">EL ESTILO ESTÁ EN LOS DETALLES</p><span>LIBRE<br/>FEMME</span></aside><div class="seo-editorial-sections">' + sections + '</div></section>' +
      '<section class="seo-editorial-discover"><div><p class="eyebrow">ENCUENTRA TU PRÓXIMA PIEZA</p><h2>Elige lo que <em>habla de ti.</em></h2></div><div class="seo-editorial-discover-links">' + links + '</div></section></main>' +
      '<footer class="seo-editorial-footer"><a class="wordmark" href="/">LIBRE <span>femme</span></a><p>Prendas que hablan de ti. Texturas, formas y detalles elegidos para acompañarte a tu manera.</p><a href="/#coleccion">DESCUBRIR LA COLECCIÓN ↗</a></footer></div>'
    const html = injectPage(baseHtml, page.title, page.description, canonical, structuredData, fallback)
    const outputPath = join(process.cwd(), 'dist', page.path, 'index.html')
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, html)
    sitemapUrls.push(canonical)
  }

  if (!supabaseUrl || !supabaseKey) {
    const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      sitemapUrls.map((url) => '  <url><loc>' + url + '</loc></url>').join('\n') + '\n</urlset>\n'
    await writeFile(join(process.cwd(), 'dist', 'sitemap.xml'), sitemap)
    console.warn('Generated editorial SEO pages only. VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required for dynamic catalog pages.')
    return
  }

  const [products, variants, images] = await Promise.all([
    fetchPublic('public_catalog_products', 'select=id,name,slug,description,category&order=name.asc'),
    fetchPublic('public_catalog_variants', 'select=product_id,sale_price,quantity_on_hand'),
    fetchPublic('public_catalog_images', 'select=product_id,storage_path,alt_text,position&order=position.asc'),
  ])

  const productsWithData = products.map((product) => {
    const productVariants = variants.filter((variant) => variant.product_id === product.id)
    const productImages = images.filter((image) => image.product_id === product.id)
      .map((image) => ({ url: publicImageUrl(image.storage_path), alt: image.alt_text || product.name }))
      .filter((image) => image.url)
    return { ...product, variants: productVariants, images: productImages }
  }).filter((product) => product.slug && product.variants.length > 0)

  const categories = new Map()
  for (const product of productsWithData) {
    const name = String(product.category || 'Otros').trim()
    const slug = slugify(name)
    if (!slug) continue
    if (!categories.has(slug)) categories.set(slug, { name, products: [] })
    categories.get(slug).products.push(product)
  }

  for (const [slug, category] of categories) {
    const canonical = siteUrl + '/categoria/' + slug + '/'
    sitemapUrls.push(canonical)
    const title = category.name + ' para mujer en Cuba | LIBRE femme'
    const description = 'Descubre la selección de ' + category.name.toLocaleLowerCase('es') + ' para mujer en Cuba. Explora prendas, colores y estilos de LIBRE femme.'
    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title,
      description,
      url: canonical,
      inLanguage: 'es',
      isPartOf: { '@type': 'WebSite', name: 'LIBRE femme', url: siteUrl + '/' },
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: siteUrl + '/' },
          { '@type': 'ListItem', position: 2, name: category.name, item: canonical },
        ],
      },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: category.products.length,
        itemListElement: category.products.map((product, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: product.name,
          url: siteUrl + '/producto/' + slugify(product.slug) + '/',
        })),
      },
    }
    const productMarkup = category.products.map((product) => {
      const productUrl = siteUrl + '/producto/' + slugify(product.slug) + '/'
      const imageMarkup = product.images[0] ? '<img src="' + escapeHtml(product.images[0].url) + '" alt="' + escapeHtml(product.images[0].alt) + '" loading="lazy" />' : ''
      return '<article>' + imageMarkup + '<h2><a href="' + productUrl + '">' + escapeHtml(product.name) + '</a></h2>' +
        (product.description ? '<p>' + escapeHtml(product.description) + '</p>' : '') + '</article>'
    }).join('')
    const fallback = '<main lang="es"><nav aria-label="Ruta de navegación"><a href="/">LIBRE femme</a> / ' + escapeHtml(category.name) + '</nav>' +
      '<header><p>LIBRE FEMME · MODA FEMENINA EN CUBA</p><h1>' + escapeHtml(category.name) + ' para mujer</h1>' +
      '<p>Descubre nuestra selección de ' + escapeHtml(category.name.toLocaleLowerCase('es')) + ' en LIBRE femme. Piezas elegidas para expresar tu estilo a tu manera.</p>' +
      '<p><a href="/">Explorar toda la colección</a></p></header><section aria-label="Productos de ' + escapeHtml(category.name) + '">' +
      '<h2>La selección LIBRE</h2>' + (productMarkup || '<p>Estamos preparando nuevas piezas para esta categoría.</p>') + '</section>' +
      '<section aria-label="Preguntas frecuentes sobre ' + escapeHtml(category.name) + '"><h2>Preguntas frecuentes</h2>' +
      '<h3>¿Cómo consulto la disponibilidad?</h3><p>Añade la pieza a tu bolsa y envía tu selección por WhatsApp. Confirmamos contigo la disponibilidad y los detalles de entrega antes de cerrar el pedido.</p>' +
      '<h3>¿Puedo elegir talla o color?</h3><p>Cuando una prenda tiene variantes publicadas, puedes seleccionar las opciones disponibles en su ficha. Los detalles se confirman por WhatsApp.</p></section></main>'
    const html = injectPage(baseHtml, title, description, canonical, structuredData, fallback, category.products[0]?.images[0]?.url)
    const outputPath = join(process.cwd(), 'dist', 'categoria', slug, 'index.html')
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, html)
  }

  for (const product of productsWithData) {
    const slug = slugify(product.slug)
    if (!slug) continue
    const canonical = siteUrl + '/producto/' + slug + '/'
    const categorySlug = slugify(product.category || 'Otros')
    const prices = product.variants.map((variant) => Number(variant.sale_price)).filter((price) => Number.isFinite(price) && price > 0)
    const lowPrice = prices.length ? Math.min(...prices) : null
    const highPrice = prices.length ? Math.max(...prices) : lowPrice
    const available = product.variants.some((variant) => Number(variant.quantity_on_hand || 0) > 0)
    const imageUrls = product.images.map((image) => image.url)
    const title = product.name + ' | LIBRE femme · ' + product.category + ' en Cuba'
    const description = (product.description || product.name + ' de la colección LIBRE femme.') + ' Consulta tallas, colores y disponibilidad por WhatsApp.'
    const offers = lowPrice === highPrice && lowPrice !== null ? {
      '@type': 'Offer',
      price: lowPrice.toFixed(2),
      priceCurrency: 'USD',
      availability: available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      url: canonical,
      seller: { '@type': 'Organization', name: 'LIBRE femme', url: siteUrl + '/' },
    } : lowPrice !== null ? {
      '@type': 'AggregateOffer',
      lowPrice: lowPrice.toFixed(2),
      highPrice: highPrice.toFixed(2),
      priceCurrency: 'USD',
      offerCount: product.variants.length,
      availability: available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: canonical,
    } : undefined
    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      description: product.description || product.name,
      sku: product.slug,
      category: product.category,
      url: canonical,
      image: imageUrls,
      brand: { '@type': 'Brand', name: 'LIBRE femme' },
      ...(offers ? { offers } : {}),
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: siteUrl + '/' },
          { '@type': 'ListItem', position: 2, name: product.category, item: siteUrl + '/categoria/' + categorySlug + '/' },
          { '@type': 'ListItem', position: 3, name: product.name, item: canonical },
        ],
      },
    }
    const imageMarkup = product.images.map((image) => '<img src="' + escapeHtml(image.url) + '" alt="' + escapeHtml(image.alt) + '" loading="lazy" />').join('')
    const fallback = '<main lang="es"><nav aria-label="Ruta de navegación"><a href="/">LIBRE femme</a> / <a href="/categoria/' + categorySlug + '/">' + escapeHtml(product.category) + '</a> / ' + escapeHtml(product.name) + '</nav>' +
      '<article><p>LIBRE FEMME · ' + escapeHtml(product.category) + '</p><h1>' + escapeHtml(product.name) + '</h1>' + imageMarkup +
      '<p>' + escapeHtml(product.description || 'Una pieza elegida para ti.') + '</p>' +
      (lowPrice !== null ? '<p>Desde ' + lowPrice.toFixed(2) + ' USD</p>' : '') +
      '<p>Consulta tallas, colores y disponibilidad por WhatsApp.</p><a href="https://wa.me/5358352149">Consultar por WhatsApp</a></article></main>'
    const html = injectPage(baseHtml, title, description.slice(0, 155), canonical, structuredData, fallback, imageUrls[0])
    const outputPath = join(process.cwd(), 'dist', 'producto', slug, 'index.html')
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, html)
    sitemapUrls.push(canonical)
  }

  const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    sitemapUrls.map((url) => '  <url><loc>' + url + '</loc></url>').join('\n') + '\n</urlset>\n'
  await writeFile(join(process.cwd(), 'dist', 'sitemap.xml'), sitemap)
  console.log('Generated ' + categories.size + ' category pages, ' + productsWithData.length + ' product pages and ' + sitemapUrls.length + ' sitemap URLs.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
