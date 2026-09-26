import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Calendar, Check, Clock, Instagram, Menu, MessageCircle, Minus, Music2, Plus, Scissors, Search, ShoppingBag, Sparkles, Trash2, X } from 'lucide-react'
import { createAppointment, createOrder, type CartLine } from '@/lib/store'
import { ShareButton } from './ShareButton'
import { LeafBloom, LeafBranch, LeafSpray } from './LeafBranch'

/** Mueve suavemente las 4 matas decorativas de las esquinas con el
 * scroll (un "parallax" sutil), para que acompañen al usuario al subir
 * o bajar la página en vez de quedar estáticas. Cada una se mueve a su
 * propio ritmo y con signo alternado, con un tope para que nunca se
 * alejen demasiado de su rincón. Se desactiva por completo si el
 * usuario prefiere menos movimiento. */
function useLeafParallax() {
  const refs = useRef<(HTMLDivElement | null)[]>([])
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const factors = [0.05, -0.045, 0.045, -0.05]
    let frame = 0
    const apply = () => {
      const y = window.scrollY
      refs.current.forEach((el, index) => {
        if (!el) return
        const shift = Math.max(-70, Math.min(70, y * factors[index]))
        el.style.transform = `translateY(${shift}px)`
      })
      frame = 0
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply)
    }
    apply()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])
  return refs
}

type Product = { id: number; kind: string; name: string; category: string; description: string; price: number; stock: number; durationMinutes: number; image: string; featured: boolean }
type Props = { data: { products: Product[]; content: Record<string, string> } }

const money = (value: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(value / 100)
const CART_KEY = 'ela-cart'
const PLACEHOLDER = '/placeholder.png'
const handle = (value: string) => (value || '').trim().replace(/^@+/, '')
const waNumber = (value: string) => (value || '').replace(/\D/g, '')
// Fecha local (no UTC), para que después de las 8 p. m. no salga mañana.
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const prettyDate = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return y ? new Intl.DateTimeFormat('es-DO', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(y, m - 1, d)) : iso }
/** Si una foto no carga (enlace roto), muestra la imagen de respaldo. */
const onImgError = (event: React.SyntheticEvent<HTMLImageElement>) => { const img = event.currentTarget; if (!img.src.endsWith(PLACEHOLDER)) img.src = PLACEHOLDER }

/** Logotipo tipográfico de ELA: "Ela" en trazo cursivo + "esencia" en
 * versalitas espaciadas debajo — sin insignia circular. */
function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span className={`brand-mark ${className}`}>
      <span className="brand-mark-main">Ela</span>
      <span className="brand-mark-sub">esencia</span>
    </span>
  )
}

/** Pareja de matas decorativas para UN bloque/sección de la página
 * (no las 4 de las esquinas, que son fijas a todo el sitio). Van
 * pegadas al centro del borde lateral izquierdo/derecho de ESA
 * sección y, al ser los primeros hijos en el DOM, quedan siempre por
 * detrás del contenido real (tarjetas, textos) que se agrega después. */
function BlockSprig({ left: Left, right: Right }: { left: React.ComponentType; right: React.ComponentType }) {
  return (
    <>
      <span className="block-sprig block-sprig-left" aria-hidden="true"><Left /></span>
      <span className="block-sprig block-sprig-right" aria-hidden="true"><Right /></span>
    </>
  )
}

/** Revela cada sección de la página con una animación de scroll que se
 * repite en ambos sentidos: aparece (fade + sube) al entrar en
 * pantalla y vuelve a ocultarse si sale de pantalla, ya sea bajando o
 * subiendo hacia el navbar de nuevo. Se vuelve a ejecutar cuando
 * cambia el contenido dinámico (filtros del catálogo) para observar
 * los elementos nuevos que se agregan al DOM. */
