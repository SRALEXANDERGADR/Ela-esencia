import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, ArrowLeft, Ban, Bell, BellOff, BellRing, Boxes, Calendar, CalendarPlus, Check, CheckCircle2, ChevronRight, Clock, Download, Eye, EyeOff, FileText, Home, ImageOff, ImagePlus, LoaderCircle, LogOut, MapPin, MessageCircle, MoreHorizontal, Package, Pencil, PlusCircle, ReceiptText, RotateCcw, Save, Scissors, Search, Share2, ShoppingBag, Smartphone, Trash, Trash2, UserPlus, Users, Wallet, X } from 'lucide-react'
import { cancelInvoice, checkSession, deleteAppointment, deleteCustomer, deleteOrder, deleteProduct, getAdminData, getPushSetup, login, logout, removePushSubscription, savePushSubscription, sendTestPush, purgeAppointment, purgeCustomer, purgeOrder, purgeProduct, registerPayment, restoreAppointment, restoreCustomer, restoreOrder, restoreProduct, saveAppointmentAdmin, saveContent, saveCustomer, saveProduct, updateAppointmentStatus, updateOrderStatus } from '@/lib/store'
import type { InvoiceLike, PaymentLike } from '@/lib/invoice'
import { compressImage } from '@/lib/image'
import { fromBase64Url } from '@/lib/push'

type Product = { id: number; kind: string; name: string; category: string; description: string; price: number; stock: number; durationMinutes: number; image: string; featured: boolean; active: boolean }
type Order = { id: number; orderNumber: string; customerId: number | null; customerName: string; email: string; phone: string; address: string; total: number; status: string; paymentStatus: string; items: Array<{ id: number; name: string; price: number; quantity: number }>; createdAt: string | Date }
type Appointment = { id: number; appointmentNumber: string; customerId: number | null; customerName: string; phone: string; email: string; serviceId: number | null; serviceName: string; price: number; date: string; time: string; notes: string; status: string; paymentStatus: string; createdAt: string | Date }
type Customer = { id: number; name: string; email: string; phone: string; address: string; notes: string; createdAt: string | Date }
type Invoice = InvoiceLike & { sourceId: number; customerId: number | null }
type Payment = PaymentLike & { id: number; invoiceId: number }
type TrashImage = { id: number; path: string; url: string; reason: string; deletedAt: string | Date; daysLeft: number }
type TrashData = {
  products: Array<Product & { daysLeft: number }>
  orders: Array<Order & { daysLeft: number }>
  appointments: Array<Appointment & { daysLeft: number }>
  customers: Array<Customer & { daysLeft: number }>
  images: TrashImage[]
}
type AdminData = { products: Product[]; orders: Order[]; appointments: Appointment[]; customers: Customer[]; invoices: Invoice[]; payments: Payment[]; content: Record<string, string>; trash: TrashData }
type Tab = 'resumen' | 'citas' | 'pedidos' | 'facturas' | 'catalogo' | 'clientes' | 'contenido' | 'app' | 'papelera'
const TAB_IDS: Tab[] = ['resumen', 'citas', 'pedidos', 'facturas', 'catalogo', 'clientes', 'contenido', 'app', 'papelera']
type CustomerDraft = { id?: number; name: string; email: string; phone: string; address: string; notes: string }
type ProductDraft = { id?: number; kind: string; name: string; category: string; description: string; price: number; stock: number; durationMinutes: number; image: string; featured: boolean; active: boolean }
type AppointmentDraft = { name: string; phone: string; email: string; serviceId: number; date: string; time: string; notes: string }
type Toast = { id: number; text: string; kind: 'ok' | 'error' }

// Mensaje que el servidor lanza cuando un pedido/cita tiene una factura
// relacionada con abonos ya registrados (ver `checkInvoiceForCancel` en
// src/lib/store.ts). Se usa para distinguir ese caso y pedir una
// confirmación especial en vez de mostrar el error tal cual.
const invoiceWarning = (message: string) => message.includes('factura relacionada')
const sessionExpired = (message: string) => message.includes('Debes iniciar sesión')
const errorText = (error: unknown, fallback = 'No pudimos completar la acción.') => error instanceof Error ? error.message : fallback

const money = (value: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(value / 100)
const shortDate = (value: string | Date) => new Intl.DateTimeFormat('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
// Fecha local (no UTC): con toISOString, después de las 8 p. m. en RD ya
// salía la fecha de mañana.
const localIso = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const todayIso = () => localIso()
const niceDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  if (iso === todayIso()) return 'Hoy'
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  if (iso === localIso(tomorrow)) return 'Mañana'
  return new Intl.DateTimeFormat('es-DO', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d))
}
const niceTime = (time: string) => {
  const [h, min] = time.split(':').map(Number)
  if (Number.isNaN(h)) return time
  return `${((h + 11) % 12) + 1}:${String(min || 0).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`
}
/** Enlace de WhatsApp para escribirle a una clienta. Los números de RD
 * de 10 dígitos (809/829/849) se completan con el 1 del país. */
const waLink = (phone: string, text = '') => {
  let digits = phone.replace(/\D/g, '')
  if (digits.length === 10) digits = `1${digits}`
  if (digits.length < 8) return ''
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches' }
const blankProduct = (kind = 'servicio'): ProductDraft => ({ kind, name: '', category: '', description: '', price: 0, stock: 0, durationMinutes: 30, image: '', featured: false, active: true })
const blankCustomer: CustomerDraft = { name: '', email: '', phone: '', address: '', notes: '' }
const ORDER_STATUSES = ['Pendiente', 'Preparando', 'Enviado', 'Entregado', 'Cancelado']
const APPOINTMENT_STATUSES = ['Pendiente', 'Confirmada', 'Completada', 'Cancelada']
const PAYMENT_STATUSES = ['Pendiente', 'Pagado', 'Reembolsado']

// El módulo de facturas (jsPDF + html2canvas) pesa mucho: se carga solo
// cuando de verdad se descarga o comparte una factura.
const invoiceLib = () => import('@/lib/invoice')

// ───────────────────────────────────────────────────────────────────────
// APP "ELA Admin" Y NOTIFICACIONES — igual que en JB Tech Store. El panel
// se instala como app y cada cita o pedido nuevo manda un aviso al
// teléfono (con el punto en el ícono), aunque la app esté cerrada.
// ───────────────────────────────────────────────────────────────────────
type PushState = 'cargando' | 'no-soportado' | 'bloqueado' | 'apagado' | 'activo'
type PushDevice = { id: number; endpoint: string; label: string; createdAt: string }
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

function deviceLabel() {
  const ua = navigator.userAgent
  const system = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : 'Computadora'
  const browser = /SamsungBrowser/i.test(ua) ? 'Samsung Internet' : /Edg\//i.test(ua) ? 'Edge' : /Firefox/i.test(ua) ? 'Firefox' : /Chrome/i.test(ua) ? 'Chrome' : 'Navegador'
  return `${system} · ${browser}`
}

// Chrome avisa "se puede instalar" con el evento beforeinstallprompt. Se
// guarda aquí (y se evita su cartelito automático) para que la única forma
// de instalar sea el botón «Instalar app» del panel, ya con la sesión abierta.
let deferredInstall: InstallPromptEvent | null = null
const installListeners = new Set<(event: InstallPromptEvent | null) => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    if (!window.location.pathname.startsWith('/admin')) return
    event.preventDefault()
    deferredInstall = event as InstallPromptEvent
    installListeners.forEach((listener) => listener(deferredInstall))
  })
  window.addEventListener('appinstalled', () => {
    deferredInstall = null
    installListeners.forEach((listener) => listener(null))
  })
}

/** Qué app se instala desde /admin: sin sesión, la TIENDA (así una clienta
 * que llegue aquí e instale desde el menú de Chrome se lleva la tienda, que
 * abre en el inicio); con la sesión abierta, "ELA Admin". Al salir del panel
 * se quita, para que en la tienda nunca se ofrezca instalar el panel. */
function setAdminManifest(mode: 'admin' | 'store' | 'off') {
  let link = document.getElementById('admin-manifest') as HTMLLinkElement | null
  if (mode === 'off') { link?.remove(); return }
  if (!link) {
    link = document.createElement('link')
    link.id = 'admin-manifest'
    link.rel = 'manifest'
    document.head.appendChild(link)
  }
  const href = mode === 'admin' ? '/admin.webmanifest' : '/site.webmanifest'
  if (link.getAttribute('href') !== href) link.setAttribute('href', href)
}

function isInstalledApp() {
  return typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true)
}

/** Revisa rápido si este aparato ya tiene los avisos activados (para el
 * recordatorio de Inicio). No pide permisos ni registra nada. */
async function pushActiveHere() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return true
  if (Notification.permission !== 'granted') return false
  const registration = await navigator.serviceWorker.getRegistration('/admin')
  return Boolean(await registration?.pushManager.getSubscription())
}

