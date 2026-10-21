const features = [
  {
    number: '01',
    title: 'Tienda',
    description: 'Una experiencia sencilla para descubrir cada pieza y preparar pedidos por WhatsApp.',
  },
  {
    number: '02',
    title: 'Inventario',
    description: 'Productos, tallas, colores, entradas y existencias en un solo lugar.',
  },
  {
    number: '03',
    title: 'Control financiero',
    description: 'Costes reales, ventas, cobros y una visión clara del movimiento del negocio.',
  },
]

export default function App() {
  return (
    <main className="page-shell">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="LIBRE femme, inicio">
          <span className="wordmark-main">Libre</span>
          <span className="wordmark-sub">FEMME</span>
        </a>
        <span className="header-note">Moda · Accesorios · Esencia propia</span>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span /> EL UNIVERSO LIBRE FEMME</p>
          <h1 id="hero-title">Elegir lo que<br /><em>habla de ti.</em></h1>
          <p className="hero-description">
            Una selección cuidada de moda y accesorios, con una experiencia de compra
            pensada para sentirse tan personal como tu estilo.
          </p>
          <div className="hero-status">
            <span className="status-dot" />
            <span>Estamos preparando algo especial</span>
          </div>
        </div>
        <div className="hero-art" aria-label="Composición gráfica de marca">
          <div className="art-halo" />
          <div className="art-card">
            <span className="art-overline">UNA FORMA DE SER</span>
            <span className="art-script">Libre</span>
            <span className="art-divider" />
            <span className="art-label">FEMME · EST. WITH INTENTION</span>
          </div>
          <span className="art-caption">TU ESTILO, TU HISTORIA.</span>
          <span className="art-index">LF / 001</span>
        </div>
      </section>

      <section className="pillars" aria-label="Áreas de la plataforma">
        <div className="section-heading">
          <p className="eyebrow">UNA BASE, TRES EXPERIENCIAS</p>
          <p className="section-intro">Diseñada para cuidar cada parte del negocio.</p>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature" key={feature.number}>
              <span className="feature-number">{feature.number}</span>
              <h2>{feature.title}</h2>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="site-footer">
        <span>LIBRE FEMME</span>
        <span>Una marca en construcción, con intención.</span>
        <span>© 2026</span>
      </footer>
    </main>
  )
}
