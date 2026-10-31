import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const siteUrl = 'https://libre-femme.com'
const supabaseUrl = process.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

function slugify(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

function meta(title, description, canonical, structuredData) {
  return `
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
    <link rel="canonical" href="${canonical}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="LIBRE femme" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${canonical}" />
    <meta name="twitter:card" content="summary" />
    <script type="application/ld+json">${JSON.stringify(structuredData).replace(/</g, '\\u003c')}</script>`
}

async function main() {
  const distIndexPath = join(process.cwd(), 'dist', 'index.html')
  const baseHtml = await readFile(distIndexPath, 'utf8')
  if (!supabaseUrl || !supabaseKey) {
    console.warn('Skipping category SEO generation: Supabase build variables are not available. The checked-in homepage sitemap remains in place.')
    return
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/public_catalog_products?select=id,name,slug,description,category&order=name.asc`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
  })
  if (!response.ok) {
    throw new Error(`Could not read public_catalog_products for SEO generation (${response.status}): ${await response.text()}`)
  }
  const products = await response.json()
  const categories = new Map()
  for (const product of products) {
    const name = String(product.category || 'Otros').trim()
    const slug = slugify(name)
    if (!slug) continue
    if (!categories.has(slug)) categories.set(slug, { name, products: [] })
    categories.get(slug).products.push(product)
  }

  const sitemapUrls = [`${siteUrl}/`]
  for (const [slug, category] of categories) {
    const canonical = `${siteUrl}/categoria/${slug}/`
    sitemapUrls.push(canonical)
    const title = `${category.name} para mujer en Cuba | LIBRE femme`
    const description = `Descubre nuestra selección de ${category.name.toLocaleLowerCase('es')} para mujer en Cuba. Explora la colección de LIBRE femme y encuentra piezas a tu manera.`
    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title,
      description,
      url: canonical,
      isPartOf: { '@type': 'WebSite', name: 'LIBRE femme', url: `${siteUrl}/` },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: category.products.length,
        itemListElement: category.products.map((product, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: product.name,
          description: product.description || undefined,
        })),
      },
    }
    const productMarkup = category.products.map((product) => `
      <article>
        <h2>${escapeHtml(product.name)}</h2>
        ${product.description ? `<p>${escapeHtml(product.description)}</p>` : ''}
      </article>`).join('')
    const fallback = `
      <main lang="es">
        <nav aria-label="Ruta de navegación"><a href="/">LIBRE femme</a> / ${escapeHtml(category.name)}</nav>
        <header>
          <p>LIBRE FEMME · MODA FEMENINA EN CUBA</p>
          <h1>${escapeHtml(category.name)} para mujer</h1>
          <p>Descubre nuestra selección de ${escapeHtml(category.name.toLocaleLowerCase('es'))} en LIBRE femme. Piezas elegidas para expresar tu estilo a tu manera.</p>
          <p><a href="/">Explorar toda la colección</a></p>
        </header>
        <section aria-label="Productos de ${escapeHtml(category.name)}">
          <h2>La selección LIBRE</h2>
          ${productMarkup || '<p>Estamos preparando nuevas piezas para esta categoría.</p>'}
        </section>
      </main>`
    const pageHtml = baseHtml
      .replace(/<title>[\s\S]*?<\/title>/, '')
      .replace(/<meta name="description"[^>]*>/, '')
      .replace(/<link rel="canonical"[^>]*>/, '')
      .replace(/<meta property="og:(title|description|url)"[^>]*>/g, '')
      .replace('</head>', meta(title, description, canonical, structuredData) + '\n  </head>')
      .replace('<div id="root"></div>', `<div id="root">${fallback}</div>`)
    const outputPath = join(process.cwd(), 'dist', 'categoria', slug, 'index.html')
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, pageHtml)
  }

  const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + sitemapUrls.map((url) => '  <url><loc>' + url + '</loc></url>').join('\n') + '\n</urlset>\n'
  await writeFile(join(process.cwd(), 'dist', 'sitemap.xml'), sitemap)
  console.log(`Generated ${categories.size} SEO category pages and sitemap with ${sitemapUrls.length} URLs.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