function AppAndNotifications() {
  const [state, setState] = useState<PushState>('cargando')
  const [devices, setDevices] = useState<PushDevice[]>([])
  const [endpoint, setEndpoint] = useState('')
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(() => deferredInstall)
  const [installed, setInstalled] = useState(false)

  async function load() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { setState('no-soportado'); return }
    const registration = await navigator.serviceWorker.register('/admin-sw.js', { scope: '/admin' })
    const setup = await getPushSetup()
    setDevices(setup.devices as unknown as PushDevice[])
    const subscription = await registration.pushManager.getSubscription()
    setEndpoint(subscription?.endpoint ?? '')
    if (Notification.permission === 'denied') setState('bloqueado')
    else if (subscription && setup.devices.some((device) => device.endpoint === subscription.endpoint)) setState('activo')
    else setState('apagado')
  }

  useEffect(() => {
    setInstalled(isInstalledApp())
    load().catch(() => setState('no-soportado'))
    setInstallEvent(deferredInstall)
    const listener = (event: InstallPromptEvent | null) => {
      setInstallEvent(event)
      if (!event) setInstalled(true)
    }
    installListeners.add(listener)
    return () => { installListeners.delete(listener) }
  }, [])

  async function act(action: () => Promise<void>) {
    setWorking(true)
    setMessage('')
    try { await action() } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Algo salió mal. Intenta de nuevo.') } finally { setWorking(false) }
  }

  const enable = () => act(async () => {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      setState(permission === 'denied' ? 'bloqueado' : 'apagado')
      throw new Error('Para recibir los avisos tienes que tocar «Permitir» cuando el teléfono pregunte.')
    }
    const registration = await navigator.serviceWorker.register('/admin-sw.js', { scope: '/admin' })
    await navigator.serviceWorker.ready
    const setup = await getPushSetup()
    // Si había una suscripción vieja (ej. de otras claves), se cambia por una nueva.
    const old = await registration.pushManager.getSubscription()
    if (old) await old.unsubscribe().catch(() => false)
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(setup.publicKey) })
    const json = subscription.toJSON()
    await savePushSubscription({ data: { endpoint: subscription.endpoint, p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '', label: deviceLabel() } })
    try {
      await sendTestPush({ data: subscription.endpoint })
    } finally {
      await load() // la pantalla siempre muestra el estado real, aunque la prueba falle
    }
    setMessage('Listo. Te acaba de llegar una notificación de prueba: así te van a llegar las citas y los pedidos.')
  })

  const disable = () => act(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/admin')
    const subscription = await registration?.pushManager.getSubscription()
    if (subscription) {
      await removePushSubscription({ data: subscription.endpoint })
      await subscription.unsubscribe().catch(() => false)
    }
    await load()
    setMessage('Notificaciones apagadas en este aparato.')
  })

  const test = () => act(async () => {
    try {
      await sendTestPush({ data: endpoint })
    } finally {
      await load()
    }
    setMessage('Prueba enviada. Debe llegarte en unos segundos.')
  })

  const removeDevice = (device: PushDevice) => act(async () => {
    if (!window.confirm(`¿Dejar de mandar avisos a «${device.label || 'ese aparato'}»?`)) return
    await removePushSubscription({ data: device.endpoint })
    await load()
  })

  const install = () => act(async () => {
    if (!installEvent) return
    await installEvent.prompt()
    const choice = await installEvent.userChoice
    if (choice.outcome === 'accepted') setInstalled(true)
    deferredInstall = null
    setInstallEvent(null)
  })

  return (
    <div className="app-card">
      <div className="app-card-head">
        <img src="/admin-192.png" alt="" />
        <div><strong>App "ELA Admin" y avisos</strong><span>Instala el panel como app en tu teléfono y te llega una notificación (con el punto en el ícono) cada vez que alguien agenda una cita o hace un pedido, aunque la app esté cerrada.</span></div>
      </div>

      <div className="app-step">
        <b>1</b>
        <div>
          <strong>Instalar la app</strong>
          {installed
            ? <span className="app-ok"><Check size={14} />Ya la estás usando como app.</span>
            : installEvent
            ? <button type="button" className="admin-action" disabled={working} onClick={install}><Smartphone size={16} />Instalar app</button>
            : <span>Preparando el botón de instalar… Si en unos segundos no aparece, en Chrome toca el menú <b>⋮</b> → <b>«Instalar app»</b> o <b>«Agregar a la pantalla principal»</b>. En iPhone (Safari): botón <b>Compartir</b> → <b>«Agregar a inicio»</b>.</span>}
        </div>
      </div>

      <div className="app-step">
        <b>2</b>
        <div>
          <strong>Avisos en este aparato</strong>
          {state === 'cargando' && <span>Revisando…</span>}
          {state === 'no-soportado' && <span>Este navegador no puede recibir notificaciones. Abre el panel en Chrome (Android o computadora) o en Edge. En iPhone, primero instala la app y ábrela desde el ícono.</span>}
          {state === 'bloqueado' && <span className="app-warn">Las notificaciones están bloqueadas para esta página. Toca el candado junto a la dirección (o Ajustes del teléfono → Apps → ELA Admin → Notificaciones) y ponlas en «Permitir»; luego vuelve aquí.</span>}
          {state === 'apagado' && <button type="button" className="admin-action" disabled={working} onClick={enable}><Bell size={16} />{working ? 'Activando…' : 'Activar notificaciones'}</button>}
          {state === 'activo' && <div className="app-actions">
            <span className="app-ok"><Check size={14} />Activadas en este aparato.</span>
            <button type="button" className="admin-action ghost" disabled={working} onClick={test}><Bell size={15} />Probar</button>
            <button type="button" className="admin-action ghost" disabled={working} onClick={disable}><BellOff size={15} />Apagar</button>
          </div>}
        </div>
      </div>

      {message && <p className="app-message">{message}</p>}

      {devices.length > 0 && (
        <div className="app-devices">
          <span>Las citas y pedidos avisan a {devices.length === 1 ? '1 aparato' : `${devices.length} aparatos`}:</span>
          {devices.map((device) => (
            <div key={device.id} className="app-device">
              <Smartphone size={15} />
              <span>{device.label || 'Aparato'}{device.endpoint === endpoint ? ' (este)' : ''} · desde {shortDate(device.createdAt)}</span>
              <button type="button" aria-label="Quitar" disabled={working} onClick={() => removeDevice(device)}><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function AdminPanel() {
  const initialized = useRef(false)
  const authenticatedRef = useRef(false)
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  authenticatedRef.current = authenticated === true
  const [data, setData] = useState<AdminData | null>(null)
  const [tab, setTab] = useState<Tab>('resumen')
  const [moreOpen, setMoreOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('')
  const [catalogKind, setCatalogKind] = useState<'servicio' | 'producto'>('servicio')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [editing, setEditing] = useState<ProductDraft | null>(null)
  const [editingCustomer, setEditingCustomer] = useState<CustomerDraft | null>(null)
  const [bookingDraft, setBookingDraft] = useState<AppointmentDraft | null>(null)
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null)
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null)
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null)
  const [viewingAppointment, setViewingAppointment] = useState<Appointment | null>(null)
  const [contentDraft, setContentDraft] = useState<Record<string, string>>({})
  const [contentDirty, setContentDirty] = useState(false)
  const [pushReady, setPushReady] = useState(true)

  function notify(text: string, kind: Toast['kind'] = 'ok') {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, text, kind }])
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), kind === 'error' ? 6000 : 3000)
  }

  async function refresh() {
    const result = await getAdminData()
    setData(result as AdminData)
    setContentDraft(result.content)
    setContentDirty(false)
  }

  /** Ejecuta una acción del panel: muestra el aviso de éxito, o el error
   * en un aviso (y si la sesión venció, vuelve a la pantalla de entrada). */
  async function run(action: () => Promise<unknown>, success?: string) {
    try {
      await action()
      await refresh()
      if (success) notify(success)
      return true
    } catch (caught) {
      const message = errorText(caught)
      if (sessionExpired(message)) { setAuthenticated(false); setError('Tu sesión venció. Vuelve a entrar.') }
      else notify(message, 'error')
      return false
    }
  }

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    async function initializeAuth() {
      try {
        const ok = await checkSession()
        setAuthenticated(Boolean(ok))
        if (ok) await refresh()
      } catch (caught) {
        setError(errorText(caught, 'No pudimos completar el acceso.'))
        setAuthenticated(false)
      }
    }
    initializeAuth().catch(() => setAuthenticated(false))
  }, [])

  // Solo con la sesión abierta se ofrece instalar el panel como app, y se
  // revisa si este aparato ya recibe los avisos (para recordarlo en Inicio).
  useEffect(() => {
    setAdminManifest(authenticated === true ? 'admin' : 'store')
    if (authenticated) pushActiveHere().then(setPushReady).catch(() => setPushReady(true))
  }, [authenticated, tab])
  useEffect(() => () => setAdminManifest('off'), [])

  // La notificación abre /admin?tab=citas o ?tab=pedidos. Al abrir o volver
  // a la app se quitan el punto del ícono y las notificaciones ya vistas.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('tab') as Tab | null
    if (wanted && TAB_IDS.includes(wanted)) setTab(wanted)
    const clearBadge = () => {
      if (document.visibilityState !== 'visible') return
      try { (navigator as any).clearAppBadge?.()?.catch?.(() => {}) } catch { /* sin soporte */ }
      navigator.serviceWorker?.getRegistration('/admin').then((registration) => registration?.getNotifications().then((list) => list.forEach((item) => item.close()))).catch(() => {})
      if (authenticatedRef.current) refresh().catch(() => {})
    }
    clearBadge()
    document.addEventListener('visibilitychange', clearBadge)
    return () => document.removeEventListener('visibilitychange', clearBadge)
  }, [])

  // Cerrar ventanas con la tecla Escape.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setEditing(null); setEditingCustomer(null); setBookingDraft(null); setPayingInvoice(null); setViewingInvoice(null); setViewingOrder(null); setViewingAppointment(null); setMoreOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function goTo(next: Tab, nextFilter = '') {
    setTab(next); setQuery(''); setFilter(nextFilter); setMoreOpen(false); setError('')
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', next === 'resumen' ? '/admin' : `/admin?tab=${next}`)
      window.scrollTo({ top: 0 })
    }
  }

  async function handleLogout() {
    await logout().catch(() => {})
    setAuthenticated(false); setData(null); setMoreOpen(false)
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    const form = new FormData(event.currentTarget)
    try { await login({ data: { password: String(form.get('password')) } }); setAuthenticated(true); await refresh() }
    catch (caught) { setError(errorText(caught, 'No pudimos completar el acceso.')) }
    finally { setBusy(false) }
  }

  async function handleProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return; setBusy(true); setError('')
    try { await saveProduct({ data: { ...editing, price: Number(editing.price), stock: Number(editing.stock), durationMinutes: Number(editing.durationMinutes) } }); const wasNew = !editing.id; setEditing(null); await refresh(); notify(wasNew ? 'Artículo creado.' : 'Cambios guardados.') }
    catch (caught) { setError(errorText(caught, 'No pudimos guardar el artículo.')) }
    finally { setBusy(false) }
  }

  async function handleCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editingCustomer) return; setBusy(true); setError('')
    try { await saveCustomer({ data: editingCustomer }); setEditingCustomer(null); await refresh(); notify('Cliente guardado.') }
    catch (caught) { setError(errorText(caught, 'No pudimos guardar el cliente.')) }
    finally { setBusy(false) }
  }

  async function handleBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!bookingDraft) return; setBusy(true); setError('')
    try { await saveAppointmentAdmin({ data: bookingDraft }); setBookingDraft(null); await refresh(); notify('Cita agendada.') }
    catch (caught) { setError(errorText(caught, 'No pudimos agendar la cita.')) }
    finally { setBusy(false) }
  }

  async function handlePayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!payingInvoice) return; setBusy(true); setError('')
    const form = new FormData(event.currentTarget)
    try {
      await registerPayment({ data: { invoiceId: payingInvoice.id, amount: Math.round(Number(form.get('amount')) * 100), method: String(form.get('method')), note: String(form.get('note') || '') } })
      setPayingInvoice(null); await refresh(); notify('Abono registrado.')
    } catch (caught) { setError(errorText(caught, 'No pudimos registrar el abono.')) }
    finally { setBusy(false) }
  }

  // Cambia estado o pago de un pedido/cita. Si al cancelar el servidor
  // avisa que la factura tiene abonos, pide una segunda confirmación y
  // reintenta con `force`.
  async function changeStatus(kind: 'order' | 'appointment', item: Order | Appointment, status: string, paymentStatus: string) {
    const action = kind === 'order' ? updateOrderStatus : updateAppointmentStatus
    if (paymentStatus === 'Pagado' && item.paymentStatus !== 'Pagado') {
      const invoice = findInvoiceFor(kind === 'order' ? 'pedido' : 'cita', item.id)
      const due = invoice && invoice.status !== 'Cancelada' ? invoice.total - invoice.paid : 0
      if (due > 0 && !confirm(`Se registrará un abono de ${money(due)} en efectivo para saldar la factura ${invoice!.folio}. ¿Continuar?`)) return
    }
    try {
      await action({ data: { id: item.id, status, paymentStatus } }); await refresh(); notify('Actualizado.')
    } catch (caught) {
      const message = errorText(caught)
      if (invoiceWarning(message)) {
        if (confirm(`${message}\n\n¿Confirmas de todas formas?`)) await run(() => action({ data: { id: item.id, status, paymentStatus, force: true } }), 'Actualizado.')
      } else if (sessionExpired(message)) setAuthenticated(false)
      else notify(message, 'error')
    }
  }

  // Envía un pedido/cita a la papelera (misma lógica de doble confirmación).
  async function sendToTrash(kind: 'order' | 'appointment', item: Order | Appointment, code: string) {
    const label = kind === 'order' ? `el pedido ${code}` : `la cita ${code}`
    const extra = kind === 'order' && (item as Order).status !== 'Cancelado' ? ' Sus unidades vuelven al inventario.' : ''
    if (!confirm(`¿Enviar ${label} a la papelera?${extra} Podrás restaurarlo durante 30 días.`)) return
    const action = kind === 'order' ? deleteOrder : deleteAppointment
    try {
      await action({ data: { id: item.id } }); await refresh(); notify('Enviado a la papelera.')
    } catch (caught) {
      const message = errorText(caught)
      if (invoiceWarning(message)) {
        if (confirm(`${message}\n\n¿Confirmas de todas formas?`)) await run(() => action({ data: { id: item.id, force: true } }), 'Enviado a la papelera.')
      } else notify(message, 'error')
    }
    setViewingOrder(null); setViewingAppointment(null)
  }

  async function restoreItem(kind: 'product' | 'customer' | 'order' | 'appointment', id: number) {
    const action = { product: restoreProduct, customer: restoreCustomer, order: restoreOrder, appointment: restoreAppointment }[kind]
    await run(() => action({ data: id }), kind === 'order' ? 'Pedido restaurado como "Cancelado". Cambia su estado para retomarlo.' : 'Restaurado.')
  }

  async function purgeItem(kind: 'product' | 'customer' | 'order' | 'appointment', id: number, label: string) {
    if (!confirm(`¿Eliminar definitivamente ${label}? Esta acción no se puede deshacer.`)) return
    const action = { product: purgeProduct, customer: purgeCustomer, order: purgeOrder, appointment: purgeAppointment }[kind]
    await run(() => action({ data: id }), 'Eliminado definitivamente.')
  }

  async function uploadImage(file: File, target: 'product' | 'hero') {
    setUploading(true); setError('')
    try {
      const compressed = await compressImage(file)
      const body = new FormData(); body.append('file', compressed)
      const response = await fetch('/api/upload', { method: 'POST', body })
      const result = await response.json() as { url?: string; error?: string }
      if (!response.ok || !result.url) throw new Error(result.error || 'No pudimos subir la imagen.')
      if (target === 'product') setEditing((current) => current ? { ...current, image: result.url! } : current)
      else { setContentDraft((current) => ({ ...current, heroImage: result.url! })); setContentDirty(true) }
      notify('Imagen subida.')
    } catch (caught) { const message = errorText(caught, 'No pudimos subir la imagen.'); if (target === 'product') setError(message); else notify(message, 'error') }
    finally { setUploading(false) }
  }

  async function saveSiteContent() {
    setBusy(true)
    const ok = await run(() => saveContent({ data: contentDraft }), 'Textos guardados. Ya se ven en la tienda.')
    if (ok) setContentDirty(false)
    setBusy(false)
  }

  function findInvoiceFor(sourceType: string, sourceId: number) {
    return data?.invoices.find((invoice) => invoice.sourceType === sourceType && invoice.sourceId === sourceId) || null
  }

  function paymentsFor(invoiceId: number) {
    return data?.payments.filter((payment) => payment.invoiceId === invoiceId) || []
  }

  const q = query.trim().toLowerCase()
  const has = (...values: string[]) => !q || values.some((value) => (value || '').toLowerCase().includes(q))

  const filteredProducts = useMemo(() => (data?.products || []).filter((product) => product.kind === catalogKind && has(product.name, product.category)), [data, q, catalogKind])
  const filteredCustomers = useMemo(() => (data?.customers || []).filter((customer) => has(customer.name, customer.email, customer.phone)), [data, q])

  const filteredOrders = useMemo(() => {
    const rows = (data?.orders || []).filter((order) => has(order.orderNumber, order.customerName, order.phone))
    if (filter === 'abiertos') return rows.filter((order) => order.status === 'Pendiente' || order.status === 'Preparando')
    if (filter === 'enviados') return rows.filter((order) => order.status === 'Enviado' || order.status === 'Entregado')
    if (filter === 'cancelados') return rows.filter((order) => order.status === 'Cancelado')
    if (filter === 'sinpagar') return rows.filter((order) => order.paymentStatus !== 'Pagado' && order.status !== 'Cancelado')
    return rows
  }, [data, q, filter])

  const filteredAppointments = useMemo(() => {
    const today = todayIso()
    const rows = (data?.appointments || []).filter((item) => has(item.appointmentNumber, item.customerName, item.serviceName, item.phone))
    const ascending = (list: Appointment[]) => [...list].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    const active = (item: Appointment) => item.status !== 'Cancelada' && item.status !== 'Completada'
    if (filter === 'hoy') return ascending(rows.filter((item) => item.date === today))
    if (filter === 'pendientes') return ascending(rows.filter((item) => item.status === 'Pendiente' && item.date >= today))
    if (filter === 'pasadas') return rows.filter((item) => item.date < today || !active(item))
    if (filter === 'todas') return rows
    return ascending(rows.filter((item) => item.date >= today && active(item)))
  }, [data, q, filter])

  const filteredInvoices = useMemo(() => {
    const rows = (data?.invoices || []).filter((invoice) => has(invoice.folio, invoice.customerName, invoice.concept))
    if (filter === 'porcobrar') return rows.filter((invoice) => invoice.status === 'Pendiente' || invoice.status === 'Abonado')
    if (filter === 'pagadas') return rows.filter((invoice) => invoice.status === 'Pagada')
    if (filter === 'anuladas') return rows.filter((invoice) => invoice.status === 'Cancelada')
    return rows
  }, [data, q, filter])

  if (authenticated === null) return <div className="admin-loading"><LoaderCircle /><p>Preparando tu espacio...</p></div>
  if (!authenticated) return <div className="admin-login"><div className="login-art"><Link to="/"><ArrowLeft /> Volver a la tienda</Link><div className="login-monogram">E</div><p>El detrás de escena de cada servicio y producto.</p></div><div className="login-form-wrap"><div><span>ACCESO PRIVADO</span><h1>Panel de<br />administración</h1><p>Ingresa la contraseña de administración.</p><form onSubmit={handleLogin}><label>Contraseña<input required type="password" name="password" placeholder="••••••••" autoFocus autoComplete="current-password" /></label>{error && <p className="form-error">{error}</p>}<button className="primary-button full" disabled={busy}>{busy ? 'Ingresando...' : 'Entrar al panel'}</button></form></div></div></div>

  if (!data) return <div className="admin-loading"><LoaderCircle /><p>Cargando información...</p></div>

  const today = todayIso()
  const monthPrefix = today.slice(0, 7)
  const openInvoices = data.invoices.filter((invoice) => invoice.status !== 'Cancelada')
  const pendingBalance = openInvoices.reduce((sum, invoice) => sum + Math.max(invoice.total - invoice.paid, 0), 0)
  const collectedMonth = data.payments.filter((payment) => localIso(new Date(payment.createdAt)).startsWith(monthPrefix)).reduce((sum, payment) => sum + payment.amount, 0)
  const todayAppointments = data.appointments.filter((item) => item.date === today && item.status !== 'Cancelada').sort((a, b) => a.time.localeCompare(b.time))
  const upcomingAppointments = data.appointments.filter((item) => item.date >= today && item.status !== 'Cancelada' && item.status !== 'Completada').sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
  const toConfirm = upcomingAppointments.filter((item) => item.status === 'Pendiente').length
  const openOrders = data.orders.filter((order) => order.status === 'Pendiente' || order.status === 'Preparando')
  const lowStockProducts = data.products.filter((product) => product.kind === 'producto' && product.active && product.stock <= 5)
  const services = data.products.filter((product) => product.kind === 'servicio')
  const trashCount = data.trash.products.length + data.trash.orders.length + data.trash.appointments.length + data.trash.customers.length
  const newBooking = (): AppointmentDraft => ({ name: '', phone: '', email: '', serviceId: services[0]?.id ?? 0, date: today, time: '10:00', notes: '' })

  const tabs: { id: Tab; label: string; hint: string; group: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'resumen', label: 'Inicio', hint: 'Lo más importante de hoy', group: 'Día a día', icon: <Home /> },
    { id: 'citas', label: 'Citas', hint: 'Agenda de servicios', group: 'Día a día', icon: <Calendar />, badge: toConfirm },
    { id: 'pedidos', label: 'Pedidos', hint: 'Compras de productos', group: 'Día a día', icon: <ShoppingBag />, badge: openOrders.length },
    { id: 'facturas', label: 'Cobros', hint: 'Facturas, abonos y saldos', group: 'Día a día', icon: <Wallet /> },
    { id: 'catalogo', label: 'Catálogo', hint: 'Servicios y productos', group: 'Tu tienda', icon: <Boxes /> },
    { id: 'clientes', label: 'Clientes', hint: 'Tus clientas y su historial', group: 'Tu tienda', icon: <Users /> },
    { id: 'contenido', label: 'Textos de la web', hint: 'Lo que se lee en la tienda', group: 'Tu tienda', icon: <FileText /> },
    { id: 'app', label: 'App y avisos', hint: 'Instalar la app y recibir notificaciones', group: 'Ajustes', icon: <BellRing /> },
    { id: 'papelera', label: 'Papelera', hint: 'Lo borrado en los últimos 30 días', group: 'Ajustes', icon: <Trash2 />, badge: trashCount },
  ]
  const groups = Array.from(new Set(tabs.map((item) => item.group)))
  const mobileMain: Tab[] = ['resumen', 'citas', 'pedidos', 'facturas']
  const current = tabs.find((item) => item.id === tab)!

  // Funciones (no componentes) para que el buscador no pierda el foco al escribir.
  const chips = (options: Array<[string, string, number?]>) => <div className="filter-chips">{options.map(([value, label, count]) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}{count !== undefined && <b>{count}</b>}</button>)}</div>
  const searchBox = (placeholder: string) => <label className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} />{query && <button type="button" aria-label="Borrar búsqueda" onClick={() => setQuery('')}><X size={14} /></button>}</label>

  return <div className="admin-shell">
    <aside className="admin-sidebar"><Link to="/" className="admin-brand"><span>E</span><div>ELA<small>Administración</small></div></Link>
      <nav>{groups.map((group) => <div key={group} className="nav-group"><small className="nav-group-title">{group}</small>{tabs.filter((item) => item.group === group).map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => goTo(item.id)} title={item.label}>{item.icon}<span className="nav-label">{item.label}</span>{!!item.badge && <b className="nav-badge">{item.badge}</b>}</button>)}</div>)}</nav>
      <Link to="/" className="logout sidebar-store"><Eye />Ver la tienda</Link>
      <button className="logout" onClick={handleLogout}><LogOut />Cerrar sesión</button>
    </aside>

    {/* Menú inferior en el teléfono: las 4 secciones del día a día + "Más". */}
    <nav className="admin-bottom-nav">
      {mobileMain.map((id) => { const item = tabs.find((t) => t.id === id)!; return <button key={id} className={tab === id ? 'active' : ''} onClick={() => goTo(id)}>{item.icon}<span>{item.label}</span>{!!item.badge && <b className="nav-badge">{item.badge}</b>}</button> })}
      <button className={!mobileMain.includes(tab) ? 'active' : ''} onClick={() => setMoreOpen(true)}><MoreHorizontal /><span>Más</span></button>
    </nav>
    {moreOpen && <div className="more-sheet-wrap" onClick={() => setMoreOpen(false)}><div className="more-sheet" onClick={(event) => event.stopPropagation()}>
      <div className="more-sheet-head"><strong>Más opciones</strong><button className="icon-button icon-button-sm" onClick={() => setMoreOpen(false)} aria-label="Cerrar"><X size={16} /></button></div>
      {groups.filter((group) => group !== 'Día a día').map((group) => <div key={group} className="more-group"><small className="more-group-title">{group}</small>{tabs.filter((item) => item.group === group).map((item) => <button key={item.id} onClick={() => goTo(item.id)}>{item.icon}<div><strong>{item.label}</strong><small>{item.hint}</small></div>{!!item.badge && <b className="nav-badge">{item.badge}</b>}<ChevronRight size={16} /></button>)}</div>)}
      <small className="more-group-title">Salir</small>
      <Link to="/"><Eye /><div><strong>Ver la tienda</strong><small>Como la ven tus clientas</small></div><ChevronRight size={16} /></Link>
      <button onClick={handleLogout}><LogOut /><div><strong>Cerrar sesión</strong><small>Salir del panel</small></div></button>
    </div></div>}

    <main className="admin-main">
      <header><div><span>{current.hint}</span><h1>{current.label}</h1></div><Link to="/" className="header-store">Ver tienda <ArrowLeft /></Link></header>

      {tab === 'resumen' && <div className="dashboard">
        <p className="greeting">{greeting()} · <span>{new Intl.DateTimeFormat('es-DO', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</span></p>
        <div className="metric-grid">
          <button onClick={() => goTo('citas', 'hoy')}><span>Citas de hoy</span><strong>{todayAppointments.length}</strong><small>{toConfirm ? `${toConfirm} por confirmar` : 'Todo confirmado'}</small></button>
          <button onClick={() => goTo('pedidos', 'abiertos')}><span>Pedidos por atender</span><strong>{openOrders.length}</strong><small>Pendientes o preparando</small></button>
          <button onClick={() => goTo('facturas', 'porcobrar')}><span>Por cobrar</span><strong>{money(pendingBalance)}</strong><small>Saldos pendientes</small></button>
          <button onClick={() => goTo('facturas', 'pagadas')}><span>Cobrado este mes</span><strong>{money(collectedMonth)}</strong><small>Suma de abonos</small></button>
        </div>

        {!pushReady && <button className="push-reminder" onClick={() => goTo('app')}><BellRing /><div><strong>Activa los avisos en este teléfono</strong><small>Te llega una notificación con cada cita y pedido nuevo, aunque la app esté cerrada.</small></div><ChevronRight size={18} /></button>}

        {/* Menú en cuadritos (en el teléfono): todas las secciones a un toque. */}
        <div className="tile-menu">{tabs.filter((item) => item.id !== 'resumen').map((item) => <button key={item.id} onClick={() => goTo(item.id)}>{item.icon}<span>{item.label}</span>{!!item.badge && <b className="nav-badge">{item.badge}</b>}</button>)}</div>

        <h3 className="dash-subtitle">Acciones rápidas</h3>
        <div className="quick-actions">
          <button onClick={() => setBookingDraft(newBooking())} disabled={!services.length}><CalendarPlus />Nueva cita</button>
          <button onClick={() => { goTo('catalogo'); setCatalogKind('producto'); setEditing(blankProduct('producto')) }}><PlusCircle />Nuevo producto</button>
          <button onClick={() => { goTo('catalogo'); setCatalogKind('servicio'); setEditing(blankProduct('servicio')) }}><Scissors />Nuevo servicio</button>
          <button onClick={() => { goTo('clientes'); setEditingCustomer(blankCustomer) }}><UserPlus />Nuevo cliente</button>
        </div>

        {lowStockProducts.length > 0 && <div className="admin-notice"><AlertTriangle size={16} /><div><strong>Quedan pocas unidades:</strong> {lowStockProducts.map((product) => `${product.name} (${product.stock})`).join(', ')}.</div><button onClick={() => { goTo('catalogo'); setCatalogKind('producto') }}>Revisar</button></div>}

        <div className="dashboard-columns">
          <section className="admin-card">
            <div className="card-title"><div><span>AGENDA</span><h2>Próximas citas</h2></div><button onClick={() => goTo('citas')}>Ver todas</button></div>
            <div className="agenda-list">{upcomingAppointments.slice(0, 6).map((item) => <AgendaRow key={item.id} item={item} onOpen={() => setViewingAppointment(item)} />)}{!upcomingAppointments.length && <div className="empty-admin small"><Calendar /><p>No hay citas próximas.</p></div>}</div>
          </section>
          <section className="admin-card">
            <div className="card-title"><div><span>PEDIDOS</span><h2>Por atender</h2></div><button onClick={() => goTo('pedidos')}>Ver todos</button></div>
            <div className="agenda-list">{openOrders.slice(0, 6).map((order) => <button key={order.id} className="agenda-row" onClick={() => setViewingOrder(order)}><div className="agenda-when"><strong>{shortDate(order.createdAt).split(' ').slice(0, 2).join(' ')}</strong><small>{order.items.reduce((sum, line) => sum + line.quantity, 0)} art.</small></div><div className="agenda-info"><strong>{order.customerName}</strong><small>{order.items.map((line) => line.name).join(', ')}</small></div><div className="agenda-side"><strong>{money(order.total)}</strong><span className={`status-pill status-${order.status.toLowerCase()}`}>{order.status}</span></div></button>)}{!openOrders.length && <div className="empty-admin small"><Package /><p>No hay pedidos pendientes.</p></div>}</div>
          </section>
        </div>
      </div>}

      {tab === 'citas' && <section className="admin-card">
        <div className="card-title"><div><span>AGENDA</span><h2>{filteredAppointments.length} {filteredAppointments.length === 1 ? 'cita' : 'citas'}</h2></div><button className="admin-action" disabled={!services.length} onClick={() => setBookingDraft(newBooking())}><PlusCircle />Nueva cita</button></div>
        {chips([['', 'Próximas'], ['hoy', 'Hoy', todayAppointments.length], ['pendientes', 'Por confirmar', toConfirm], ['pasadas', 'Pasadas y cerradas'], ['todas', 'Todas']])}
        {searchBox("Buscar por clienta, servicio, teléfono o número…")}
        <AppointmentTable appointments={filteredAppointments} onChange={(item, status, paymentStatus) => changeStatus('appointment', item, status, paymentStatus)} onOpen={setViewingAppointment} />
      </section>}

      {tab === 'pedidos' && <section className="admin-card">
        <div className="card-title"><div><span>PRODUCTOS VENDIDOS</span><h2>{filteredOrders.length} {filteredOrders.length === 1 ? 'pedido' : 'pedidos'}</h2></div></div>
        {chips([['', 'Todos'], ['abiertos', 'Por atender', openOrders.length], ['sinpagar', 'Sin pagar'], ['enviados', 'Enviados y entregados'], ['cancelados', 'Cancelados']])}
        {searchBox("Buscar por clienta, teléfono o número de pedido…")}
        <OrderTable orders={filteredOrders} onChange={(order, status, paymentStatus) => changeStatus('order', order, status, paymentStatus)} onOpen={setViewingOrder} />
      </section>}

      {tab === 'facturas' && <section className="admin-card">
        <div className="card-title"><div><span>COBRANZA</span><h2>{filteredInvoices.length} {filteredInvoices.length === 1 ? 'factura' : 'facturas'}</h2></div></div>
        <p className="section-help">Cada pedido y cada cita crea su factura sola. Aquí registras los abonos (pagos parciales) y descargas o compartes la factura. Si marcas un pedido o cita como "Pagado", la factura se salda sola.</p>
        {chips([['', 'Todas'], ['porcobrar', 'Por cobrar', openInvoices.filter((invoice) => invoice.paid < invoice.total).length], ['pagadas', 'Pagadas'], ['anuladas', 'Anuladas']])}
        {searchBox("Buscar por folio, clienta o concepto…")}
        <div className="table-wrap"><table><thead><tr><th>Folio</th><th>Cliente</th><th>Concepto</th><th>Fecha</th><th>Total</th><th>Abonado</th><th>Saldo</th><th>Estado</th><th /></tr></thead><tbody>{filteredInvoices.map((invoice) => {
          const saldo = Math.max(invoice.total - invoice.paid, 0)
          return <tr key={invoice.id}>
            <td data-label="Folio"><strong>{invoice.folio}</strong></td>
            <td data-label="Cliente">{invoice.customerName}<small>{invoice.phone}</small></td>
            <td data-label="Concepto">{invoice.concept}</td>
            <td data-label="Fecha">{shortDate(invoice.createdAt)}</td>
            <td data-label="Total">{money(invoice.total)}</td>
            <td data-label="Abonado">{money(invoice.paid)}</td>
            <td data-label="Saldo">{invoice.status === 'Cancelada' ? <span className="muted-text">Anulada</span> : <strong className={saldo > 0 ? 'balance-due' : 'balance-clear'}>{money(saldo)}</strong>}</td>
            <td data-label="Estado"><span className={`status-pill status-${invoice.status.toLowerCase()}`}>{invoice.status}</span></td>
            <td className="col-actions"><div className="row-actions">
              {saldo > 0 && invoice.status !== 'Cancelada' && <button className="labeled" title="Registrar abono" onClick={() => { setError(''); setPayingInvoice(invoice) }}><Wallet /><span>Abonar</span></button>}
              <button title="Ver factura" onClick={() => setViewingInvoice(invoice)}><ReceiptText /></button>
              {invoice.status !== 'Cancelada' && <button title="Anular factura" onClick={async () => {
                const message = invoice.paid > 0
                  ? `La factura ${invoice.folio} ya tiene ${money(invoice.paid)} en abonos registrados. Anularla no borra ese historial, pero la factura pasará a estado "Cancelada" y dejará de contar como saldo pendiente. ¿Confirmas la anulación?`
                  : `¿Anular la factura ${invoice.folio}?`
                if (!confirm(message)) return
                await run(() => cancelInvoice({ data: { id: invoice.id, force: invoice.paid > 0 } }), 'Factura anulada.')
              }}><Ban /></button>}
            </div></td>
          </tr>
        })}</tbody></table>{!filteredInvoices.length && <div className="empty-admin">No hay facturas en esta lista.</div>}</div>
      </section>}

      {tab === 'catalogo' && <section className="admin-card">
        <div className="card-title"><div><span>LO QUE OFRECES</span><h2>{filteredProducts.length} {catalogKind === 'servicio' ? (filteredProducts.length === 1 ? 'servicio' : 'servicios') : (filteredProducts.length === 1 ? 'producto' : 'productos')}</h2></div><button className="admin-action" onClick={() => { setError(''); setEditing(blankProduct(catalogKind)) }}><PlusCircle />{catalogKind === 'servicio' ? 'Nuevo servicio' : 'Nuevo producto'}</button></div>
        <div className="segmented"><button className={catalogKind === 'servicio' ? 'active' : ''} onClick={() => setCatalogKind('servicio')}><Scissors size={15} />Servicios <b>{services.length}</b></button><button className={catalogKind === 'producto' ? 'active' : ''} onClick={() => setCatalogKind('producto')}><Package size={15} />Productos <b>{data.products.length - services.length}</b></button></div>
        {searchBox("Buscar por nombre o categoría…")}
        <div className="admin-product-list">{filteredProducts.map((product) => <article key={product.id} className={product.active ? '' : 'is-hidden'}>
          <img src={product.image || '/placeholder.png'} alt="" loading="lazy" />
          <div><span>{product.category}{product.featured && ' · Destacado'}{!product.active && ' · Oculto'}</span><h3>{product.name}</h3><p><strong>{money(product.price)}</strong> · {product.kind === 'servicio' ? <><Clock size={12} /> {product.durationMinutes} min</> : <span className={product.stock === 0 ? 'stock-tag out' : product.stock <= 5 ? 'stock-tag low' : 'stock-tag'}>{product.stock === 0 ? 'Agotado' : `${product.stock} disponibles`}</span>}</p></div>
          <div className="row-actions">
            <button title={product.active ? 'Ocultar de la tienda' : 'Mostrar en la tienda'} onClick={() => run(() => saveProduct({ data: { ...product, active: !product.active } }), product.active ? 'Oculto de la tienda.' : 'Visible en la tienda.')}>{product.active ? <Eye /> : <EyeOff />}</button>
            <button title="Editar" onClick={() => { setError(''); setEditing(product) }}><Pencil /></button>
            <button title="Eliminar" onClick={() => { if (confirm(`¿Enviar "${product.name}" a la papelera? Podrás restaurarlo durante 30 días.`)) run(() => deleteProduct({ data: product.id }), 'Enviado a la papelera.') }}><Trash2 /></button>
          </div>
        </article>)}{!filteredProducts.length && <div className="empty-admin">{q ? 'No hay resultados para esa búsqueda.' : catalogKind === 'servicio' ? 'Todavía no hay servicios. Crea el primero.' : 'Todavía no hay productos. Crea el primero.'}</div>}</div>
      </section>}

      {tab === 'clientes' && <section className="admin-card">
        <div className="card-title"><div><span>COMUNIDAD</span><h2>{filteredCustomers.length} {filteredCustomers.length === 1 ? 'cliente' : 'clientes'}</h2></div><button className="admin-action" onClick={() => { setError(''); setEditingCustomer(blankCustomer) }}><UserPlus />Nuevo cliente</button></div>
        <p className="section-help">Las clientas se guardan solas cuando hacen un pedido o agendan una cita.</p>
        {searchBox("Buscar por nombre, correo o teléfono…")}
        <div className="customer-grid">{filteredCustomers.map((customer) => {
          const ordersCount = data.orders.filter((order) => order.customerId === customer.id).length
          const appointmentsCount = data.appointments.filter((item) => item.customerId === customer.id).length
          const owed = data.invoices.filter((invoice) => invoice.customerId === customer.id && invoice.status !== 'Cancelada').reduce((sum, invoice) => sum + Math.max(invoice.total - invoice.paid, 0), 0)
          const wa = waLink(customer.phone, `Hola ${customer.name.split(' ')[0]}, te escribimos de ELA.`)
          return <article key={customer.id}><div className="customer-card-top"><div className="avatar">{customer.name.slice(0, 2).toUpperCase()}</div><div className="row-actions">{wa && <a className="wa-button" href={wa} target="_blank" rel="noreferrer" title="Escribir por WhatsApp"><MessageCircle /></a>}<button title="Editar" onClick={() => { setError(''); setEditingCustomer(customer) }}><Pencil /></button><button title="Eliminar" onClick={() => { if (confirm(`¿Enviar a ${customer.name} a la papelera? Podrás restaurarlo durante 30 días.`)) run(() => deleteCustomer({ data: customer.id }), 'Enviado a la papelera.') }}><Trash2 /></button></div></div><h3>{customer.name}</h3>{customer.phone && <p>{customer.phone}</p>}{customer.email && <a href={`mailto:${customer.email}`}>{customer.email}</a>}{customer.address && <p>{customer.address}</p>}{customer.notes && <small className="customer-notes">{customer.notes}</small>}<small>{ordersCount} {ordersCount === 1 ? 'pedido' : 'pedidos'} · {appointmentsCount} {appointmentsCount === 1 ? 'cita' : 'citas'}{owed > 0 && <> · <em className="balance-due">debe {money(owed)}</em></>}</small></article>
        })}{!filteredCustomers.length && <div className="empty-admin">No hay clientes que mostrar.</div>}</div>
      </section>}

      {tab === 'contenido' && <ContentEditor values={contentDraft} dirty={contentDirty} onChange={(next) => { setContentDraft(next); setContentDirty(true) }} onUpload={(file) => uploadImage(file, 'hero')} onSave={saveSiteContent} busy={busy} uploading={uploading} />}

      {tab === 'app' && <div className="dashboard"><AppAndNotifications /><div className="admin-card app-help"><h3>¿Cómo funciona?</h3><ol><li>Toca <b>Instalar app</b>: queda un ícono "ELA Admin" en tu teléfono, como cualquier otra app.</li><li>Toca <b>Activar notificaciones</b> y luego <b>Permitir</b>.</li><li>Cada vez que una clienta agende una cita o haga un pedido en la web, te suena el teléfono. Al tocar el aviso se abre la app en Citas o Pedidos.</li></ol><p>Si otra persona también atiende la tienda, que entre al panel desde su teléfono y haga lo mismo.</p></div></div>}

      {tab === 'papelera' && <TrashPanel trash={data.trash} onRestore={restoreItem} onPurge={purgeItem} />}
    </main>

    <div className="toast-stack" aria-live="polite">{toasts.map((toast) => <div key={toast.id} className={`toast toast-${toast.kind}`}>{toast.kind === 'ok' ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}<span>{toast.text}</span></div>)}</div>

    {editing && <div className="modal-wrap" onClick={() => setEditing(null)}><form className="product-modal" onSubmit={handleProduct} onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setEditing(null)} aria-label="Cerrar">×</button><span>CATÁLOGO</span><h2>{editing.id ? `Editar ${editing.kind === 'servicio' ? 'servicio' : 'producto'}` : editing.kind === 'servicio' ? 'Nuevo servicio' : 'Nuevo producto'}</h2>{error && <p className="form-error">{error}</p>}
      <div className="form-grid">
        <div className="wide image-picker">
          <div className="image-preview">{editing.image ? <img src={editing.image} alt="" /> : <ImagePlus />}</div>
          <div>
            <label className="upload-zone"><ImagePlus />{uploading ? 'Subiendo foto...' : editing.image ? 'Cambiar foto' : 'Subir foto'}<input hidden disabled={uploading} type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && uploadImage(event.target.files[0], 'product')} /></label>
            <details className="url-details"><summary>O pegar el enlace de una imagen</summary><input value={editing.image} onChange={(event) => setEditing({ ...editing, image: event.target.value })} placeholder="https://..." /></details>
          </div>
        </div>
        <label>Tipo<select value={editing.kind} onChange={(event) => setEditing({ ...editing, kind: event.target.value })}><option value="servicio">Servicio (se agenda una cita)</option><option value="producto">Producto (se compra)</option></select></label>
        <label>Categoría<input required list="category-options" placeholder={editing.kind === 'servicio' ? 'Cejas, Pestañas...' : 'Jabones, Mantequillas...'} value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value })} /><datalist id="category-options">{Array.from(new Set(data.products.filter((product) => product.kind === editing.kind).map((product) => product.category))).map((category) => <option key={category} value={category} />)}</datalist></label>
        <label className="wide">Nombre<input required value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>
        <label className="wide">Descripción<textarea required rows={3} value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} /></label>
        <label>Precio (RD$)<input required type="number" inputMode="decimal" min="0" step="0.01" value={editing.price / 100} onChange={(event) => setEditing({ ...editing, price: Math.round(Number(event.target.value) * 100) })} /></label>
        {editing.kind === 'producto' ? <label>Unidades disponibles<input required type="number" inputMode="numeric" min="0" value={editing.stock} onChange={(event) => setEditing({ ...editing, stock: Number(event.target.value) })} /></label> : <label>Duración (minutos)<input required type="number" inputMode="numeric" min="5" step="5" value={editing.durationMinutes} onChange={(event) => setEditing({ ...editing, durationMinutes: Number(event.target.value) })} /></label>}
        <label className="check-field"><input type="checkbox" checked={editing.active} onChange={(event) => setEditing({ ...editing, active: event.target.checked })} />Visible en la tienda</label>
        <label className="check-field"><input type="checkbox" checked={editing.featured} onChange={(event) => setEditing({ ...editing, featured: event.target.checked })} />Destacado (sale primero)</label>
      </div>
      <button className="primary-button full" disabled={busy || uploading}><Save />{busy ? 'Guardando...' : 'Guardar'}</button>
    </form></div>}

    {editingCustomer && <div className="modal-wrap" onClick={() => setEditingCustomer(null)}><form className="product-modal" onSubmit={handleCustomer} onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setEditingCustomer(null)} aria-label="Cerrar">×</button><span>COMUNIDAD</span><h2>{editingCustomer.id ? 'Editar cliente' : 'Registrar cliente'}</h2>{error && <p className="form-error">{error}</p>}<div className="form-grid"><label>Nombre completo<input required value={editingCustomer.name} onChange={(event) => setEditingCustomer({ ...editingCustomer, name: event.target.value })} /></label><label>Teléfono<input required type="tel" inputMode="tel" value={editingCustomer.phone} onChange={(event) => setEditingCustomer({ ...editingCustomer, phone: event.target.value })} /></label><label>Correo<input type="email" value={editingCustomer.email} onChange={(event) => setEditingCustomer({ ...editingCustomer, email: event.target.value })} /></label><label>Dirección<input value={editingCustomer.address} onChange={(event) => setEditingCustomer({ ...editingCustomer, address: event.target.value })} /></label><label className="wide">Notas<textarea rows={3} placeholder="Ej. alérgica a..., prefiere las tardes" value={editingCustomer.notes} onChange={(event) => setEditingCustomer({ ...editingCustomer, notes: event.target.value })} /></label></div><button className="primary-button full" disabled={busy}><Save />{busy ? 'Guardando...' : 'Guardar cliente'}</button></form></div>}

    {bookingDraft && <div className="modal-wrap" onClick={() => setBookingDraft(null)}><form className="product-modal" onSubmit={handleBooking} onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setBookingDraft(null)} aria-label="Cerrar">×</button><span>AGENDA</span><h2>Nueva cita</h2>{error && <p className="form-error">{error}</p>}
      <div className="form-grid">
        <label className="wide">Servicio<select required value={bookingDraft.serviceId} onChange={(event) => setBookingDraft({ ...bookingDraft, serviceId: Number(event.target.value) })}>{services.map((service) => <option key={service.id} value={service.id}>{service.name} — {money(service.price)}</option>)}</select></label>
        <label>Nombre de la clienta<input required list="customer-options" value={bookingDraft.name} onChange={(event) => {
          const name = event.target.value
          const match = data.customers.find((customer) => customer.name === name)
          setBookingDraft({ ...bookingDraft, name, ...(match ? { phone: match.phone, email: match.email } : {}) })
        }} /><datalist id="customer-options">{data.customers.map((customer) => <option key={customer.id} value={customer.name} />)}</datalist></label>
        <label>Teléfono<input required type="tel" inputMode="tel" value={bookingDraft.phone} onChange={(event) => setBookingDraft({ ...bookingDraft, phone: event.target.value })} /></label>
        <label>Fecha<input required type="date" value={bookingDraft.date} onChange={(event) => setBookingDraft({ ...bookingDraft, date: event.target.value })} /></label>
        <label>Hora<input required type="time" value={bookingDraft.time} onChange={(event) => setBookingDraft({ ...bookingDraft, time: event.target.value })} /></label>
        <label className="wide">Correo (opcional)<input type="email" value={bookingDraft.email} onChange={(event) => setBookingDraft({ ...bookingDraft, email: event.target.value })} /></label>
        <label className="wide">Notas<textarea rows={2} value={bookingDraft.notes} onChange={(event) => setBookingDraft({ ...bookingDraft, notes: event.target.value })} /></label>
      </div>
      <button className="primary-button full" disabled={busy}><Save />{busy ? 'Guardando...' : 'Agendar cita'}</button>
    </form></div>}

    {payingInvoice && <div className="modal-wrap" onClick={() => setPayingInvoice(null)}><form className="product-modal" onSubmit={handlePayment} onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setPayingInvoice(null)} aria-label="Cerrar">×</button><span>ABONO</span><h2>Registrar abono</h2>
      <p className="invoice-summary">{payingInvoice.folio} · {payingInvoice.customerName} · Saldo pendiente: <strong>{money(Math.max(payingInvoice.total - payingInvoice.paid, 0))}</strong></p>
      {error && <p className="form-error">{error}</p>}
      <div className="form-grid">
        <label>Monto (RD$)<input required type="number" inputMode="decimal" min="0.01" max={Math.max(payingInvoice.total - payingInvoice.paid, 0) / 100} step="0.01" name="amount" defaultValue={Math.max(payingInvoice.total - payingInvoice.paid, 0) / 100} autoFocus /></label>
        <label>Método<select name="method" defaultValue="Efectivo"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option></select></label>
        <label className="wide">Nota (opcional)<input name="note" placeholder="Ej. abono inicial" /></label>
      </div>
      <button className="primary-button full" disabled={busy}><Save />{busy ? 'Guardando...' : 'Registrar abono'}</button>
    </form></div>}

    {viewingOrder && <OrderDetail order={viewingOrder} invoice={findInvoiceFor('pedido', viewingOrder.id)} onClose={() => setViewingOrder(null)} onInvoice={(invoice) => { setViewingOrder(null); setViewingInvoice(invoice) }} onDelete={() => sendToTrash('order', viewingOrder, viewingOrder.orderNumber)} onChange={async (status, paymentStatus) => { await changeStatus('order', viewingOrder, status, paymentStatus); setViewingOrder(null) }} />}
    {viewingAppointment && <AppointmentDetail item={viewingAppointment} invoice={findInvoiceFor('cita', viewingAppointment.id)} onClose={() => setViewingAppointment(null)} onInvoice={(invoice) => { setViewingAppointment(null); setViewingInvoice(invoice) }} onDelete={() => sendToTrash('appointment', viewingAppointment, viewingAppointment.appointmentNumber)} onChange={async (status, paymentStatus) => { await changeStatus('appointment', viewingAppointment, status, paymentStatus); setViewingAppointment(null) }} />}
    {viewingInvoice && <InvoiceViewer invoice={viewingInvoice} payments={paymentsFor(viewingInvoice.id)} onClose={() => setViewingInvoice(null)} onPay={() => { setError(''); setPayingInvoice(viewingInvoice); setViewingInvoice(null) }} />}
  </div>
}

