import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Calendar, Check, Clock, Instagram, Menu, Minus, Music2, Plus, Scissors, Search, ShoppingBag, Sparkles, Trash2, X } from 'lucide-react'
import { createAppointment, createOrder, type CartLine } from '@/lib/store'
import { ShareButton } from './ShareButton'

type Product = { id: number; kind: string; name: string; category: string; description: string; price: number; stock: number; durationMinutes: number; image: string; featured: boolean }
type Props = { data: { products: Product[]; content: Record<string, string> } }

const money = (value: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(value / 100)

export function Storefront({ data }: Props) {
  const { products, content: copy } = data
  const services = useMemo(() => products.filter((p) => p.kind === 'servicio'), [products])
  const goods = useMemo(() => products.filter((p) => p.kind === 'producto'), [products])

  const [menuOpen, setMenuOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [cart, setCart] = useState<CartLine[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Todos')
  const [confirmation, setConfirmation] = useState<{ orderNumber: string; total: number } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [bookingService, setBookingService] = useState<Product | null>(null)
  const [bookingConfirmation, setBookingConfirmation] = useState<{ appointmentNumber: string } | null>(null)
  const [bookingSubmitting, setBookingSubmitting] = useState(false)
  const [bookingError, setBookingError] = useState('')

  const categories = ['Todos', ...Array.from(new Set(goods.map((product) => product.category)))]
  const visibleProducts = useMemo(() => goods.filter((product) => (category === 'Todos' || product.category === category) && `${product.name} ${product.description}`.toLowerCase().includes(query.toLowerCase())), [goods, category, query])
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0)
  const subtotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0)

  const addToCart = (product: Product) => {
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id)
      if (existing) return current.map((line) => line.productId === product.id ? { ...line, quantity: Math.min(line.quantity + 1, product.stock) } : line)
      return [...current, { productId: product.id, name: product.name, price: product.price, quantity: 1, image: product.image }]
    })
    setCartOpen(true)
  }

  const changeQuantity = (id: number, delta: number) => setCart((current) => current.flatMap((line) => {
    if (line.productId !== id) return [line]
    const product = goods.find((item) => item.id === id)
    const quantity = Math.min(line.quantity + delta, product?.stock ?? line.quantity)
    return quantity > 0 ? [{ ...line, quantity }] : []
  }))

  async function submitOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      const result = await createOrder({ data: { name: String(form.get('name')), phone: String(form.get('phone')), email: String(form.get('email')), address: String(form.get('address')), items: cart } })
      setConfirmation(result)
      setCart([])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos enviar el pedido.')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!bookingService) return
    setBookingSubmitting(true)
    setBookingError('')
    const form = new FormData(event.currentTarget)
    try {
      const result = await createAppointment({ data: { name: String(form.get('name')), phone: String(form.get('phone')), email: String(form.get('email')), serviceId: bookingService.id, date: String(form.get('date')), time: String(form.get('time')), notes: String(form.get('notes') || '') } })
      setBookingConfirmation(result)
    } catch (caught) {
      setBookingError(caught instanceof Error ? caught.message : 'No pudimos agendar la cita.')
    } finally {
      setBookingSubmitting(false)
    }
  }

  const todayIso = new Date().toISOString().slice(0, 10)

  return <div className="site-shell">
    <header className="topbar">
      <button className="icon-button" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu /></button>
      <a className="wordmark" href="#inicio"><span>E</span>{copy.brandName}</a>
      <nav className="desktop-nav"><a href="#servicios">{copy.navServices}</a><a href="#catalogo">{copy.navCatalog}</a><a href="#beneficios">{copy.navBenefits}</a><a href="#contacto">{copy.navContact}</a></nav>
      <div className="topbar-actions">
        <ShareButton title={copy.brandName} />
        <button className="cart-button" onClick={() => setCartOpen(true)}><ShoppingBag size={19} /><span>Bolsa</span><b>{cartCount}</b></button>
      </div>
    </header>

    <div className={`overlay ${menuOpen ? 'visible' : ''}`} onClick={() => setMenuOpen(false)} />
    <aside className={`side-menu ${menuOpen ? 'open' : ''}`}>
      <div className="drawer-head"><span className="mini-mark">E</span><button className="icon-button" onClick={() => setMenuOpen(false)}><X /></button></div>
      <p className="drawer-kicker">Explora ELA</p>
      <a href="#servicios" onClick={() => setMenuOpen(false)}>Servicios <ArrowRight /></a>
      <a href="#catalogo" onClick={() => setMenuOpen(false)}>Productos <ArrowRight /></a>
      <a href="#beneficios" onClick={() => setMenuOpen(false)}>Beneficios <ArrowRight /></a>
      <a href="#historia" onClick={() => setMenuOpen(false)}>Nuestra historia <ArrowRight /></a>
      <a href="#contacto" onClick={() => setMenuOpen(false)}>Contacto <ArrowRight /></a>
      <Link to="/politicas" onClick={() => setMenuOpen(false)}>Políticas <ArrowRight /></Link>
      <div className="drawer-admin"><span>Área privada</span><Link to="/admin">Entrar al panel administrativo</Link></div>
    </aside>

    <main>
      <section className="ela-hero" id="inicio">
        <p className="ela-eyebrow reveal"><Sparkles size={14} />{copy.eyebrow}</p>
        <h1 className="reveal delay-1">{copy.heroTitle}</h1>
        <p className="ela-hero-lede reveal delay-1">{copy.heroDescription}</p>
        <a className="primary-button reveal delay-1" href="#servicios">{copy.heroCta}<ArrowRight /></a>
        <div className="ela-hero-banner reveal delay-1"><img src={copy.heroImage} alt="ELA — belleza y cuidado" /></div>
      </section>

      <section className="ela-manifesto" id="beneficios">
        <div className="ela-section-heading"><span>Nuestro compromiso</span><h2>{copy.benefitsTitle}</h2></div>
        <div className="ela-manifesto-grid">{[1, 2, 3].map((number) => <article key={number}><span>0{number}</span><h3>{copy[`benefit${number}Title`]}</h3><p>{copy[`benefit${number}Text`]}</p></article>)}</div>
      </section>

      <section className="catalog services-section" id="servicios">
        <div className="ela-section-heading"><span>Servicios de belleza</span><h2>{copy.servicesTitle}</h2><p>{copy.servicesDescription}</p></div>
        <div className="service-grid">
          {services.map((service) => <article className="service-card" key={service.id}>
            <div className="service-image"><img src={service.image} alt={service.name} /></div>
            <div className="service-info">
              <p className="product-category">{service.category}</p>
              <h3>{service.name}</h3>
              <p>{service.description}</p>
              <div className="service-meta"><span><Clock size={14} />{service.durationMinutes} min</span></div>
              <div className="product-action"><strong>{money(service.price)}</strong><button onClick={() => { setBookingService(service); setBookingConfirmation(null); setBookingError('') }}>Agendar cita<Calendar size={16} /></button></div>
            </div>
          </article>)}
          {!services.length && <div className="empty-state"><Scissors /><h3>Muy pronto nuevos servicios</h3><p>Vuelve pronto para agendar tu cita.</p></div>}
        </div>
      </section>

      <section className="catalog" id="catalogo">
        <div className="ela-section-heading"><span>Productos artesanales</span><h2>{copy.catalogTitle}</h2><p>{copy.catalogDescription}</p></div>
        <div className="catalog-layout">
          <aside className="filters"><label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto..." /></label><div className="category-list">{categories.map((item) => <button className={category === item ? 'active' : ''} onClick={() => setCategory(item)} key={item}>{item}<span>{item === 'Todos' ? goods.length : goods.filter((product) => product.category === item).length}</span></button>)}</div></aside>
          <div className="product-list">{visibleProducts.map((product, index) => <article className="product-row" key={product.id}>
            <div className="product-number">{String(index + 1).padStart(2, '0')}</div>
            <div className="product-image"><img src={product.image} alt={product.name} />{product.stock === 0 && <span>Agotado</span>}</div>
            <div className="product-info"><p className="product-category">{product.category}</p><h3>{product.name}</h3><p>{product.description}</p><div className="stock-line"><span className={product.stock ? '' : 'empty'}>{product.stock ? `${product.stock} disponibles` : 'Sin existencias'}</span></div></div>
            <div className="product-action"><strong>{money(product.price)}</strong><button disabled={product.stock === 0} onClick={() => addToCart(product)}>{product.stock ? 'Agregar' : 'Agotado'}<Plus /></button></div>
          </article>)}{visibleProducts.length === 0 && <div className="empty-state"><Search /><h3>No encontramos ese producto</h3><p>Prueba otra palabra o categoría.</p></div>}</div>
        </div>
      </section>

      <section className="ela-story" id="historia">
        <span className="ela-eyebrow">Nuestra historia</span>
        <h2>{copy.storyTitle}</h2>
        <p>{copy.storyText}</p>
        <div className="ela-story-signature">ELA</div>
      </section>
    </main>

    <footer id="contacto">
      <div className="footer-brand"><div className="footer-mark">E</div><h2>{copy.brandName}</h2><p>{copy.footerText}</p></div>
      <div><span>Conversemos</span><a className="whatsapp" href={`https://wa.me/${copy.whatsapp}`} target="_blank" rel="noreferrer">Pedidos y citas <ArrowRight /></a></div>
      <div><span>Horario</span><p>{copy.schedule}</p><p className="footer-location">{copy.location}</p></div>
      <div><span>Síguenos</span><a className="social-line" href={`https://instagram.com/${(copy.instagram || '').replace('@', '')}`} target="_blank" rel="noreferrer"><Instagram size={16} />{copy.instagram}</a><a className="social-line" href={`https://tiktok.com/${(copy.tiktok || '').replace('@', '@')}`} target="_blank" rel="noreferrer"><Music2 size={16} />{copy.tiktok}</a></div>
      <div className="footer-bottom">
        <a className="gadr-credit" href="https://gadrnet.com" target="_blank" rel="noopener noreferrer">
          <span className="gadr-credit-text">{copy.developerCredit} · GADR Net | gadrnet.com</span>
          <span className="gadr-mark" aria-hidden="true">
            <span className="gadr-mark-icon">&lt;/&gt;<i /></span>
            <span className="gadr-mark-word">GADR<small>Net</small></span>
          </span>
        </a>
        <p>© {new Date().getFullYear()} {copy.brandName} · <Link to="/politicas">Políticas</Link></p>
      </div>
    </footer>

    <div className={`overlay ${cartOpen ? 'visible' : ''}`} onClick={() => setCartOpen(false)} />
    <aside className={`cart-drawer ${cartOpen ? 'open' : ''}`}><div className="drawer-head"><div><span className="drawer-kicker">BOLSA · {cartCount} PIEZAS</span><h2>{copy.cartTitle}</h2></div><button className="icon-button" onClick={() => setCartOpen(false)}><X /></button></div>
      <div className="cart-lines">{cart.map((line) => <div className="cart-line" key={line.productId}><img src={line.image} alt="" /><div><h4>{line.name}</h4><p>{money(line.price)}</p><div className="quantity"><button onClick={() => changeQuantity(line.productId, -1)}><Minus /></button><span>{line.quantity}</span><button onClick={() => changeQuantity(line.productId, 1)}><Plus /></button></div></div><button className="remove" onClick={() => setCart((current) => current.filter((item) => item.productId !== line.productId))}><Trash2 /></button></div>)}{!cart.length && <div className="empty-cart"><ShoppingBag /><h3>Tu bolsa está esperando</h3><p>Elige algún producto artesanal.</p></div>}</div>
      <div className="cart-summary"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><p>La entrega se coordina después de confirmar el pedido.</p><button className="primary-button full" disabled={!cart.length} onClick={() => { setCartOpen(false); setCheckoutOpen(true) }}>Continuar al checkout <ArrowRight /></button></div>
    </aside>

    {checkoutOpen && <div className="modal-wrap"><div className="modal-card"><button className="modal-close icon-button" onClick={() => { setCheckoutOpen(false); setConfirmation(null) }}><X /></button>{confirmation ? <div className="confirmation"><div className="success-icon"><Check /></div><span>PEDIDO RECIBIDO</span><h2>Gracias por confiar en ELA.</h2><p>Tu número de pedido es</p><strong>{confirmation.orderNumber}</strong><p>Total: {money(confirmation.total)}. Te contactaremos por WhatsApp para coordinar pago y entrega.</p><button className="primary-button" onClick={() => { setCheckoutOpen(false); setConfirmation(null) }}>Volver a la tienda</button></div> : <div className="checkout-grid"><div><span className="drawer-kicker">ÚLTIMO PASO</span><h2>{copy.checkoutTitle}</h2><p>Déjanos tus datos para coordinar pago y entrega.</p><form id="checkout-form" onSubmit={submitOrder}><input required name="name" placeholder="Nombre completo" /><input required name="phone" placeholder="Teléfono" /><input name="email" type="email" placeholder="Correo electrónico (opcional)" /><textarea required name="address" placeholder="Dirección de entrega" rows={3} />{error && <p className="form-error">{error}</p>}</form></div><div className="order-review"><h3>Resumen</h3>{cart.map((line) => <div key={line.productId}><span>{line.quantity} × {line.name}</span><strong>{money(line.quantity * line.price)}</strong></div>)}<div className="checkout-total"><span>Total</span><strong>{money(subtotal)}</strong></div><button form="checkout-form" disabled={submitting} className="primary-button full">{submitting ? 'Enviando...' : 'Enviar pedido'}<ArrowRight /></button></div></div>}</div></div>}

    {bookingService && <div className="modal-wrap"><div className="modal-card"><button className="modal-close icon-button" onClick={() => { setBookingService(null); setBookingConfirmation(null) }}><X /></button>{bookingConfirmation ? <div className="confirmation"><div className="success-icon"><Check /></div><span>CITA AGENDADA</span><h2>Te esperamos en ELA.</h2><p>Tu número de cita es</p><strong>{bookingConfirmation.appointmentNumber}</strong><p>Te contactaremos por WhatsApp para confirmar el horario.</p><button className="primary-button" onClick={() => { setBookingService(null); setBookingConfirmation(null) }}>Volver a la tienda</button></div> : <div className="checkout-grid"><div><span className="drawer-kicker">{copy.appointmentTitle}</span><h2>{bookingService.name}</h2><p>{bookingService.description}</p><form id="booking-form" onSubmit={submitBooking}><input required name="name" placeholder="Nombre completo" /><input required name="phone" placeholder="Teléfono" /><input name="email" type="email" placeholder="Correo electrónico (opcional)" /><div className="date-time-row"><input required name="date" type="date" min={todayIso} /><input required name="time" type="time" /></div><textarea name="notes" placeholder="Notas (opcional)" rows={2} />{bookingError && <p className="form-error">{bookingError}</p>}</form></div><div className="order-review"><h3>Resumen</h3><div><span>{bookingService.name}</span><strong>{money(bookingService.price)}</strong></div><div className="checkout-total"><span>Duración estimada</span><strong>{bookingService.durationMinutes} min</strong></div><button form="booking-form" disabled={bookingSubmitting} className="primary-button full">{bookingSubmitting ? 'Agendando...' : 'Confirmar cita'}<ArrowRight /></button></div></div>}</div></div>}
  </div>
}