function useScrollReveal(deps: unknown[]) {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) entry.target.classList.toggle('in-view', entry.isIntersecting)
      },
      { threshold: 0.15, rootMargin: '0px 0px -6% 0px' },
    )
    document.querySelectorAll('.reveal').forEach((element) => observer.observe(element))
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

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
  const [confirmation, setConfirmation] = useState<{ orderNumber: string; total: number; summary: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [bookingService, setBookingService] = useState<Product | null>(null)
  const [bookingConfirmation, setBookingConfirmation] = useState<{ appointmentNumber: string; summary: string } | null>(null)
  const cartLoaded = useRef(false)

  // La bolsa se guarda en este teléfono: si la clienta cierra la página,
  // al volver sigue ahí. Se ajusta a las unidades que haya hoy.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CART_KEY) || '[]') as CartLine[]
      const valid = saved.flatMap((line) => {
        const product = products.find((item) => item.id === line.productId && item.kind === 'producto')
        if (!product || product.stock <= 0) return []
        return [{ ...line, name: product.name, price: product.price, image: product.image, quantity: Math.min(Math.max(1, Math.floor(line.quantity)), product.stock) }]
      })
      if (valid.length) setCart(valid)
    } catch { /* sin almacenamiento: la bolsa empieza vacía */ }
    cartLoaded.current = true
  }, [products])
  useEffect(() => {
    if (!cartLoaded.current) return
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)) } catch { /* ignorar */ }
  }, [cart])

  // Con un menú, la bolsa o una ventana abierta, la página de atrás no se
  // mueve, y la tecla Escape los cierra.
  const anyOverlay = menuOpen || cartOpen || checkoutOpen || Boolean(bookingService)
  useEffect(() => {
    if (!anyOverlay) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenuOpen(false); setCartOpen(false); setCheckoutOpen(false); setConfirmation(null); setBookingService(null); setBookingConfirmation(null) } }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', onKey) }
  }, [anyOverlay])
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
      const name = String(form.get('name'))
      const result = await createOrder({ data: { name, phone: String(form.get('phone')), email: String(form.get('email')), address: String(form.get('address')), items: cart } })
      const summary = [`Hola, soy ${name}. Acabo de hacer el pedido ${result.orderNumber} en la web:`, ...cart.map((line) => `• ${line.quantity} × ${line.name}`), `Total: ${money(result.total)}`].join('\n')
      setConfirmation({ ...result, summary })
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
      const name = String(form.get('name'))
      const date = String(form.get('date'))
      const time = String(form.get('time'))
      const result = await createAppointment({ data: { name, phone: String(form.get('phone')), email: String(form.get('email')), serviceId: bookingService.id, date, time, notes: String(form.get('notes') || '') } })
      const summary = `Hola, soy ${name}. Acabo de agendar la cita ${result.appointmentNumber} en la web: ${bookingService.name}, el ${prettyDate(date)} a las ${time}.`
      setBookingConfirmation({ ...result, summary })
    } catch (caught) {
      setBookingError(caught instanceof Error ? caught.message : 'No pudimos agendar la cita.')
    } finally {
      setBookingSubmitting(false)
    }
  }

  const todayIso = localToday()
  const whatsapp = waNumber(copy.whatsapp)
  const waHref = (text: string) => `https://wa.me/${whatsapp}?text=${encodeURIComponent(text)}`

  useScrollReveal([visibleProducts.length, category, query, services.length])
  // Fotos que fallaron antes de que la página terminara de cargar (el
  // onError de React todavía no existía): se cambian por la de respaldo.
  useEffect(() => {
    document.querySelectorAll<HTMLImageElement>('.site-shell img').forEach((img) => {
      if (img.complete && img.naturalWidth === 0 && !img.src.endsWith(PLACEHOLDER)) img.src = PLACEHOLDER
    })
  }, [])
  const leafRefs = useLeafParallax()

  return <div className="site-shell">
    <div className="bg-leaf bg-leaf-left-top leaf-in" aria-hidden="true">
      <div className="bg-leaf-inner" ref={(el) => { leafRefs.current[0] = el }}><LeafBranch /></div>
    </div>
    <div className="bg-leaf bg-leaf-left-bottom leaf-in" aria-hidden="true">
      <div className="bg-leaf-inner" ref={(el) => { leafRefs.current[1] = el }}><LeafBloom /></div>
    </div>
    <div className="bg-leaf bg-leaf-right-top leaf-in" aria-hidden="true">
      <div className="bg-leaf-inner" ref={(el) => { leafRefs.current[2] = el }}><LeafBloom /></div>
    </div>
    <div className="bg-leaf bg-leaf-right-bottom leaf-in" aria-hidden="true">
      <div className="bg-leaf-inner" ref={(el) => { leafRefs.current[3] = el }}><LeafBranch /></div>
    </div>

    <header className="topbar">
      <div className="topbar-left">
        <button className="icon-button" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu /></button>
        <ShareButton title={copy.brandName} />
      </div>
      <a className="wordmark" href="#inicio"><BrandMark /></a>
      <nav className="desktop-nav"><a href="#servicios">{copy.navServices}</a><a href="#catalogo">{copy.navCatalog}</a><a href="#beneficios">{copy.navBenefits}</a><a href="#contacto">{copy.navContact}</a></nav>
      <div className="topbar-actions">
        <button className="cart-button" onClick={() => setCartOpen(true)} aria-label={`Abrir bolsa (${cartCount})`}><ShoppingBag size={19} /><span>Bolsa</span><b className={cartCount ? 'has-items' : ''}>{cartCount}</b></button>
      </div>
    </header>

    <div className={`overlay ${menuOpen ? 'visible' : ''}`} onClick={() => setMenuOpen(false)} />
    <aside className={`side-menu ${menuOpen ? 'open' : ''}`}>
      <div className="drawer-head"><BrandMark className="mini-mark" /><button className="icon-button" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"><X /></button></div>
      <p className="drawer-kicker">Explora ELA</p>
      <a href="#servicios" onClick={() => setMenuOpen(false)}>{copy.navServices} <ArrowRight /></a>
      <a href="#catalogo" onClick={() => setMenuOpen(false)}>{copy.navCatalog} <ArrowRight /></a>
      <a href="#beneficios" onClick={() => setMenuOpen(false)}>{copy.navBenefits} <ArrowRight /></a>
      <a href="#historia" onClick={() => setMenuOpen(false)}>Nuestra historia <ArrowRight /></a>
      <a href="#contacto" onClick={() => setMenuOpen(false)}>{copy.navContact} <ArrowRight /></a>
      <Link to="/politicas" onClick={() => setMenuOpen(false)}>Políticas <ArrowRight /></Link>
      <Link to="/terminos" onClick={() => setMenuOpen(false)}>Términos y condiciones <ArrowRight /></Link>
      <div className="drawer-admin"><span>Área privada</span><Link to="/admin">Entrar al panel administrativo</Link></div>
    </aside>

    <main>
      <section className="ela-hero" id="inicio">
        <BlockSprig left={LeafBranch} right={LeafBloom} />
        <p className="ela-eyebrow reveal"><Sparkles size={14} />{copy.eyebrow}</p>
        <h1 className="reveal delay-1">{copy.heroTitle}</h1>
        <p className="ela-hero-lede reveal delay-1">{copy.heroDescription}</p>
        <a className="primary-button reveal delay-1" href="#servicios">{copy.heroCta}<ArrowRight /></a>
        <div className="ela-hero-banner reveal delay-1"><img src={copy.heroImage || PLACEHOLDER} alt="ELA — belleza y cuidado" fetchPriority="high" onError={onImgError} /></div>
      </section>

      <section className="ela-manifesto" id="beneficios">
        <BlockSprig left={LeafSpray} right={LeafBranch} />
        <div className="ela-section-heading reveal"><span>Nuestro compromiso</span><h2>{copy.benefitsTitle}</h2></div>
        <div className="ela-manifesto-grid">{[1, 2, 3].map((number) => <article className={`reveal delay-${number}`} key={number}><span>0{number}</span><h3>{copy[`benefit${number}Title`]}</h3><p>{copy[`benefit${number}Text`]}</p></article>)}</div>
      </section>

      <section className="catalog services-section" id="servicios">
        <BlockSprig left={LeafBloom} right={LeafSpray} />
        <div className="ela-section-heading reveal"><span>Servicios de belleza</span><h2>{copy.servicesTitle}</h2><p>{copy.servicesDescription}</p></div>
        <div className="service-grid">
          {services.map((service, index) => <article className={`service-card reveal delay-${(index % 3) + 1}`} key={service.id}>
            <div className="service-image"><img src={service.image || PLACEHOLDER} alt={service.name} loading="lazy" decoding="async" onError={onImgError} /></div>
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
        <BlockSprig left={LeafBranch} right={LeafBloom} />
        <div className="ela-section-heading reveal"><span>Productos artesanales</span><h2>{copy.catalogTitle}</h2><p>{copy.catalogDescription}</p></div>
        <div className="catalog-layout">
          <aside className="filters reveal"><label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto..." /></label><div className="category-list">{categories.map((item) => <button className={category === item ? 'active' : ''} onClick={() => setCategory(item)} key={item}>{item}<span>{item === 'Todos' ? goods.length : goods.filter((product) => product.category === item).length}</span></button>)}</div></aside>
          <div className="product-list">{visibleProducts.map((product, index) => <article className={`product-row reveal delay-${(index % 3) + 1}`} key={product.id}>
            <div className="product-number">{String(index + 1).padStart(2, '0')}</div>
            <div className="product-image"><img src={product.image || PLACEHOLDER} alt={product.name} loading="lazy" decoding="async" onError={onImgError} />{product.stock === 0 && <span>Agotado</span>}</div>
            <div className="product-info"><p className="product-category">{product.category}</p><h3>{product.name}</h3><p>{product.description}</p><div className="stock-line"><span className={product.stock ? '' : 'empty'}>{product.stock ? (product.stock <= 5 ? `¡Quedan ${product.stock}!` : 'Disponible') : 'Sin existencias'}</span></div></div>
            <div className="product-action"><strong>{money(product.price)}</strong><button disabled={product.stock === 0} onClick={() => addToCart(product)}>{product.stock ? 'Agregar' : 'Agotado'}<Plus /></button></div>
          </article>)}{visibleProducts.length === 0 && <div className="empty-state"><Search /><h3>No encontramos ese producto</h3><p>Prueba otra palabra o categoría.</p></div>}</div>
        </div>
      </section>

      <section className="ela-story reveal" id="historia">
        <BlockSprig left={LeafSpray} right={LeafSpray} />
        <span className="ela-eyebrow">Nuestra historia</span>
        <h2>{copy.storyTitle}</h2>
        <p>{copy.storyText}</p>
        <div className="ela-story-signature">ELA</div>
      </section>
    </main>

    <footer id="contacto">
      <BlockSprig left={LeafBranch} right={LeafBloom} />
      <div className="footer-brand reveal"><BrandMark className="footer-mark" /><p>{copy.footerText}</p></div>
      <div className="reveal delay-1"><span>Conversemos</span><a className="whatsapp" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">Escríbenos por WhatsApp <ArrowRight /></a></div>
      <div className="reveal delay-2"><span>Horario</span><p>{copy.schedule}</p><p className="footer-location">{copy.location}</p></div>
      <div className="reveal delay-3"><span>Síguenos</span>{handle(copy.instagram) && <a className="social-line" href={`https://instagram.com/${handle(copy.instagram)}`} target="_blank" rel="noreferrer"><Instagram size={16} />@{handle(copy.instagram)}</a>}{handle(copy.tiktok) && <a className="social-line" href={`https://www.tiktok.com/@${handle(copy.tiktok)}`} target="_blank" rel="noreferrer"><Music2 size={16} />@{handle(copy.tiktok)}</a>}</div>
      <div className="footer-bottom reveal">
        <a className="gadr-credit" href="https://gadrnet.com" target="_blank" rel="noopener noreferrer">
          <span className="gadr-credit-text">Diseño y desarrollo de la tienda: GADR Net | gadrnet.com</span>
          <span className="gadr-mark" aria-hidden="true">
            <span className="gadr-mark-icon">&lt;/&gt;<i /></span>
            <span className="gadr-mark-word">GADR<small>Net</small></span>
          </span>
        </a>
        <p>© {new Date().getFullYear()} {copy.brandName} · <Link to="/politicas">Políticas</Link> · <Link to="/terminos">Términos y condiciones</Link></p>
      </div>
    </footer>

    {whatsapp && <a className="wa-float" href={waHref('Hola ELA, quiero información.')} target="_blank" rel="noreferrer" aria-label="Escríbenos por WhatsApp"><MessageCircle /><span>¿Dudas? Escríbenos</span></a>}

    <div className={`overlay ${cartOpen ? 'visible' : ''}`} onClick={() => setCartOpen(false)} />
    <aside className={`cart-drawer ${cartOpen ? 'open' : ''}`}><div className="drawer-head"><div><span className="drawer-kicker">BOLSA · {cartCount} PIEZAS</span><h2>{copy.cartTitle}</h2></div><button className="icon-button" onClick={() => setCartOpen(false)} aria-label="Cerrar bolsa"><X /></button></div>
      <div className="cart-lines">{cart.map((line) => <div className="cart-line" key={line.productId}><img src={line.image || PLACEHOLDER} alt="" onError={onImgError} /><div><h4>{line.name}</h4><p>{money(line.price)}</p><div className="quantity"><button onClick={() => changeQuantity(line.productId, -1)} aria-label="Quitar uno"><Minus /></button><span>{line.quantity}</span><button onClick={() => changeQuantity(line.productId, 1)} aria-label="Agregar uno"><Plus /></button></div></div><button className="remove" aria-label="Quitar de la bolsa" onClick={() => setCart((current) => current.filter((item) => item.productId !== line.productId))}><Trash2 /></button></div>)}{!cart.length && <div className="empty-cart"><ShoppingBag /><h3>Tu bolsa está esperando</h3><p>Elige algún producto artesanal.</p></div>}</div>
      <div className="cart-summary"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><p>La entrega se coordina después de confirmar el pedido.</p><button className="primary-button full" disabled={!cart.length} onClick={() => { setCartOpen(false); setCheckoutOpen(true) }}>Continuar al checkout <ArrowRight /></button></div>
    </aside>

    {checkoutOpen && <div className="modal-wrap"><div className="modal-card"><button className="modal-close icon-button" aria-label="Cerrar" onClick={() => { setCheckoutOpen(false); setConfirmation(null) }}><X /></button>{confirmation ? <div className="confirmation"><div className="success-icon"><Check /></div><span>PEDIDO RECIBIDO</span><h2>Gracias por confiar en ELA.</h2><p>Tu número de pedido es</p><strong>{confirmation.orderNumber}</strong><p>Total: {money(confirmation.total)}. Te contactaremos por WhatsApp para coordinar pago y entrega. Si quieres, avísanos tú primero:</p><div className="confirmation-actions">{whatsapp && <a className="primary-button wa-green" href={waHref(confirmation.summary)} target="_blank" rel="noreferrer"><MessageCircle />Enviar por WhatsApp</a>}<button className="text-button" onClick={() => { setCheckoutOpen(false); setConfirmation(null) }}>Volver a la tienda</button></div></div> : <div className="checkout-grid"><div><span className="drawer-kicker">ÚLTIMO PASO</span><h2>{copy.checkoutTitle}</h2><p>Déjanos tus datos para coordinar pago y entrega.</p><form id="checkout-form" onSubmit={submitOrder}><input required name="name" placeholder="Nombre completo" autoComplete="name" maxLength={120} /><input required name="phone" type="tel" inputMode="tel" placeholder="Teléfono (WhatsApp)" autoComplete="tel" maxLength={40} /><input name="email" type="email" placeholder="Correo electrónico (opcional)" autoComplete="email" /><textarea required name="address" placeholder="Dirección de entrega" rows={3} autoComplete="street-address" maxLength={400} />{error && <p className="form-error">{error}</p>}</form></div><div className="order-review"><h3>Resumen</h3>{cart.map((line) => <div key={line.productId}><span>{line.quantity} × {line.name}</span><strong>{money(line.quantity * line.price)}</strong></div>)}<div className="checkout-total"><span>Total</span><strong>{money(subtotal)}</strong></div><button form="checkout-form" disabled={submitting} className="primary-button full">{submitting ? 'Enviando...' : 'Enviar pedido'}<ArrowRight /></button></div></div>}</div></div>}

    {bookingService && <div className="modal-wrap"><div className="modal-card"><button className="modal-close icon-button" aria-label="Cerrar" onClick={() => { setBookingService(null); setBookingConfirmation(null) }}><X /></button>{bookingConfirmation ? <div className="confirmation"><div className="success-icon"><Check /></div><span>CITA AGENDADA</span><h2>Te esperamos en ELA.</h2><p>Tu número de cita es</p><strong>{bookingConfirmation.appointmentNumber}</strong><p>Te contactaremos por WhatsApp para confirmar el horario. Si quieres, avísanos tú primero:</p><div className="confirmation-actions">{whatsapp && <a className="primary-button wa-green" href={waHref(bookingConfirmation.summary)} target="_blank" rel="noreferrer"><MessageCircle />Enviar por WhatsApp</a>}<button className="text-button" onClick={() => { setBookingService(null); setBookingConfirmation(null) }}>Volver a la tienda</button></div></div> : <div className="checkout-grid"><div><span className="drawer-kicker">{copy.appointmentTitle}</span><h2>{bookingService.name}</h2><p>{bookingService.description}</p><form id="booking-form" onSubmit={submitBooking}><input required name="name" placeholder="Nombre completo" autoComplete="name" maxLength={120} /><input required name="phone" type="tel" inputMode="tel" placeholder="Teléfono (WhatsApp)" autoComplete="tel" maxLength={40} /><input name="email" type="email" placeholder="Correo electrónico (opcional)" autoComplete="email" /><div className="date-time-row"><label className="field-label">Fecha<input required name="date" type="date" min={todayIso} /></label><label className="field-label">Hora<input required name="time" type="time" step={900} /></label></div><textarea name="notes" placeholder="Notas (opcional)" rows={2} maxLength={600} />{bookingError && <p className="form-error">{bookingError}</p>}</form></div><div className="order-review"><h3>Resumen</h3><div><span>{bookingService.name}</span><strong>{money(bookingService.price)}</strong></div><div className="checkout-total"><span>Duración estimada</span><strong>{bookingService.durationMinutes} min</strong></div><button form="booking-form" disabled={bookingSubmitting} className="primary-button full">{bookingSubmitting ? 'Agendando...' : 'Confirmar cita'}<ArrowRight /></button></div></div>}</div></div>}
  </div>
}