function AgendaRow({ item, onOpen }: { item: Appointment; onOpen: () => void }) {
  return <button className="agenda-row" onClick={onOpen}>
    <div className="agenda-when"><strong>{niceDate(item.date)}</strong><small>{niceTime(item.time)}</small></div>
    <div className="agenda-info"><strong>{item.customerName}</strong><small>{item.serviceName}</small></div>
    <div className="agenda-side"><strong>{money(item.price)}</strong><span className={`status-pill status-${item.status.toLowerCase()}`}>{item.status}</span></div>
  </button>
}

function StatusSelect({ value, options, onChange, label }: { value: string; options: string[]; onChange: (value: string) => void; label: string }) {
  return <select aria-label={label} className={`status-select status-${value.toLowerCase()}`} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select>
}

function OrderTable({ orders, onChange, onOpen }: { orders: Order[]; onChange: (order: Order, status: string, paymentStatus: string) => void; onOpen: (order: Order) => void }) {
  return <div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Artículos</th><th>Estado</th><th>Pago</th><th>Total</th><th /></tr></thead><tbody>{orders.map((order) => <tr key={order.id}>
    <td data-label="Pedido"><strong>{order.orderNumber}</strong><small>{shortDate(order.createdAt)}</small></td>
    <td data-label="Cliente">{order.customerName}<small>{order.phone}</small></td>
    <td data-label="Artículos">{order.items.map((line) => `${line.quantity} × ${line.name}`).join(', ')}</td>
    <td data-label="Estado"><StatusSelect label="Estado del pedido" value={order.status} options={ORDER_STATUSES} onChange={(status) => onChange(order, status, order.paymentStatus)} /></td>
    <td data-label="Pago"><StatusSelect label="Pago del pedido" value={order.paymentStatus} options={PAYMENT_STATUSES} onChange={(paymentStatus) => onChange(order, order.status, paymentStatus)} /></td>
    <td data-label="Total"><strong>{money(order.total)}</strong></td>
    <td className="col-actions"><div className="row-actions"><ContactButton phone={order.phone} text={`Hola ${order.customerName.split(' ')[0]}, te escribimos de ELA sobre tu pedido ${order.orderNumber}.`} /><button className="labeled" title="Ver detalle" onClick={() => onOpen(order)}><Eye /><span>Ver</span></button></div></td>
  </tr>)}</tbody></table>{!orders.length && <div className="empty-admin">No hay pedidos en esta lista.</div>}</div>
}

function AppointmentTable({ appointments, onChange, onOpen }: { appointments: Appointment[]; onChange: (item: Appointment, status: string, paymentStatus: string) => void; onOpen: (item: Appointment) => void }) {
  return <div className="table-wrap"><table><thead><tr><th>Fecha y hora</th><th>Clienta</th><th>Servicio</th><th>Estado</th><th>Pago</th><th>Precio</th><th /></tr></thead><tbody>{appointments.map((item) => <tr key={item.id}>
    <td data-label="Fecha y hora"><strong>{niceDate(item.date)} · {niceTime(item.time)}</strong><small>{item.appointmentNumber}</small></td>
    <td data-label="Clienta">{item.customerName}<small>{item.phone}</small></td>
    <td data-label="Servicio">{item.serviceName}{item.notes && <small>Nota: {item.notes}</small>}</td>
    <td data-label="Estado"><StatusSelect label="Estado de la cita" value={item.status} options={APPOINTMENT_STATUSES} onChange={(status) => onChange(item, status, item.paymentStatus)} /></td>
    <td data-label="Pago"><StatusSelect label="Pago de la cita" value={item.paymentStatus} options={PAYMENT_STATUSES} onChange={(paymentStatus) => onChange(item, item.status, paymentStatus)} /></td>
    <td data-label="Precio"><strong>{money(item.price)}</strong></td>
    <td className="col-actions"><div className="row-actions"><ContactButton phone={item.phone} text={`Hola ${item.customerName.split(' ')[0]}, te escribimos de ELA para confirmar tu cita de ${item.serviceName} el ${niceDate(item.date).toLowerCase()} a las ${niceTime(item.time)}.`} /><button className="labeled" title="Ver detalle" onClick={() => onOpen(item)}><Eye /><span>Ver</span></button></div></td>
  </tr>)}</tbody></table>{!appointments.length && <div className="empty-admin">No hay citas en esta lista.</div>}</div>
}

function ContactButton({ phone, text }: { phone: string; text: string }) {
  const href = waLink(phone, text)
  if (!href) return null
  return <a className="wa-button" href={href} target="_blank" rel="noreferrer" title="Escribir por WhatsApp"><MessageCircle /></a>
}

function DetailFooter({ invoice, onInvoice, onDelete }: { invoice: Invoice | null; onInvoice: (invoice: Invoice) => void; onDelete: () => void }) {
  return <div className="detail-footer">
    {invoice && <button className="admin-action" onClick={() => onInvoice(invoice)}><ReceiptText />Factura {invoice.folio}</button>}
    <button className="text-danger" onClick={onDelete}><Trash2 size={15} />Enviar a la papelera</button>
  </div>
}

function OrderDetail({ order, invoice, onClose, onInvoice, onDelete, onChange }: { order: Order; invoice: Invoice | null; onClose: () => void; onInvoice: (invoice: Invoice) => void; onDelete: () => void; onChange: (status: string, paymentStatus: string) => void }) {
  const wa = waLink(order.phone, `Hola ${order.customerName.split(' ')[0]}, te escribimos de ELA sobre tu pedido ${order.orderNumber}.`)
  return <div className="modal-wrap" onClick={onClose}><div className="modal-card detail-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close icon-button" onClick={onClose} aria-label="Cerrar"><X /></button>
    <span className="drawer-kicker">PEDIDO {order.orderNumber} · {shortDate(order.createdAt)}</span>
    <h2>{order.customerName}</h2>
    <div className="detail-contact">{order.phone && <a href={`tel:${order.phone}`}>{order.phone}</a>}{order.email && <a href={`mailto:${order.email}`}>{order.email}</a>}{order.address && <p><MapPin size={14} />{order.address}</p>}</div>
    {wa && <a className="wa-cta" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={18} />Escribirle por WhatsApp</a>}
    <div className="detail-lines">{order.items.map((line, index) => <div key={index}><span>{line.quantity} × {line.name}</span><strong>{money(line.price * line.quantity)}</strong></div>)}<div className="detail-total"><span>Total</span><strong>{money(order.total)}</strong></div></div>
    <div className="form-grid detail-status"><label>Estado<StatusSelect label="Estado" value={order.status} options={ORDER_STATUSES} onChange={(status) => onChange(status, order.paymentStatus)} /></label><label>Pago<StatusSelect label="Pago" value={order.paymentStatus} options={PAYMENT_STATUSES} onChange={(paymentStatus) => onChange(order.status, paymentStatus)} /></label></div>
    <DetailFooter invoice={invoice} onInvoice={onInvoice} onDelete={onDelete} />
  </div></div>
}

function AppointmentDetail({ item, invoice, onClose, onInvoice, onDelete, onChange }: { item: Appointment; invoice: Invoice | null; onClose: () => void; onInvoice: (invoice: Invoice) => void; onDelete: () => void; onChange: (status: string, paymentStatus: string) => void }) {
  const wa = waLink(item.phone, `Hola ${item.customerName.split(' ')[0]}, te escribimos de ELA para confirmar tu cita de ${item.serviceName} el ${niceDate(item.date).toLowerCase()} a las ${niceTime(item.time)}.`)
  return <div className="modal-wrap" onClick={onClose}><div className="modal-card detail-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close icon-button" onClick={onClose} aria-label="Cerrar"><X /></button>
    <span className="drawer-kicker">CITA {item.appointmentNumber}</span>
    <h2>{item.customerName}</h2>
    <div className="detail-contact">{item.phone && <a href={`tel:${item.phone}`}>{item.phone}</a>}{item.email && <a href={`mailto:${item.email}`}>{item.email}</a>}</div>
    {wa && <a className="wa-cta" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={18} />Confirmar por WhatsApp</a>}
    <div className="detail-lines"><div><span>{item.serviceName}</span><strong>{money(item.price)}</strong></div><div><span>Fecha</span><strong>{niceDate(item.date)} · {niceTime(item.time)}</strong></div>{item.notes && <div className="detail-note"><span>Notas de la clienta</span><p>{item.notes}</p></div>}</div>
    <div className="form-grid detail-status"><label>Estado<StatusSelect label="Estado" value={item.status} options={APPOINTMENT_STATUSES} onChange={(status) => onChange(status, item.paymentStatus)} /></label><label>Pago<StatusSelect label="Pago" value={item.paymentStatus} options={PAYMENT_STATUSES} onChange={(paymentStatus) => onChange(item.status, paymentStatus)} /></label></div>
    <DetailFooter invoice={invoice} onInvoice={onInvoice} onDelete={onDelete} />
  </div></div>
}

function InvoiceViewer({ invoice, payments, onClose, onPay }: { invoice: Invoice; payments: Payment[]; onClose: () => void; onPay: () => void }) {
  const [working, setWorking] = useState(false)
  const saldo = Math.max(invoice.total - invoice.paid, 0)
  const act = async (task: (lib: Awaited<ReturnType<typeof invoiceLib>>) => Promise<void>) => {
    setWorking(true)
    try { await task(await invoiceLib()) } catch { alert('No pudimos generar el documento. Intenta de nuevo.') } finally { setWorking(false) }
  }
  return <div className="modal-wrap" onClick={onClose}><div className="modal-card invoice-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close icon-button" onClick={onClose} aria-label="Cerrar"><X /></button>
    <span className="drawer-kicker">FACTURA {invoice.folio}</span>
    <h2>{invoice.customerName}</h2>
    <p className="invoice-summary">{invoice.concept} · <span className={`status-pill status-${invoice.status.toLowerCase()}`}>{invoice.status}</span></p>
    <div className="invoice-figures">
      <div><span>Total</span><strong>{money(invoice.total)}</strong></div>
      <div><span>Abonado</span><strong>{money(invoice.paid)}</strong></div>
      <div><span>Saldo</span><strong className={saldo > 0 ? 'balance-due' : 'balance-clear'}>{money(saldo)}</strong></div>
    </div>
    <div className="invoice-actions">
      {saldo > 0 && invoice.status !== 'Cancelada' && <button className="admin-action" onClick={onPay}><Wallet />Registrar abono</button>}
      <button className="admin-action ghost" disabled={working} onClick={() => act((lib) => lib.downloadInvoicePdf(invoice))}>{working ? <LoaderCircle className="spin" /> : <Download />}Descargar PDF</button>
      <button className="admin-action ghost" disabled={working} onClick={() => act((lib) => lib.shareInvoice(invoice))}><Share2 />Compartir</button>
    </div>
    {payments.length > 0 && <div className="payment-history"><h3>Historial de abonos</h3>{payments.map((payment) => <div key={payment.id} className="payment-row"><div><strong>{money(payment.amount)}</strong><span>{payment.method} · {shortDate(payment.createdAt)}{payment.note && ` · ${payment.note}`}</span></div><div className="row-actions"><button disabled={working} onClick={() => act((lib) => lib.downloadReceiptPdf(invoice, payment))}><Download size={15} />Recibo</button><button disabled={working} title="Compartir recibo" onClick={() => act((lib) => lib.shareReceipt(invoice, payment))}><Share2 size={15} /></button></div></div>)}</div>}
  </div></div>
}

function ContentEditor({ values, dirty, onChange, onUpload, onSave, busy, uploading }: { values: Record<string, string>; dirty: boolean; onChange: (value: Record<string, string>) => void; onUpload: (file: File) => void; onSave: () => Promise<void>; busy: boolean; uploading: boolean }) {
  const groups: Array<[string, string, string[]]> = [
    ['Portada', 'Lo primero que se ve al entrar a la tienda.', ['eyebrow', 'heroTitle', 'heroDescription', 'heroCta', 'heroImage']],
    ['Contacto y redes', 'Número de WhatsApp, horario, ubicación y redes sociales.', ['whatsapp', 'schedule', 'location', 'instagram', 'tiktok', 'footerText']],
    ['Servicios y productos', 'Títulos de las secciones del catálogo.', ['servicesTitle', 'servicesDescription', 'catalogTitle', 'catalogDescription']],
    ['Por qué elegirnos', 'Los tres beneficios de la marca.', ['benefitsTitle', 'benefit1Title', 'benefit1Text', 'benefit2Title', 'benefit2Text', 'benefit3Title', 'benefit3Text']],
    ['Nuestra historia', 'El texto de la marca al final de la página.', ['storyTitle', 'storyText']],
    ['Avisos por correo', 'A quién le llega un correo con cada pedido o cita nueva.', ['notificationEmail']],
    ['Marca y menú', 'Nombre, eslogan y las palabras del menú de arriba.', ['brandName', 'brandTagline', 'navServices', 'navCatalog', 'navBenefits', 'navContact']],
    ['Bolsa y formularios', 'Títulos de la bolsa de compras, el pedido y las citas.', ['cartTitle', 'checkoutTitle', 'appointmentTitle']],
  ]
  const labels: Record<string, string> = { brandName: 'Nombre de marca', brandTagline: 'Eslogan', navServices: 'Menú: servicios', navCatalog: 'Menú: productos', navBenefits: 'Menú: beneficios', navContact: 'Menú: contacto', eyebrow: 'Texto pequeño de arriba', heroTitle: 'Título principal', heroDescription: 'Descripción principal', heroCta: 'Texto del botón', heroImage: 'Foto de portada', benefitsTitle: 'Título de beneficios', benefit1Title: 'Beneficio 1 — título', benefit1Text: 'Beneficio 1 — texto', benefit2Title: 'Beneficio 2 — título', benefit2Text: 'Beneficio 2 — texto', benefit3Title: 'Beneficio 3 — título', benefit3Text: 'Beneficio 3 — texto', servicesTitle: 'Título de servicios', servicesDescription: 'Descripción de servicios', catalogTitle: 'Título de productos', catalogDescription: 'Descripción de productos', storyTitle: 'Título de la historia', storyText: 'Historia de la marca', footerText: 'Frase del pie de página', whatsapp: 'Número de WhatsApp', location: 'Ubicación', instagram: 'Instagram', tiktok: 'TikTok', schedule: 'Horario', cartTitle: 'Título de la bolsa', checkoutTitle: 'Título del formulario de pedido', appointmentTitle: 'Título del formulario de citas', notificationEmail: 'Correo para avisos' }
  const hints: Record<string, string> = {
    notificationEmail: 'Cada pedido o cita nueva envía un correo con los detalles a esta dirección. Este dato no se muestra en la tienda.',
    whatsapp: 'Solo números, con el 1 del país. Ej.: 18095551234',
    instagram: 'Con o sin @. Ej.: @ela.esencia',
    tiktok: 'Con o sin @. Ej.: @ela.esencia',
  }
  const longFields = ['heroDescription', 'storyText', 'catalogDescription', 'servicesDescription']
  return <section className="content-editor">
    <div className="editor-top"><div><span>TEXTOS E IMÁGENES</span><h2>Textos de la tienda</h2><p>Cambia lo que se lee en la web sin tocar el código. Los cambios se ven al guardar.</p></div></div>
    {groups.map(([title, description, keys], index) => <details className="editor-group" key={title} open={index < 2}>
      <summary><div><h3>{title}</h3><small>{description}</small></div><ChevronRight size={18} /></summary>
      <div className="editor-fields">{keys.map((key) => <label className={longFields.includes(key) || key === 'heroImage' ? 'wide' : ''} key={key}>{labels[key]}
        {key === 'heroImage' ? <div className="image-picker">
          <div className="image-preview wide-preview">{values.heroImage ? <img src={values.heroImage} alt="" /> : <ImageOff />}</div>
          <div><span className="upload-zone">{uploading ? 'Subiendo foto...' : <><ImagePlus />Cambiar foto</>}<input hidden disabled={uploading} type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && onUpload(event.target.files[0])} /></span>
            <details className="url-details"><summary>O pegar el enlace de una imagen</summary><input value={values.heroImage ?? ''} onChange={(event) => onChange({ ...values, heroImage: event.target.value })} /></details></div>
        </div>
          : longFields.includes(key) ? <textarea rows={3} value={values[key] ?? ''} onChange={(event) => onChange({ ...values, [key]: event.target.value })} />
          : <input type={key === 'notificationEmail' ? 'email' : 'text'} inputMode={key === 'whatsapp' ? 'tel' : undefined} placeholder={key === 'notificationEmail' ? 'correo@ejemplo.com' : undefined} value={values[key] ?? ''} onChange={(event) => onChange({ ...values, [key]: event.target.value })} />}
        {hints[key] && <small className="field-hint">{hints[key]}</small>}
      </label>)}</div>
    </details>)}
    <div className={`save-bar ${dirty ? 'visible' : ''}`}><span>{dirty ? 'Tienes cambios sin guardar' : 'Todo guardado'}</span><button className="admin-action" disabled={busy || !dirty} onClick={onSave}><Save />{busy ? 'Guardando...' : 'Guardar cambios'}</button></div>
  </section>
}

// ───────────────────────────────────────────────────────────────────────
// PAPELERA — muestra lo que se eliminó (productos/servicios, clientes,
// pedidos, citas) junto con los días que faltan para el borrado
// automático definitivo, y una sección aparte para las imágenes de
// productos reemplazadas/eliminadas que esperan su turno para borrarse de
// GitHub. Cada elemento se puede restaurar o eliminar ya mismo.
// ───────────────────────────────────────────────────────────────────────
function DaysLeftBadge({ daysLeft }: { daysLeft: number }) {
  return <span className={`status-pill ${daysLeft <= 5 ? 'status-cancelada' : 'status-pendiente'}`}>{daysLeft === 0 ? 'Se elimina hoy' : `${daysLeft} día${daysLeft === 1 ? '' : 's'} restante${daysLeft === 1 ? '' : 's'}`}</span>
}

function TrashPanel({ trash, onRestore, onPurge }: {
  trash: TrashData
  onRestore: (kind: 'product' | 'customer' | 'order' | 'appointment', id: number) => Promise<void>
  onPurge: (kind: 'product' | 'customer' | 'order' | 'appointment', id: number, label: string) => Promise<void>
}) {
  const isEmpty = !trash.products.length && !trash.customers.length && !trash.orders.length && !trash.appointments.length && !trash.images.length
  return <div className="dashboard">
    <div className="admin-notice"><AlertTriangle size={16} /><div>Lo que está aquí se borra solo 30 días después. Puedes restaurarlo antes, o borrarlo ya. Las facturas nunca llegan aquí: se anulan, pero se guardan siempre.</div></div>

    {isEmpty && <div className="admin-card"><div className="empty-admin"><Trash2 /><p>La papelera está vacía.</p></div></div>}

    {trash.products.length > 0 && <section className="admin-card">
      <div className="card-title"><div><span>CATÁLOGO</span><h2>{trash.products.length} artículos en papelera</h2></div></div>
      <div className="admin-product-list">{trash.products.map((product) => <article key={product.id}>
        <img src={product.image || '/placeholder.png'} alt="" loading="lazy" />
        <div><span>{product.kind === 'servicio' ? 'Servicio' : 'Producto'} · {product.category}</span><h3>{product.name}</h3><p><DaysLeftBadge daysLeft={product.daysLeft} /></p></div>
        <div className="row-actions">
          <button title="Restaurar" onClick={() => onRestore('product', product.id)}><RotateCcw /></button>
          <button title="Eliminar definitivamente" onClick={() => onPurge('product', product.id, `"${product.name}"`)}><Trash /></button>
        </div>
      </article>)}</div>
    </section>}

    {trash.orders.length > 0 && <section className="admin-card">
      <div className="card-title"><div><span>HISTORIAL</span><h2>{trash.orders.length} pedidos en papelera</h2></div></div>
      <div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Total</th><th>Plazo</th><th /></tr></thead><tbody>{trash.orders.map((order) => <tr key={order.id}>
        <td data-label="Pedido"><strong>{order.orderNumber}</strong></td>
        <td data-label="Cliente">{order.customerName}</td>
        <td data-label="Total">{money(order.total)}</td>
        <td data-label="Plazo"><DaysLeftBadge daysLeft={order.daysLeft} /></td>
        <td className="col-actions"><div className="row-actions">
          <button title="Restaurar" onClick={() => onRestore('order', order.id)}><RotateCcw /></button>
          <button title="Eliminar definitivamente" onClick={() => onPurge('order', order.id, `el pedido ${order.orderNumber}`)}><Trash /></button>
        </div></td>
      </tr>)}</tbody></table></div>
    </section>}

    {trash.appointments.length > 0 && <section className="admin-card">
      <div className="card-title"><div><span>AGENDA</span><h2>{trash.appointments.length} citas en papelera</h2></div></div>
      <div className="table-wrap"><table><thead><tr><th>Cita</th><th>Clienta</th><th>Servicio</th><th>Plazo</th><th /></tr></thead><tbody>{trash.appointments.map((item) => <tr key={item.id}>
        <td data-label="Cita"><strong>{item.appointmentNumber}</strong></td>
        <td data-label="Clienta">{item.customerName}</td>
        <td data-label="Servicio">{item.serviceName}</td>
        <td data-label="Plazo"><DaysLeftBadge daysLeft={item.daysLeft} /></td>
        <td className="col-actions"><div className="row-actions">
          <button title="Restaurar" onClick={() => onRestore('appointment', item.id)}><RotateCcw /></button>
          <button title="Eliminar definitivamente" onClick={() => onPurge('appointment', item.id, `la cita ${item.appointmentNumber}`)}><Trash /></button>
        </div></td>
      </tr>)}</tbody></table></div>
    </section>}

    {trash.customers.length > 0 && <section className="admin-card">
      <div className="card-title"><div><span>COMUNIDAD</span><h2>{trash.customers.length} clientes en papelera</h2></div></div>
      <div className="customer-grid">{trash.customers.map((customer) => <article key={customer.id}>
        <div className="customer-card-top"><div className="avatar">{customer.name.slice(0, 2).toUpperCase()}</div><div className="row-actions">
          <button title="Restaurar" onClick={() => onRestore('customer', customer.id)}><RotateCcw /></button>
          <button title="Eliminar definitivamente" onClick={() => onPurge('customer', customer.id, `a ${customer.name}`)}><Trash /></button>
        </div></div>
        <h3>{customer.name}</h3><p>{customer.phone}</p><DaysLeftBadge daysLeft={customer.daysLeft} />
      </article>)}</div>
    </section>}

    {trash.images.length > 0 && <section className="admin-card">
      <div className="card-title"><div><span>ARCHIVOS</span><h2>{trash.images.length} imágenes en papelera</h2></div></div>
      <p className="section-help"><ImageOff size={14} /> Estas fotos ya no se usan en ningún artículo y se borrarán solas al vencer el plazo.</p>
      <div className="admin-product-list">{trash.images.map((image) => <article key={image.id}>
        <img src={image.url} alt="" loading="lazy" />
        <div><span>{image.reason || 'Imagen reemplazada'}</span><h3>{image.path.split('/').pop()}</h3><p><DaysLeftBadge daysLeft={image.daysLeft} /></p></div>
      </article>)}</div>
    </section>}
  </div>
}
