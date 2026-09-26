import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, ArrowLeft, Ban, Bell, BellOff, BellRing, Boxes, Layers, PiggyBank, ShoppingCart, Calendar, CalendarPlus, Check, CheckCircle2, ChevronRight, Clock, Download, Eye, EyeOff, FileText, Home, ImageOff, ImagePlus, LoaderCircle, LogOut, MapPin, MessageCircle, MoreHorizontal, Package, Pencil, PlusCircle, ReceiptText, RotateCcw, Save, Scissors, Search, Share2, ShoppingBag, Smartphone, Trash, Trash2, UserPlus, Users, Wallet, X } from 'lucide-react'
import { cancelInvoice, checkSession, deleteAppointment, deleteCustomer, deleteInvoice, deleteOrder, deleteExpense, deleteProduct, deletePurchase, getAdminData, recordExpense, recordManualSale, recordPurchase, getPushSetup, login, logout, removePushSubscription, savePushSubscription, sendTestPush, purgeAppointment, purgeCustomer, purgeInvoice, purgeOrder, purgeProduct, registerPayment, restoreAppointment, restoreCustomer, restoreInvoice, restoreOrder, restoreProduct, saveAppointmentAdmin, saveContent, saveCustomer, saveProduct, updateAppointmentStatus, updateOrderStatus } from '@/lib/store'
import type { InvoiceLike, PaymentLike } from '@/lib/invoice'
import { compressImage } from '@/lib/image'
import { formatMoney } from '@/lib/money'
import { fromBase64Url } from '@/lib/push'

type Product = { id: number; kind: string; name: string; category: string; description: string; price: number; originalPrice: number; cost: number; stock: number; durationMinutes: number; image: string; featured: boolean; active: boolean }
type Purchase = { id: number; productId: number; productName: string; fund: string; quantity: number; unitCost: number; totalCost: number; remainingQuantity: number; notes: string; createdAt: string | Date }
type Expense = { id: number; type: string; description: string; amount: number; createdAt: string | Date }
type Order = { id: number; orderNumber: string; customerId: number | null; customerName: string; email: string; phone: string; address: string; total: number; status: string; paymentStatus: string; items: Array<{ id: number; name: string; price: number; quantity: number; cost?: number; reinvCost?: number; reinvQty?: number }>; createdAt: string | Date }
type Appointment = { id: number; appointmentNumber: string; customerId: number | null; customerName: string; phone: string; email: string; serviceId: number | null; serviceName: string; price: number; date: string; time: string; notes: string; status: string; paymentStatus: string; createdAt: string | Date }
type Customer = { id: number; name: string; email: string; phone: string; address: string; notes: string; createdAt: string | Date }
type Invoice = InvoiceLike & { sourceId: number; customerId: number | null }
type Doc = InvoiceLike
type Payment = PaymentLike & { id: number; invoiceId: number }
type TrashImage = { id: number; path: string; url: string; reason: string; deletedAt: string | Date; daysLeft: number }
type TrashData = {
  products: Array<Product & { daysLeft: number }>
  orders: Array<Order & { daysLeft: number }>
  appointments: Array<Appointment & { daysLeft: number }>
  customers: Array<Customer & { daysLeft: number }>
  images: TrashImage[]
  invoices: Array<Invoice & { daysLeft: number }>
}
type AdminData = { products: Product[]; orders: Order[]; appointments: Appointment[]; customers: Customer[]; invoices: Invoice[]; payments: Payment[]; purchases: Purchase[]; expenses: Expense[]; content: Record<string, string>; trash: TrashData }
type Tab = 'resumen' | 'citas' | 'pedidos' | 'facturas' | 'catalogo' | 'finanzas' | 'clientes' | 'contenido' | 'app' | 'papelera'
const TAB_IDS: Tab[] = ['resumen', 'citas', 'pedidos', 'facturas', 'catalogo', 'finanzas', 'clientes', 'contenido', 'app', 'papelera']
type CustomerDraft = { id?: number; name: string; email: string; phone: string; address: string; notes: string }
type ProductDraft = { id?: number; kind: string; name: string; category: string; description: string; price: number; originalPrice: number; stock: number; durationMinutes: number; image: string; featured: boolean; active: boolean }
type Fund = 'capital' | 'reinversion'
type PurchaseDraft = { productId: string; quantity: string; unitCost: string; fund: Fund; notes: string }
type SaleLine = { productId: string; quantity: string; price: string }
type SaleDraft = { customerName: string; phone: string; notes: string; paid: boolean; lines: SaleLine[] }
type ExpenseDraft = { type: 'negocio' | 'personal'; description: string; amount: string }
type CatalogFilter = 'todos' | 'agotados' | 'bajo' | 'sincosto' | 'ocultos'
const FUND_LABEL: Record<Fund, string> = { capital: 'Dinero del negocio', reinversion: 'Dinero para reinvertir' }
const LOW_STOCK = 3
const toCents = (value: string | number) => Math.round(Number(value || 0) * 100)
type AppointmentDraft = { name: string; phone: string; email: string; serviceId: number; date: string; time: string; notes: string }
type TrashKind = 'product' | 'customer' | 'order' | 'appointment' | 'invoice'
type Toast = { id: number; text: string; kind: 'ok' | 'error' }

// Mensaje que el servidor lanza cuando un pedido/cita tiene una factura
// relacionada con abonos ya registrados (ver `checkInvoiceForCancel` en
// src/lib/store.ts). Se usa para distinguir ese caso y pedir una
// confirmación especial en vez de mostrar el error tal cual.
const invoiceWarning = (message: string) => message.includes('factura relacionada')
const sessionExpired = (message: string) => message.includes('Debes iniciar sesión')
const errorText = (error: unknown, fallback = 'No pudimos completar la acción.') => error instanceof Error ? error.message : fallback

const money = formatMoney
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
const blankProduct = (kind = 'servicio'): ProductDraft => ({ kind, name: '', category: '', description: '', price: 0, originalPrice: 0, stock: 0, durationMinutes: 30, image: '', featured: false, active: true })
const blankCustomer: CustomerDraft = { name: '', email: '', phone: '', address: '', notes: '' }
const ORDER_STATUSES = ['Pendiente', 'Preparando', 'Enviado', 'Entregado', 'Cancelado']
const APPOINTMENT_STATUSES = ['Pendiente', 'Confirmada', 'Completada', 'Cancelada']
const PAYMENT_STATUSES = ['Pendiente', 'Pagado', 'Reembolsado']

// El módulo de facturas (jsPDF + html2canvas) pesa mucho: se carga solo
// cuando de verdad se descarga o comparte una factura.
const invoiceLib = () => import('@/lib/invoice')
// WhatsApp y ubicación de "Textos de la web", para que salgan en la factura.
let businessInfo: { whatsapp?: string; location?: string } = {}
/** Genera/descarga/comparte una factura o recibo. Muestra un aviso si falla. */
async function withInvoiceLib(task: (lib: Awaited<ReturnType<typeof invoiceLib>>) => Promise<void>) {
  try {
    const lib = await invoiceLib()
    lib.setInvoiceBusiness(businessInfo)
    await task(lib)
  } catch {
    alert('No pudimos generar el documento. Revisa el internet e intenta de nuevo.')
  }
}

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
  const [purchaseDraft, setPurchaseDraft] = useState<PurchaseDraft | null>(null)
  const [saleDraft, setSaleDraft] = useState<SaleDraft | null>(null)
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft | null>(null)
  const [lotsProductId, setLotsProductId] = useState<number | null>(null)
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>('todos')
  const [financeView, setFinanceView] = useState<'compras' | 'gastos'>('compras')
  const [financeSettings, setFinanceSettings] = useState({ capitalInicial: '0', reinvestPercent: '70' })

  function notify(text: string, kind: Toast['kind'] = 'ok') {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, text, kind }])
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), kind === 'error' ? 6000 : 3000)
  }

  async function refresh() {
    const result = await getAdminData()
    setData(result as unknown as AdminData)
    businessInfo = { whatsapp: result.content.whatsapp, location: result.content.location }
    setFinanceSettings({ capitalInicial: String(Number(result.content.capitalInicial || 0) / 100), reinvestPercent: String(Number(result.content.reinvestPercent ?? 70)) })
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
      setEditing(null); setEditingCustomer(null); setBookingDraft(null); setPayingInvoice(null); setViewingInvoice(null); setViewingOrder(null); setViewingAppointment(null); setMoreOpen(false); setPurchaseDraft(null); setSaleDraft(null); setExpenseDraft(null); setLotsProductId(null)
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
    try {
      const id = await saveProduct({ data: { ...editing, price: Number(editing.price), originalPrice: Number(editing.originalPrice || 0), stock: Number(editing.stock), durationMinutes: Number(editing.durationMinutes) } })
      const wasNew = !editing.id
      const newProduct = wasNew && editing.kind === 'producto'
      setEditing(null); await refresh()
      // Un producto nuevo empieza en 0: se abre «Reponer» para registrar
      // cuántas unidades compraste y a cuánto (igual que en JB).
      if (newProduct) { setPurchaseDraft({ productId: String(id), quantity: '', unitCost: '', fund: 'capital', notes: '' }); notify('Producto creado. Ahora registra cuántas compraste y a cuánto cada una.') }
      else notify(wasNew ? 'Servicio creado.' : 'Cambios guardados.')
    }
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

  async function restoreItem(kind: TrashKind, id: number) {
    const action = { product: restoreProduct, customer: restoreCustomer, order: restoreOrder, appointment: restoreAppointment, invoice: restoreInvoice }[kind]
    const message = kind === 'order' ? 'Pedido restaurado como "Cancelado". Cambia su estado para retomarlo.' : kind === 'appointment' ? 'Cita restaurada como "Cancelada". Cambia su estado para retomarla.' : 'Restaurado.'
    await run(() => action({ data: id }), message)
  }

  async function purgeItem(kind: TrashKind, id: number, label: string) {
    if (!confirm(`¿Eliminar definitivamente ${label}? Esta acción no se puede deshacer.`)) return
    const action = { product: purgeProduct, customer: purgeCustomer, order: purgeOrder, appointment: purgeAppointment, invoice: purgeInvoice }[kind]
    await run(() => action({ data: id }), 'Eliminado definitivamente.')
  }

  // ─── Compras, ventas por fuera, gastos (igual que en JB) ───
  function openPurchase(product?: Product) {
    setError(''); setLotsProductId(null)
    setPurchaseDraft({ productId: product ? String(product.id) : '', quantity: '', unitCost: product?.cost ? String(product.cost / 100) : '', fund: 'capital', notes: '' })
  }
  function openSale(product?: Product) {
    setError('')
    setSaleDraft({ customerName: '', phone: '', notes: '', paid: true, lines: [{ productId: product ? String(product.id) : '', quantity: '1', price: product ? String(product.price / 100) : '' }] })
  }
  async function handlePurchase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!purchaseDraft) return; setBusy(true); setError('')
    try {
      const result = await recordPurchase({ data: { productId: Number(purchaseDraft.productId), quantity: Math.round(Number(purchaseDraft.quantity)), unitCost: toCents(purchaseDraft.unitCost), fund: purchaseDraft.fund, notes: purchaseDraft.notes } })
      setPurchaseDraft(null); await refresh()
      notify(`Compra registrada por ${money(result.total)}${result.fund === 'reinversion' ? ' con el dinero para reinvertir' : ''}.`)
    } catch (caught) { setError(errorText(caught, 'No pudimos registrar la compra.')) }
    finally { setBusy(false) }
  }
  async function handleSale(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!saleDraft) return; setBusy(true); setError('')
    try {
      const result = await recordManualSale({ data: { customerName: saleDraft.customerName, phone: saleDraft.phone, notes: saleDraft.notes, paid: saleDraft.paid, items: saleDraft.lines.map((line) => ({ productId: Number(line.productId), quantity: Math.round(Number(line.quantity || 0)), price: toCents(line.price) })) } })
      setSaleDraft(null); await refresh()
      notify(`Venta ${result.orderNumber} registrada por ${money(result.total)}. Ya se descontó del inventario.`)
    } catch (caught) { setError(errorText(caught, 'No pudimos registrar la venta.')) }
    finally { setBusy(false) }
  }
  async function handleExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!expenseDraft) return; setBusy(true); setError('')
    try { await recordExpense({ data: { type: expenseDraft.type, description: expenseDraft.description, amount: toCents(expenseDraft.amount) } }); setExpenseDraft(null); await refresh(); notify('Gasto registrado.') }
    catch (caught) { setError(errorText(caught, 'No pudimos registrar el gasto.')) }
    finally { setBusy(false) }
  }
  async function confirmDeletePurchase(purchase: Purchase) {
    const sold = purchase.quantity - purchase.remainingQuantity
    const pocket = FUND_LABEL[purchase.fund === 'reinversion' ? 'reinversion' : 'capital']
    const message = sold > 0
      ? `De esta compra ya se vendieron ${sold}. Se quitarán solo las ${purchase.remainingQuantity} que quedan: salen del inventario y ${money(purchase.remainingQuantity * purchase.unitCost)} vuelven al ${pocket.toLowerCase()}. ¿Continuar?`
      : `¿Borrar esta compra? Se restan ${purchase.remainingQuantity} unidades del inventario y ${money(purchase.totalCost)} vuelven al ${pocket.toLowerCase()}.`
    if (!confirm(message)) return
    await run(() => deletePurchase({ data: purchase.id }), 'Compra borrada.')
  }
  async function saveFinanceSettings() {
    setBusy(true)
    await run(() => saveContent({ data: { capitalInicial: String(toCents(financeSettings.capitalInicial)), reinvestPercent: String(Math.min(100, Math.max(0, Math.round(Number(financeSettings.reinvestPercent || 0))))) } }), 'Configuración guardada.')
    setBusy(false)
  }

  async function annulInvoice(invoice: Invoice) {
    const message = invoice.paid > 0
      ? `La factura ${invoice.folio} ya tiene ${money(invoice.paid)} en abonos. Anularla no borra ese historial, pero dejará de contar como saldo pendiente. ¿La anulas?`
      : `¿Anular la factura ${invoice.folio}? Dejará de contar como saldo pendiente.`
    if (!confirm(message)) return
    await run(() => cancelInvoice({ data: { id: invoice.id, force: invoice.paid > 0 } }), 'Factura anulada.')
  }

  async function trashInvoice(invoice: Invoice) {
    const message = invoice.paid > 0
      ? `La factura ${invoice.folio} tiene ${money(invoice.paid)} en abonos. ¿Enviarla a la papelera de todas formas? Podrás restaurarla durante 30 días; después se borra con sus recibos.`
      : `¿Enviar la factura ${invoice.folio} a la papelera? Podrás restaurarla durante 30 días.`
    if (!confirm(message)) return
    setViewingInvoice(null)
    await run(() => deleteInvoice({ data: { id: invoice.id, force: invoice.paid > 0 } }), 'Factura enviada a la papelera.')
  }

  /** La factura con los artículos del pedido, para el PDF. */
  function docFor(invoice: Invoice): Doc {
    if (invoice.sourceType !== 'pedido') return invoice
    const order = data?.orders.find((item) => item.id === invoice.sourceId)
    return order ? { ...invoice, lines: order.items } : invoice
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

  // Unidades en existencia sin una compra registrada detrás: al venderse,
  // su costo cuenta como RD$0 y la ganancia sale más alta de lo real.
  const uncostedIds = useMemo(() => {
    const remaining = new Map<number, number>()
    for (const purchase of data?.purchases || []) remaining.set(purchase.productId, (remaining.get(purchase.productId) ?? 0) + purchase.remainingQuantity)
    return new Set((data?.products || []).filter((product) => product.kind === 'producto' && product.stock > (remaining.get(product.id) ?? 0) && product.cost === 0).map((product) => product.id))
  }, [data])
  const matchesCatalogFilter = (product: Product, filter: CatalogFilter) =>
    filter === 'todos' ? true : filter === 'agotados' ? product.stock === 0 : filter === 'bajo' ? product.stock > 0 && product.stock <= LOW_STOCK : filter === 'sincosto' ? uncostedIds.has(product.id) : !product.active
  const filteredProducts = useMemo(() => (data?.products || []).filter((product) => product.kind === catalogKind && has(product.name, product.category) && (catalogKind === 'servicio' || matchesCatalogFilter(product, catalogFilter))), [data, q, catalogKind, catalogFilter, uncostedIds])
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
  const visibleInvoiceIds = new Set(data.invoices.map((invoice) => invoice.id))
  const collectedMonth = data.payments.filter((payment) => visibleInvoiceIds.has(payment.invoiceId) && localIso(new Date(payment.createdAt)).startsWith(monthPrefix)).reduce((sum, payment) => sum + payment.amount, 0)
  const todayAppointments = data.appointments.filter((item) => item.date === today && item.status !== 'Cancelada').sort((a, b) => a.time.localeCompare(b.time))
  const upcomingAppointments = data.appointments.filter((item) => item.date >= today && item.status !== 'Cancelada' && item.status !== 'Completada').sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
  const toConfirm = upcomingAppointments.filter((item) => item.status === 'Pendiente').length
  const openOrders = data.orders.filter((order) => order.status === 'Pendiente' || order.status === 'Preparando')
  const lowStockProducts = data.products.filter((product) => product.kind === 'producto' && product.active && product.stock <= LOW_STOCK)
  const services = data.products.filter((product) => product.kind === 'servicio')
  const trashCount = data.trash.products.length + data.trash.orders.length + data.trash.appointments.length + data.trash.customers.length + data.trash.invoices.length
  // Las ventanas de detalle muestran siempre los datos al día (después de
  // cambiar un estado o registrar un abono, se ve el cambio sin cerrarlas).
  const liveOrder = viewingOrder ? data.orders.find((item) => item.id === viewingOrder.id) ?? null : null
  const liveAppointment = viewingAppointment ? data.appointments.find((item) => item.id === viewingAppointment.id) ?? null : null
  const liveInvoice = viewingInvoice ? data.invoices.find((item) => item.id === viewingInvoice.id) ?? null : null
  const invoiceBoxFor = (invoice: Invoice | null) => invoice ? <InvoiceBox invoice={invoice} doc={docFor(invoice)} payments={paymentsFor(invoice.id)} onPay={() => { setError(''); setPayingInvoice(invoice) }} /> : <p className="invoice-summary">Este registro no tiene factura.</p>
  const newBooking = (): AppointmentDraft => ({ name: '', phone: '', email: '', serviceId: services[0]?.id ?? 0, date: today, time: '10:00', notes: '' })

  // ─── Finanzas (mismas cuentas que JB Tech Store) ───
  // Solo cuentan pedidos y citas "Pagado" que no estén cancelados. `cost` de
  // cada línea es lo que costó esa unidad (sale de su lote de compra). Las
  // citas (servicios) no tienen costo de mercancía: todo es ganancia.
  const paidOrders = data.orders.filter((order) => order.paymentStatus === 'Pagado' && order.status !== 'Cancelado')
  const paidAppointments = data.appointments.filter((item) => item.paymentStatus === 'Pagado' && item.status !== 'Cancelada')
  const ventasProductos = paidOrders.reduce((sum, order) => sum + order.total, 0)
  const ventasServicios = paidAppointments.reduce((sum, item) => sum + item.price, 0)
  const ingresos = ventasProductos + ventasServicios
  const costoVentas = paidOrders.reduce((sum, order) => sum + order.items.reduce((acc, item) => acc + (item.cost ?? 0) * item.quantity, 0), 0)
  const gananciaBruta = ingresos - costoVentas
  // El «Dinero para reinvertir» es de la dueña, como su cartera: si compra
  // mercancía con él, al venderla lo que costó vuelve a esa caja y lo que
  // ganó es 100% suyo (va directo a «Puedes retirar», no se reparte).
  let ventasReinv = 0
  let recuperadoReinv = 0
  for (const order of paidOrders) for (const item of order.items) {
    const reinvQty = Math.min(item.quantity, Math.max(0, item.reinvQty ?? 0))
    if (!reinvQty) continue
    ventasReinv += item.price * reinvQty
    recuperadoReinv += item.reinvCost ?? 0
  }
  const gananciaPropia = ventasReinv - recuperadoReinv
  const gananciaNegocio = gananciaBruta - gananciaPropia
  const gastadoReinv = data.purchases.filter((purchase) => purchase.fund === 'reinversion').reduce((sum, purchase) => sum + purchase.totalCost, 0)
  const gastadoCapital = data.purchases.filter((purchase) => purchase.fund !== 'reinversion').reduce((sum, purchase) => sum + purchase.totalCost, 0)
  const recuperadoCapital = costoVentas - recuperadoReinv
  const capitalInicial = Number(data.content.capitalInicial || 0)
  const gastosNegocio = data.expenses.filter((expense) => expense.type === 'negocio').reduce((sum, expense) => sum + expense.amount, 0)
  const gastosPersonales = data.expenses.filter((expense) => expense.type === 'personal').reduce((sum, expense) => sum + expense.amount, 0)
  const capitalDisponible = capitalInicial - gastadoCapital + recuperadoCapital - gastosNegocio
  const reinvestPercent = Number(data.content.reinvestPercent ?? 70)
  const reinversion = Math.round((gananciaNegocio * reinvestPercent) / 100)
  const paraTi = gananciaNegocio - reinversion
  const dineroReinvertir = reinversion - gastadoReinv + recuperadoReinv
  const disponibleRetirar = paraTi + gananciaPropia - gastosPersonales
  const inventoryValue = data.purchases.reduce((sum, purchase) => sum + purchase.remainingQuantity * purchase.unitCost, 0)
  const unpaidOrders = data.orders.filter((order) => order.paymentStatus !== 'Pagado' && order.status !== 'Cancelado')
  const unpaidAppointments = data.appointments.filter((item) => item.paymentStatus !== 'Pagado' && item.status !== 'Cancelada' && item.status !== 'Pendiente')
  const porCobrar = unpaidOrders.reduce((sum, order) => sum + order.total, 0) + unpaidAppointments.reduce((sum, item) => sum + item.price, 0)
  const goods = data.products.filter((product) => product.kind === 'producto')
  const uncostedProducts = goods.filter((product) => uncostedIds.has(product.id))
  const lotsProduct = lotsProductId ? data.products.find((product) => product.id === lotsProductId) ?? null : null
  const purchaseProduct = purchaseDraft ? goods.find((product) => String(product.id) === purchaseDraft.productId) : undefined
  const purchaseTotal = purchaseDraft ? Math.round(Number(purchaseDraft.quantity || 0)) * toCents(purchaseDraft.unitCost) : 0

  const tabs: { id: Tab; label: string; hint: string; group: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'resumen', label: 'Inicio', hint: 'Lo más importante de hoy', group: 'Día a día', icon: <Home /> },
    { id: 'citas', label: 'Citas', hint: 'Agenda de servicios', group: 'Día a día', icon: <Calendar />, badge: toConfirm },
    { id: 'pedidos', label: 'Pedidos', hint: 'Compras de productos', group: 'Día a día', icon: <ShoppingBag />, badge: openOrders.length },
    { id: 'facturas', label: 'Cobros', hint: 'Facturas, abonos y saldos', group: 'Día a día', icon: <Wallet /> },
    { id: 'catalogo', label: 'Catálogo', hint: 'Servicios, productos y existencias', group: 'Tu tienda', icon: <Boxes />, badge: goods.filter((product) => product.active && product.stock <= LOW_STOCK).length },
    { id: 'finanzas', label: 'Finanzas', hint: 'Ganancia, compras, gastos y lo que puedes retirar', group: 'Tu tienda', icon: <PiggyBank /> },
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
  const orderCard = (order: Order) => <OrderCard key={order.id} order={order} invoice={findInvoiceFor('pedido', order.id)} onChange={(status, paymentStatus) => changeStatus('order', order, status, paymentStatus)} onOpen={() => setViewingOrder(order)} onInvoice={(invoice) => setViewingInvoice(invoice)} onDelete={() => sendToTrash('order', order, order.orderNumber)} />
  const appointmentCard = (item: Appointment) => <AppointmentCard key={item.id} item={item} invoice={findInvoiceFor('cita', item.id)} onChange={(status, paymentStatus) => changeStatus('appointment', item, status, paymentStatus)} onOpen={() => setViewingAppointment(item)} onInvoice={(invoice) => setViewingInvoice(invoice)} onDelete={() => sendToTrash('appointment', item, item.appointmentNumber)} />
  const chipsCatalog = () => <div className="filter-chips">{([['todos', 'Todos'], ['agotados', 'Agotados'], ['bajo', 'Quedan pocos'], ['sincosto', 'Sin costo'], ['ocultos', 'Ocultos']] as Array<[CatalogFilter, string]>).map(([id, label]) => {
    const count = goods.filter((product) => matchesCatalogFilter(product, id)).length
    if (id !== 'todos' && count === 0) return null
    return <button key={id} className={`${catalogFilter === id ? 'active' : ''} ${id === 'sincosto' ? 'warn' : ''}`} onClick={() => setCatalogFilter(id)}>{label}<b>{count}</b></button>
  })}</div>
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
          <button onClick={() => openSale()} disabled={!goods.some((product) => product.stock > 0)}><ShoppingCart />Registrar venta</button>
          <button onClick={() => openPurchase()} disabled={!goods.length}><ShoppingBag />Registrar compra</button>
          <button onClick={() => { goTo('catalogo'); setCatalogKind('producto'); setEditing(blankProduct('producto')) }}><PlusCircle />Nuevo producto</button>
          <button onClick={() => { goTo('catalogo'); setCatalogKind('servicio'); setEditing(blankProduct('servicio')) }}><Scissors />Nuevo servicio</button>
          <button onClick={() => { goTo('clientes'); setEditingCustomer(blankCustomer) }}><UserPlus />Nuevo cliente</button>
        </div>

        {lowStockProducts.length > 0 && <div className="admin-notice"><AlertTriangle size={16} /><div><strong>Quedan pocas unidades:</strong> {lowStockProducts.map((product) => `${product.name} (${product.stock})`).join(', ')}.</div><button onClick={() => { goTo('catalogo'); setCatalogKind('producto'); setCatalogFilter('bajo') }}>Reponer</button></div>}

        <div className="dashboard-columns">
          <section className="admin-card">
            <div className="card-title"><div><span>AGENDA</span><h2>Próximas citas</h2></div><button onClick={() => goTo('citas')}>Ver todas</button></div>
            <div className="record-list compact">{upcomingAppointments.slice(0, 3).map(appointmentCard)}</div>{!upcomingAppointments.length && <div className="empty-admin small"><Calendar /><p>No hay citas próximas.</p></div>}
          </section>
          <section className="admin-card">
            <div className="card-title"><div><span>PEDIDOS</span><h2>Por atender</h2></div><button onClick={() => goTo('pedidos')}>Ver todos</button></div>
            <div className="record-list compact">{openOrders.slice(0, 3).map(orderCard)}</div>{!openOrders.length && <div className="empty-admin small"><Package /><p>No hay pedidos pendientes.</p></div>}
          </section>
        </div>
      </div>}

      {tab === 'citas' && <section className="admin-card">
        <div className="card-title"><div><span>AGENDA</span><h2>{filteredAppointments.length} {filteredAppointments.length === 1 ? 'cita' : 'citas'}</h2></div><button className="admin-action" disabled={!services.length} onClick={() => setBookingDraft(newBooking())}><PlusCircle />Nueva cita</button></div>
        {chips([['', 'Próximas'], ['hoy', 'Hoy', todayAppointments.length], ['pendientes', 'Por confirmar', toConfirm], ['pasadas', 'Pasadas y cerradas'], ['todas', 'Todas']])}
        {searchBox("Buscar por clienta, servicio, teléfono o número…")}
        <div className="record-list">{filteredAppointments.map(appointmentCard)}</div>{!filteredAppointments.length && <div className="empty-admin">No hay citas en esta lista.</div>}
      </section>}

      {tab === 'pedidos' && <section className="admin-card">
        <div className="card-title"><div><span>PRODUCTOS VENDIDOS</span><h2>{filteredOrders.length} {filteredOrders.length === 1 ? 'pedido' : 'pedidos'}</h2></div></div>
        {chips([['', 'Todos'], ['abiertos', 'Por atender', openOrders.length], ['sinpagar', 'Sin pagar'], ['enviados', 'Enviados y entregados'], ['cancelados', 'Cancelados']])}
        {searchBox("Buscar por clienta, teléfono o número de pedido…")}
        <div className="record-list">{filteredOrders.map(orderCard)}</div>{!filteredOrders.length && <div className="empty-admin">No hay pedidos en esta lista.</div>}
      </section>}

      {tab === 'facturas' && <section className="admin-card">
        <div className="card-title"><div><span>COBRANZA</span><h2>{filteredInvoices.length} {filteredInvoices.length === 1 ? 'factura' : 'facturas'}</h2></div></div>
        <p className="section-help">Cada pedido y cada cita crea su factura sola. Desde cada tarjeta puedes abonar, descargar, compartir, anular o enviar a la papelera. Si marcas un pedido o cita como "Pagado", la factura se salda sola.</p>
        {chips([['', 'Todas'], ['porcobrar', 'Por cobrar', openInvoices.filter((invoice) => invoice.paid < invoice.total).length], ['pagadas', 'Pagadas'], ['anuladas', 'Anuladas']])}
        {searchBox("Buscar por folio, clienta o concepto…")}
        <div className="record-list">{filteredInvoices.map((invoice) => <InvoiceCard key={invoice.id} invoice={invoice} doc={docFor(invoice)} onPay={() => { setError(''); setPayingInvoice(invoice) }} onOpen={() => setViewingInvoice(invoice)} onAnnul={() => annulInvoice(invoice)} onDelete={() => trashInvoice(invoice)} />)}</div>{!filteredInvoices.length && <div className="empty-admin">No hay facturas en esta lista.</div>}
      </section>}

      {tab === 'catalogo' && <section className="admin-card">
        <div className="card-title"><div><span>LO QUE OFRECES</span><h2>{filteredProducts.length} {catalogKind === 'servicio' ? (filteredProducts.length === 1 ? 'servicio' : 'servicios') : (filteredProducts.length === 1 ? 'producto' : 'productos')}</h2></div><button className="admin-action" onClick={() => { setError(''); setEditing(blankProduct(catalogKind)) }}><PlusCircle />{catalogKind === 'servicio' ? 'Nuevo servicio' : 'Nuevo producto'}</button></div>
        <div className="segmented"><button className={catalogKind === 'servicio' ? 'active' : ''} onClick={() => setCatalogKind('servicio')}><Scissors size={15} />Servicios <b>{services.length}</b></button><button className={catalogKind === 'producto' ? 'active' : ''} onClick={() => setCatalogKind('producto')}><Package size={15} />Productos <b>{goods.length}</b></button></div>
        {catalogKind === 'producto' && <div className="catalog-tools">
          <button className="act-inline" onClick={() => openSale()} disabled={!goods.some((product) => product.stock > 0)}><ShoppingCart size={16} />Registrar venta</button>
          <button className="act-inline" onClick={() => openPurchase()} disabled={!goods.length}><ShoppingBag size={16} />Registrar compra</button>
        </div>}
        {searchBox("Buscar por nombre o categoría…")}
        {catalogKind === 'producto' && chipsCatalog()}
        {catalogKind === 'producto' && uncostedProducts.length > 0 && catalogFilter !== 'sincosto' && <div className="admin-notice"><AlertTriangle size={16} /><div>{uncostedProducts.length === 1 ? '1 producto tiene' : `${uncostedProducts.length} productos tienen`} unidades sin una compra registrada: su costo cuenta como RD$0 y la ganancia sale más alta de lo real.</div><button onClick={() => setCatalogFilter('sincosto')}>Ver cuáles</button></div>}
        {catalogKind === 'producto' && catalogFilter === 'sincosto' && <p className="section-help">Para corregirlo: toca «Editar», pon las unidades en 0 y guarda; después toca «Reponer» y registra cuántas tienes y a cuánto te salió cada una.</p>}
        <div className="record-list">{filteredProducts.map((product) => catalogKind === 'producto' ? <ProductCard key={product.id} product={product} noCost={uncostedIds.has(product.id)} lots={data.purchases.filter((purchase) => purchase.productId === product.id).length} onEdit={() => { setError(''); setEditing(product) }} onRestock={() => openPurchase(product)} onSell={() => openSale(product)} onLots={() => setLotsProductId(product.id)} onDelete={() => { if (confirm(`¿Enviar "${product.name}" a la papelera? Deja de verse en la tienda; lo puedes restaurar durante 30 días.`)) run(() => deleteProduct({ data: product.id }), 'Enviado a la papelera.') }} />
          : <ServiceCard key={product.id} product={product} onEdit={() => { setError(''); setEditing(product) }} onToggle={() => run(() => saveProduct({ data: { ...product, active: !product.active } }), product.active ? 'Oculto de la tienda.' : 'Visible en la tienda.')} onDelete={() => { if (confirm(`¿Enviar "${product.name}" a la papelera? Podrás restaurarlo durante 30 días.`)) run(() => deleteProduct({ data: product.id }), 'Enviado a la papelera.') }} />)}</div>
        {!filteredProducts.length && <div className="empty-admin">{q || catalogFilter !== 'todos' ? 'No hay resultados en esta lista.' : catalogKind === 'servicio' ? 'Todavía no hay servicios. Crea el primero.' : 'Todavía no hay productos. Crea el primero.'}</div>}
      </section>}

      {tab === 'finanzas' && <div className="dashboard">
        <div className="quick-actions three">
          <button onClick={() => openSale()} disabled={!goods.some((product) => product.stock > 0)}><ShoppingCart />Registrar venta</button>
          <button onClick={() => openPurchase()} disabled={!goods.length}><ShoppingBag />Registrar compra</button>
          <button onClick={() => { setError(''); setExpenseDraft({ type: 'negocio', description: '', amount: '' }) }}><Wallet />Registrar gasto</button>
        </div>
        <div className="money-hero">
          <div className="money-card"><span>Dinero del negocio</span><strong>{money(capitalDisponible)}</strong><small>Lo que hay para comprar mercancía</small></div>
          <div className="money-card"><span>Dinero para reinvertir</span><strong>{money(dineroReinvertir)}</strong><small>Tu {reinvestPercent}% de la ganancia, para comprar más mercancía</small></div>
          <div className="money-card accent"><span>Puedes retirar</span><strong>{money(disponibleRetirar)}</strong><small>Tu {100 - reinvestPercent}% de la ganancia{gananciaPropia !== 0 ? ', más lo que ganaste con el dinero para reinvertir,' : ''} menos tus gastos personales</small></div>
          <div className="money-card"><span>Ganancia</span><strong>{money(gananciaBruta)}</strong><small>De lo ya pagado: productos y servicios</small></div>
          <div className="money-card"><span>Mercancía en existencia</span><strong>{money(inventoryValue)}</strong><small>Lo que costó lo que todavía no se ha vendido</small></div>
        </div>
        {porCobrar > 0 && <div className="admin-notice"><AlertTriangle size={16} /><div>Te deben {money(porCobrar)} de pedidos y citas sin pagar. Cuando los marques «Pagado» se suman aquí.</div><button onClick={() => goTo('facturas', 'porcobrar')}>Ver</button></div>}
        {uncostedProducts.length > 0 && <div className="admin-notice"><AlertTriangle size={16} /><div>{uncostedProducts.length === 1 ? '1 producto tiene' : `${uncostedProducts.length} productos tienen`} unidades sin compra registrada ({uncostedProducts.slice(0, 4).map((product) => product.name).join(', ')}): la ganancia sale más alta de lo real.</div><button onClick={() => { goTo('catalogo'); setCatalogKind('producto'); setCatalogFilter('sincosto') }}>Corregir</button></div>}

        <details className="admin-card finance-details">
          <summary><h3>Ver todas las cuentas (cómo se calcula)</h3><ChevronRight size={18} /></summary>
          <h4>Ventas</h4>
          <div className="finance-grid"><div><span>Productos vendidos (pagado)</span><strong>{money(ventasProductos)}</strong></div><div><span>Servicios cobrados</span><strong>{money(ventasServicios)}</strong></div><div><span>Costo de lo vendido</span><strong>{money(costoVentas)}</strong></div><div><span>Ganancia del negocio</span><strong>{money(gananciaNegocio)}</strong></div><div><span>Ganancia de tu dinero para reinvertir</span><strong>{money(gananciaPropia)}</strong></div></div>
          <h4>Dinero del negocio</h4>
          <div className="finance-grid"><div><span>Capital inicial</span><strong>{money(capitalInicial)}</strong></div><div><span>Gastado en compras</span><strong>{money(gastadoCapital)}</strong></div><div><span>Recuperado al vender</span><strong>{money(recuperadoCapital)}</strong></div><div><span>Gastos del negocio</span><strong>{money(gastosNegocio)}</strong></div></div>
          <h4>Dinero para reinvertir</h4>
          <div className="finance-grid"><div><span>Reinversión ({reinvestPercent}%)</span><strong>{money(reinversion)}</strong></div><div><span>Gastado en compras</span><strong>{money(gastadoReinv)}</strong></div><div><span>Recuperado al vender</span><strong>{money(recuperadoReinv)}</strong></div></div>
          <h4>Lo tuyo</h4>
          <div className="finance-grid"><div><span>Para ti ({100 - reinvestPercent}%)</span><strong>{money(paraTi)}</strong></div><div><span>Ganancia de tu dinero para reinvertir</span><strong>{money(gananciaPropia)}</strong></div><div><span>Gastos personales</span><strong>{money(gastosPersonales)}</strong></div></div>
          <p className="section-help">Dinero del negocio = capital inicial − lo que compraste con él + lo que vuelve al vender esa mercancía − gastos del negocio.</p>
          <p className="section-help">Dinero para reinvertir = el {reinvestPercent}% de la ganancia del negocio − lo que compraste con él + lo que vuelve al vender esa mercancía. Ese dinero es tuyo: lo que ganes con la mercancía que compres con él es 100% tuyo y va directo a «Puedes retirar».</p>
          <p className="section-help">Puedes retirar = el {100 - reinvestPercent}% de la ganancia del negocio + la ganancia de tu dinero para reinvertir − tus gastos personales. Solo cuentan los pedidos y citas «Pagado» que no estén cancelados.</p>
        </details>

        <section className="admin-card">
          <div className="segmented"><button className={financeView === 'compras' ? 'active' : ''} onClick={() => setFinanceView('compras')}><Layers size={15} />Compras <b>{data.purchases.length}</b></button><button className={financeView === 'gastos' ? 'active' : ''} onClick={() => setFinanceView('gastos')}><Wallet size={15} />Gastos <b>{data.expenses.length}</b></button></div>
          {financeView === 'compras' && <>
            <p className="section-help"><Layers size={14} />Cada compra es un lote con su costo. Al vender, sale primero del lote más viejo («Se vende ahora»); cuando se acaba, sigue el próximo.</p>
            <div className="record-list">{data.purchases.map((lot) => <LotCard key={lot.id} lot={lot} status={lotStatus(lot, data.purchases)} showProduct onDelete={() => confirmDeletePurchase(lot)} />)}</div>
            {!data.purchases.length && <div className="empty-admin">Todavía no has registrado compras. Usa «Registrar compra» o «Reponer» en cada producto.</div>}
          </>}
          {financeView === 'gastos' && <>
            <div className="record-list">{data.expenses.map((expense) => <article key={expense.id} className="record-card"><header className="record-head"><div><strong className="record-name">{expense.description}</strong><small>{shortDate(expense.createdAt)}</small></div><strong className="record-amount">{money(expense.amount)}</strong></header><div className="expense-foot"><span className={`status-pill ${expense.type === 'personal' ? 'status-abonado' : 'status-confirmada'}`}>{expense.type === 'personal' ? 'Personal' : 'Negocio'}</span><button className="text-danger" onClick={() => { if (confirm('¿Borrar este gasto?')) run(() => deleteExpense({ data: expense.id }), 'Gasto borrado.') }}><Trash2 size={15} />Borrar</button></div></article>)}</div>
            {!data.expenses.length && <div className="empty-admin">Todavía no has registrado gastos.</div>}
          </>}
        </section>

        <details className="admin-card finance-details">
          <summary><h3>Configuración (capital inicial y % que se reinvierte)</h3><ChevronRight size={18} /></summary>
          <div className="form-grid"><label className="field">Capital inicial (RD$)<input type="number" inputMode="decimal" min={0} step="0.01" value={financeSettings.capitalInicial} onChange={(event) => setFinanceSettings((current) => ({ ...current, capitalInicial: event.target.value }))} /></label><label className="field">% de la ganancia que se reinvierte<input type="number" inputMode="numeric" min={0} max={100} value={financeSettings.reinvestPercent} onChange={(event) => setFinanceSettings((current) => ({ ...current, reinvestPercent: event.target.value }))} /></label></div>
          <p className="section-help">El capital inicial es el dinero con que empezó el negocio. El resto de la ganancia (el {100 - Math.min(100, Math.max(0, Number(financeSettings.reinvestPercent || 0)))}%) es para ti.</p>
          <button className="admin-action" disabled={busy} onClick={saveFinanceSettings}><Save />{busy ? 'Guardando...' : 'Guardar configuración'}</button>
        </details>
      </div>}

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
        <label>Precio antes (opcional)<input type="number" inputMode="decimal" min="0" step="0.01" placeholder="Sale tachado si es mayor" value={editing.originalPrice ? editing.originalPrice / 100 : ''} onChange={(event) => setEditing({ ...editing, originalPrice: Math.round(Number(event.target.value || 0) * 100) })} /></label>
        {editing.kind === 'producto' ? (editing.id ? <label>Unidades en existencia<input required type="number" inputMode="numeric" min="0" value={editing.stock} onChange={(event) => setEditing({ ...editing, stock: Number(event.target.value) })} /><small className="field-hint">Para sumar unidades usa «Reponer» (así queda lo que costaron). Cambia este número solo para corregir.</small></label> : <p className="field-hint wide">Un producto nuevo empieza en 0. Al guardar se abre «Reponer» para poner cuántas compraste y a cuánto.</p>) : <label>Duración (minutos)<input required type="number" inputMode="numeric" min="5" step="5" value={editing.durationMinutes} onChange={(event) => setEditing({ ...editing, durationMinutes: Number(event.target.value) })} /></label>}
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

    {payingInvoice && <div className="modal-wrap modal-top" onClick={() => setPayingInvoice(null)}><form className="product-modal" onSubmit={handlePayment} onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setPayingInvoice(null)} aria-label="Cerrar">×</button><span>ABONO</span><h2>Registrar abono</h2>
      <p className="invoice-summary">{payingInvoice.folio} · {payingInvoice.customerName} · Saldo pendiente: <strong>{money(Math.max(payingInvoice.total - payingInvoice.paid, 0))}</strong></p>
      {error && <p className="form-error">{error}</p>}
      <div className="form-grid">
        <label>Monto (RD$)<input required type="number" inputMode="decimal" min="0.01" max={Math.max(payingInvoice.total - payingInvoice.paid, 0) / 100} step="0.01" name="amount" defaultValue={Math.max(payingInvoice.total - payingInvoice.paid, 0) / 100} autoFocus /></label>
        <label>Método<select name="method" defaultValue="Efectivo"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option></select></label>
        <label className="wide">Nota (opcional)<input name="note" placeholder="Ej. abono inicial" /></label>
      </div>
      <button className="primary-button full" disabled={busy}><Save />{busy ? 'Guardando...' : 'Registrar abono'}</button>
    </form></div>}

    {purchaseDraft && <div className="modal-wrap modal-top" onClick={() => setPurchaseDraft(null)}><form className="product-modal" onSubmit={handlePurchase} onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setPurchaseDraft(null)} aria-label="Cerrar">×</button><span>INVENTARIO</span><h2>Reponer (registrar compra)</h2>
      <p className="invoice-summary">Pon cuántas compraste y a cuánto te salió cada una. Se suma a la existencia y queda como un lote con su propio costo: lo más viejo se vende primero.</p>
      {error && <p className="form-error">{error}</p>}
      <div className="form-grid">
        <label className="wide">Producto<select required value={purchaseDraft.productId} onChange={(event) => { const next = goods.find((product) => String(product.id) === event.target.value); setPurchaseDraft({ ...purchaseDraft, productId: event.target.value, unitCost: next?.cost ? String(next.cost / 100) : purchaseDraft.unitCost }) }}><option value="" disabled>Elige un producto</option>{[...goods].sort((a, b) => a.name.localeCompare(b.name)).map((product) => <option key={product.id} value={product.id}>{product.name} (hay {product.stock})</option>)}</select></label>
        <label>Cantidad comprada<input required type="number" inputMode="numeric" min={1} value={purchaseDraft.quantity} onChange={(event) => setPurchaseDraft({ ...purchaseDraft, quantity: event.target.value })} autoFocus /></label>
        <label>Costo por unidad (RD$)<input required type="number" inputMode="decimal" min={0} step="0.01" value={purchaseDraft.unitCost} onChange={(event) => setPurchaseDraft({ ...purchaseDraft, unitCost: event.target.value })} /></label>
        <label className="wide">Notas (opcional)<input value={purchaseDraft.notes} onChange={(event) => setPurchaseDraft({ ...purchaseDraft, notes: event.target.value })} placeholder="Ej. proveedor, factura..." /></label>
      </div>
      <div className="fund-choice" role="radiogroup" aria-label="¿Con qué dinero?"><span>¿Con qué dinero?</span>
        {(['capital', 'reinversion'] as const).map((fund) => { const balance = fund === 'capital' ? capitalDisponible : dineroReinvertir; const left = balance - purchaseTotal; return <label key={fund} className={`fund-option ${purchaseDraft.fund === fund ? 'active' : ''}`}><input type="radio" name="fund" checked={purchaseDraft.fund === fund} onChange={() => setPurchaseDraft({ ...purchaseDraft, fund })} /><div><strong>{FUND_LABEL[fund]}</strong><small>Hay {money(balance)}{purchaseTotal > 0 && <> · después quedan <em className={left < 0 ? 'balance-due' : ''}>{money(left)}</em></>}</small></div></label> })}
      </div>
      {purchaseTotal > 0 && <p className="sale-total">Total de la compra: <strong>{money(purchaseTotal)}</strong>{purchaseProduct && purchaseProduct.price > 0 && toCents(purchaseDraft.unitCost) > 0 && <> · ganancia por unidad {money(purchaseProduct.price - toCents(purchaseDraft.unitCost))}</>}</p>}
      <button className="primary-button full" disabled={busy || !purchaseDraft.productId}><Save />{busy ? 'Guardando...' : 'Registrar compra'}</button>
    </form></div>}

    {saleDraft && <div className="modal-wrap modal-top" onClick={() => setSaleDraft(null)}><form className="product-modal" onSubmit={handleSale} onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setSaleDraft(null)} aria-label="Cerrar">×</button><span>VENTA</span><h2>Registrar venta por fuera</h2>
      <p className="invoice-summary">Para lo que vendiste en persona o por WhatsApp. Se descuenta del inventario (lo más viejo primero), se crea su pedido y su factura, y cuenta en Finanzas. El precio lo pones tú.</p>
      {error && <p className="form-error">{error}</p>}
      {saleDraft.lines.map((line, index) => { const product = goods.find((item) => String(item.id) === line.productId); const lineTotal = Math.round(Number(line.quantity || 0)) * toCents(line.price); const update = (patch: Partial<SaleLine>) => setSaleDraft({ ...saleDraft, lines: saleDraft.lines.map((item, i) => i === index ? { ...item, ...patch } : item) }); return <div className="sale-line" key={index}>
        <div className="sale-line-head"><strong>Producto {saleDraft.lines.length > 1 ? index + 1 : ''}</strong>{saleDraft.lines.length > 1 && <button type="button" className="text-danger" onClick={() => setSaleDraft({ ...saleDraft, lines: saleDraft.lines.filter((_, i) => i !== index) })}>Quitar</button>}</div>
        <div className="form-grid">
          <label className="wide">Producto<select required value={line.productId} onChange={(event) => { const next = goods.find((item) => String(item.id) === event.target.value); update({ productId: event.target.value, price: next ? String(next.price / 100) : line.price }) }}><option value="" disabled>Elige un producto</option>{[...goods].sort((a, b) => a.name.localeCompare(b.name)).map((item) => <option key={item.id} value={item.id} disabled={item.stock <= 0}>{item.name} (hay {item.stock})</option>)}</select></label>
          <label>Cantidad<input required type="number" inputMode="numeric" min={1} max={product?.stock || undefined} value={line.quantity} onChange={(event) => update({ quantity: event.target.value })} /></label>
          <label>Precio por unidad (RD$)<input required type="number" inputMode="decimal" min={0} step="0.01" value={line.price} onChange={(event) => update({ price: event.target.value })} /></label>
        </div>
        {product && lineTotal > 0 && <p className="sale-total small">{line.quantity} × {money(toCents(line.price))} = <strong>{money(lineTotal)}</strong>{toCents(line.price) < product.price && <> · precio de tienda {money(product.price)}</>}</p>}
      </div> })}
      <button type="button" className="admin-action ghost add-line" onClick={() => setSaleDraft({ ...saleDraft, lines: [...saleDraft.lines, { productId: '', quantity: '1', price: '' }] })}><PlusCircle />Agregar otro producto</button>
      <div className="form-grid">
        <label>Clienta (opcional)<input list="customer-options-sale" value={saleDraft.customerName} onChange={(event) => { const name = event.target.value; const match = data.customers.find((customer) => customer.name === name); setSaleDraft({ ...saleDraft, customerName: name, phone: match ? match.phone : saleDraft.phone }) }} placeholder="Ej. María Pérez" /><datalist id="customer-options-sale">{data.customers.map((customer) => <option key={customer.id} value={customer.name} />)}</datalist></label>
        <label>Teléfono (opcional)<input type="tel" inputMode="tel" value={saleDraft.phone} onChange={(event) => setSaleDraft({ ...saleDraft, phone: event.target.value })} /></label>
        <label>¿Ya te pagaron?<select value={saleDraft.paid ? 'si' : 'no'} onChange={(event) => setSaleDraft({ ...saleDraft, paid: event.target.value === 'si' })}><option value="si">Sí, pagado</option><option value="no">No, queda pendiente</option></select></label>
        <label>Nota (opcional)<input value={saleDraft.notes} onChange={(event) => setSaleDraft({ ...saleDraft, notes: event.target.value })} placeholder="Ej. venta en feria" /></label>
      </div>
      <p className="sale-total">Total de la venta: <strong>{money(saleDraft.lines.reduce((sum, line) => sum + Math.round(Number(line.quantity || 0)) * toCents(line.price), 0))}</strong></p>
      <button className="primary-button full" disabled={busy}><Save />{busy ? 'Registrando...' : 'Registrar venta'}</button>
    </form></div>}

    {expenseDraft && <div className="modal-wrap modal-top" onClick={() => setExpenseDraft(null)}><form className="product-modal" onSubmit={handleExpense} onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setExpenseDraft(null)} aria-label="Cerrar">×</button><span>FINANZAS</span><h2>Registrar gasto</h2>
      {error && <p className="form-error">{error}</p>}
      <div className="form-grid">
        <label className="wide">Tipo<select value={expenseDraft.type} onChange={(event) => setExpenseDraft({ ...expenseDraft, type: event.target.value as ExpenseDraft['type'] })}><option value="negocio">Gasto del negocio (sale del dinero del negocio)</option><option value="personal">Gasto o retiro personal (sale de lo tuyo)</option></select></label>
        <label className="wide">Descripción<input required value={expenseDraft.description} onChange={(event) => setExpenseDraft({ ...expenseDraft, description: event.target.value })} placeholder="Ej. empaques, transporte, retiro..." /></label>
        <label>Monto (RD$)<input required type="number" inputMode="decimal" min={0} step="0.01" value={expenseDraft.amount} onChange={(event) => setExpenseDraft({ ...expenseDraft, amount: event.target.value })} /></label>
      </div>
      <button className="primary-button full" disabled={busy}><Save />{busy ? 'Guardando...' : 'Registrar gasto'}</button>
    </form></div>}

    {lotsProduct && <div className="modal-wrap" onClick={() => setLotsProductId(null)}><div className="modal-card detail-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close icon-button" onClick={() => setLotsProductId(null)} aria-label="Cerrar"><X /></button>
      <span className="drawer-kicker">COMPRAS DE</span>
      <h2>{lotsProduct.name}</h2>
      <p className="invoice-summary">Cada venta sale primero de la compra más vieja que todavía tenga unidades (la que dice «Se vende ahora»). Cuando esa se acaba, sigue la próxima.</p>
      {(() => { const lots = data.purchases.filter((lot) => lot.productId === lotsProduct.id).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id - b.id); const next = lots.find((lot) => lot.remainingQuantity > 0); return <>
        {next && <p className="next-lot">La próxima venta sale a costo <b>{money(next.unitCost)}</b> (compra del {shortDate(next.createdAt)}).</p>}
        <div className="record-list compact">{lots.map((lot) => <LotCard key={lot.id} lot={lot} status={lotStatus(lot, data.purchases)} onDelete={() => confirmDeletePurchase(lot)} />)}</div>
      </> })()}
      <button className="primary-button full lots-restock" onClick={() => openPurchase(lotsProduct)}><ShoppingBag />Reponer este producto</button>
    </div></div>}

    {liveOrder && <OrderDetail order={liveOrder} invoiceBox={invoiceBoxFor(findInvoiceFor('pedido', liveOrder.id))} onClose={() => setViewingOrder(null)} onDelete={() => sendToTrash('order', liveOrder, liveOrder.orderNumber)} onChange={(status, paymentStatus) => changeStatus('order', liveOrder, status, paymentStatus)} />}
    {liveAppointment && <AppointmentDetail item={liveAppointment} invoiceBox={invoiceBoxFor(findInvoiceFor('cita', liveAppointment.id))} onClose={() => setViewingAppointment(null)} onDelete={() => sendToTrash('appointment', liveAppointment, liveAppointment.appointmentNumber)} onChange={(status, paymentStatus) => changeStatus('appointment', liveAppointment, status, paymentStatus)} />}
    {liveInvoice && <div className="modal-wrap" onClick={() => setViewingInvoice(null)}><div className="modal-card detail-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close icon-button" onClick={() => setViewingInvoice(null)} aria-label="Cerrar"><X /></button>
      <span className="drawer-kicker">{liveInvoice.sourceType === 'cita' ? 'FACTURA DE CITA' : 'FACTURA DE PEDIDO'}</span>
      <h2>{liveInvoice.customerName}</h2>
      <p className="invoice-summary">{liveInvoice.concept}</p>
      {docFor(liveInvoice).lines && <div className="detail-lines">{docFor(liveInvoice).lines!.map((line, index) => <div key={index}><span>{line.quantity} × {line.name}</span><strong>{money(line.price * line.quantity)}</strong></div>)}</div>}
      {invoiceBoxFor(liveInvoice)}
      <div className="detail-footer">{liveInvoice.status !== 'Cancelada' && <button className="text-muted-btn" onClick={() => annulInvoice(liveInvoice)}><Ban size={15} />Anular factura</button>}<button className="text-danger" onClick={() => trashInvoice(liveInvoice)}><Trash2 size={15} />Enviar a la papelera</button></div>
    </div></div>}
  </div>
}

type LotStatus = 'ahora' | 'espera' | 'vendido'
const LOT_LABEL: Record<LotStatus, string> = { ahora: 'Se vende ahora', espera: 'En espera', vendido: 'Vendido completo' }
/** El lote que "se vende ahora" es el más viejo de ese producto que todavía tiene unidades. */
function lotStatus(lot: Purchase, all: Purchase[]): LotStatus {
  if (lot.remainingQuantity <= 0) return 'vendido'
  const next = all.filter((other) => other.productId === lot.productId && other.remainingQuantity > 0)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id - b.id)[0]
  return next?.id === lot.id ? 'ahora' : 'espera'
}

function LotCard({ lot, status, showProduct, onDelete }: { lot: Purchase; status: LotStatus; showProduct?: boolean; onDelete: () => void }) {
  const sold = lot.quantity - lot.remainingQuantity
  const percent = lot.quantity > 0 ? Math.round((sold / lot.quantity) * 100) : 0
  return <article className={`record-card lot-card lot-${status}`}>
    <header className="record-head">
      <div>{showProduct && <strong className="record-name">{lot.productName}</strong>}<small>{shortDate(lot.createdAt)}{lot.fund === 'reinversion' && <> · <b className="lot-fund">Reinversión</b></>}</small></div>
      <span className={`lot-badge lot-badge-${status}`}>{LOT_LABEL[status]}</span>
    </header>
    <p className="lot-numbers"><b>{lot.quantity} × {money(lot.unitCost)}</b> = {money(lot.totalCost)}</p>
    <div className="lot-bar" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
    <p className="record-meta">{sold <= 0 ? `Nada vendido todavía · quedan ${lot.remainingQuantity}` : lot.remainingQuantity > 0 ? `Vendidas ${sold} · quedan ${lot.remainingQuantity}` : `Se vendieron las ${lot.quantity}`}{lot.notes ? ` · ${lot.notes}` : ''}</p>
    {lot.remainingQuantity > 0 && <div className="expense-foot"><span /><button className="text-danger" onClick={onDelete}><Trash2 size={15} />{sold > 0 ? 'Quitar lo que queda' : 'Borrar compra'}</button></div>}
  </article>
}

function ProductCard({ product, noCost, lots, onEdit, onRestock, onSell, onLots, onDelete }: { product: Product; noCost: boolean; lots: number; onEdit: () => void; onRestock: () => void; onSell: () => void; onLots: () => void; onDelete: () => void }) {
  const margin = product.price > 0 && product.cost > 0 ? Math.round(((product.price - product.cost) / product.price) * 100) : null
  return <article className={`record-card ${product.active ? '' : 'is-closed'}`}>
    <header className="record-head">
      <img className="record-thumb" src={product.image || '/placeholder.png'} alt="" loading="lazy" />
      <div><strong className="record-name">{product.name}</strong><small>{product.category}{product.featured ? ' · Destacado' : ''}</small></div>
      <div className="record-price">{product.originalPrice > product.price && <s>{money(product.originalPrice)}</s>}<strong className="record-amount">{money(product.price)}</strong></div>
    </header>
    <div className="pill-row">
      <span className={`pill ${product.stock === 0 ? 'bad' : product.stock <= LOW_STOCK ? 'warn' : 'ok'}`}>{product.stock === 0 ? 'Agotado' : `${product.stock} en existencia`}</span>
      {noCost ? <span className="pill bad">Sin costo registrado</span> : product.cost > 0 && <span className="pill">Costo {money(product.cost)}</span>}
      {margin !== null && <span className={`pill ${margin < 15 ? 'warn' : ''}`}>Ganancia {margin}%</span>}
      {!product.active && <span className="pill">Oculto</span>}
    </div>
    <div className="card-actions five">
      <button className="act" onClick={onEdit}><Pencil />Editar</button>
      <button className="act primary" onClick={onRestock}><ShoppingBag />Reponer</button>
      <button className="act" disabled={product.stock <= 0} onClick={onSell}><ShoppingCart />Vender</button>
      <button className="act" disabled={!lots} onClick={onLots}><Layers />Compras</button>
      <button className="act danger" onClick={onDelete}><Trash2 />Borrar</button>
    </div>
  </article>
}

function ServiceCard({ product, onEdit, onToggle, onDelete }: { product: Product; onEdit: () => void; onToggle: () => void; onDelete: () => void }) {
  return <article className={`record-card ${product.active ? '' : 'is-closed'}`}>
    <header className="record-head">
      <img className="record-thumb" src={product.image || '/placeholder.png'} alt="" loading="lazy" />
      <div><strong className="record-name">{product.name}</strong><small>{product.category}{product.featured ? ' · Destacado' : ''}</small></div>
      <div className="record-price">{product.originalPrice > product.price && <s>{money(product.originalPrice)}</s>}<strong className="record-amount">{money(product.price)}</strong></div>
    </header>
    <div className="pill-row"><span className="pill"><Clock size={12} /> {product.durationMinutes} min</span>{!product.active && <span className="pill">Oculto</span>}</div>
    <div className="card-actions">
      <button className="act" onClick={onEdit}><Pencil />Editar</button>
      <button className="act" onClick={onToggle}>{product.active ? <EyeOff /> : <Eye />}{product.active ? 'Ocultar' : 'Mostrar'}</button>
      <button className="act danger" onClick={onDelete}><Trash2 />Borrar</button>
    </div>
  </article>
}

function StatusSelect({ value, options, onChange, label }: { value: string; options: string[]; onChange: (value: string) => void; label: string }) {
  return <select aria-label={label} className={`status-select status-${value.toLowerCase()}`} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select>
}

/** Estado de la factura en pocas palabras, para la tarjeta. */
function invoiceNote(invoice: Invoice | null) {
  if (!invoice) return null
  const saldo = Math.max(invoice.total - invoice.paid, 0)
  const text = invoice.status === 'Cancelada' ? 'anulada' : saldo === 0 ? 'pagada' : invoice.paid > 0 ? `abonado ${money(invoice.paid)} · falta ${money(saldo)}` : `por cobrar ${money(saldo)}`
  return <p className={`record-invoice ${invoice.status === 'Cancelada' ? '' : saldo > 0 ? 'due' : 'clear'}`}><ReceiptText size={14} />Factura {text}</p>
}

function CardActions({ phone, waText, onOpen, onInvoice, invoice, onDelete }: { phone: string; waText: string; onOpen: () => void; onInvoice: (invoice: Invoice) => void; invoice: Invoice | null; onDelete: () => void }) {
  const wa = waLink(phone, waText)
  return <div className="card-actions four">
    {wa ? <a className="act wa" href={wa} target="_blank" rel="noreferrer"><MessageCircle />WhatsApp</a> : <span className="act disabled"><MessageCircle />WhatsApp</span>}
    <button className="act" onClick={onOpen}><Eye />Ver</button>
    <button className="act" disabled={!invoice} onClick={() => invoice && onInvoice(invoice)}><ReceiptText />Factura</button>
    <button className="act danger" onClick={onDelete}><Trash2 />Borrar</button>
  </div>
}

function OrderCard({ order, invoice, onChange, onOpen, onInvoice, onDelete }: { order: Order; invoice: Invoice | null; onChange: (status: string, paymentStatus: string) => void; onOpen: () => void; onInvoice: (invoice: Invoice) => void; onDelete: () => void }) {
  return <article className={`record-card ${order.status === 'Cancelado' ? 'is-closed' : ''}`}>
    <header className="record-head">
      <div><strong className="record-name">{order.customerName}</strong><small>{order.orderNumber} · {shortDate(order.createdAt)}</small></div>
      <strong className="record-amount">{money(order.total)}</strong>
    </header>
    <ul className="record-lines">{order.items.map((line, index) => <li key={index}><span>{line.quantity} × {line.name}</span><b>{money(line.price * line.quantity)}</b></li>)}</ul>
    {order.address && <p className="record-meta nowrap"><MapPin size={14} /><span>{order.address}</span></p>}
    <div className="record-status"><label>Estado<StatusSelect label="Estado del pedido" value={order.status} options={ORDER_STATUSES} onChange={(status) => onChange(status, order.paymentStatus)} /></label><label>Pago<StatusSelect label="Pago del pedido" value={order.paymentStatus} options={PAYMENT_STATUSES} onChange={(paymentStatus) => onChange(order.status, paymentStatus)} /></label></div>
    {invoiceNote(invoice)}
    <CardActions phone={order.phone} waText={`Hola ${order.customerName.split(' ')[0]}, te escribimos de ELA sobre tu pedido ${order.orderNumber}.`} onOpen={onOpen} onInvoice={onInvoice} invoice={invoice} onDelete={onDelete} />
  </article>
}

function AppointmentCard({ item, invoice, onChange, onOpen, onInvoice, onDelete }: { item: Appointment; invoice: Invoice | null; onChange: (status: string, paymentStatus: string) => void; onOpen: () => void; onInvoice: (invoice: Invoice) => void; onDelete: () => void }) {
  return <article className={`record-card ${item.status === 'Cancelada' ? 'is-closed' : ''}`}>
    <header className="record-head">
      <div className="record-when"><strong>{niceDate(item.date)}</strong><small>{niceTime(item.time)}</small></div>
      <div className="record-who"><strong className="record-name">{item.customerName}</strong><small>{item.serviceName}</small></div>
      <strong className="record-amount">{money(item.price)}</strong>
    </header>
    {item.notes && <p className="record-meta">Nota: {item.notes}</p>}
    <div className="record-status"><label>Estado<StatusSelect label="Estado de la cita" value={item.status} options={APPOINTMENT_STATUSES} onChange={(status) => onChange(status, item.paymentStatus)} /></label><label>Pago<StatusSelect label="Pago de la cita" value={item.paymentStatus} options={PAYMENT_STATUSES} onChange={(paymentStatus) => onChange(item.status, paymentStatus)} /></label></div>
    {invoiceNote(invoice)}
    <CardActions phone={item.phone} waText={`Hola ${item.customerName.split(' ')[0]}, te escribimos de ELA para confirmar tu cita de ${item.serviceName} el ${niceDate(item.date).toLowerCase()} a las ${niceTime(item.time)}.`} onOpen={onOpen} onInvoice={onInvoice} invoice={invoice} onDelete={onDelete} />
  </article>
}

/** Botones Descargar / Compartir de una factura (y su propio "trabajando…"). */
function DocButtons({ doc }: { doc: Doc }) {
  const [working, setWorking] = useState<'' | 'pdf' | 'share'>('')
  const go = async (kind: 'pdf' | 'share') => { setWorking(kind); await withInvoiceLib((lib) => kind === 'pdf' ? lib.downloadInvoicePdf(doc) : lib.shareInvoice(doc)); setWorking('') }
  return <>
    <button className="act" disabled={!!working} onClick={() => go('pdf')}>{working === 'pdf' ? <LoaderCircle className="spin" /> : <Download />}Descargar</button>
    <button className="act" disabled={!!working} onClick={() => go('share')}>{working === 'share' ? <LoaderCircle className="spin" /> : <Share2 />}Compartir</button>
  </>
}

function InvoiceCard({ invoice, doc, onPay, onOpen, onAnnul, onDelete }: { invoice: Invoice; doc: Doc; onPay: () => void; onOpen: () => void; onAnnul: () => void; onDelete: () => void }) {
  const saldo = Math.max(invoice.total - invoice.paid, 0)
  const active = invoice.status !== 'Cancelada'
  return <article className={`record-card ${active ? '' : 'is-closed'}`}>
    <header className="record-head">
      <div><strong className="record-name">{invoice.customerName}</strong><small>{invoice.folio} · {shortDate(invoice.createdAt)}</small></div>
      <span className={`status-pill status-${invoice.status.toLowerCase()}`}>{invoice.status}</span>
    </header>
    <p className="record-meta">{invoice.concept}</p>
    <div className="record-figures">
      <div><span>Total</span><strong>{money(invoice.total)}</strong></div>
      <div><span>Abonado</span><strong>{money(invoice.paid)}</strong></div>
      <div><span>Saldo</span><strong className={!active ? 'muted-text' : saldo > 0 ? 'balance-due' : 'balance-clear'}>{active ? money(saldo) : 'Anulada'}</strong></div>
    </div>
    <div className="card-actions">
      {active && saldo > 0 && <button className="act primary" onClick={onPay}><Wallet />Abonar</button>}
      <button className="act" onClick={onOpen}><Eye />Ver</button>
      <DocButtons doc={doc} />
      {active && <button className="act" onClick={onAnnul}><Ban />Anular</button>}
      <button className="act danger" onClick={onDelete}><Trash2 />Borrar</button>
    </div>
  </article>
}

/** La factura dentro de una ventana: números, abonar, descargar,
 * compartir e historial de abonos con sus recibos. */
function InvoiceBox({ invoice, doc, payments, onPay }: { invoice: Invoice; doc: Doc; payments: Payment[]; onPay: () => void }) {
  const saldo = Math.max(invoice.total - invoice.paid, 0)
  const active = invoice.status !== 'Cancelada'
  return <div className="invoice-box">
    <div className="invoice-box-head"><span>Factura {invoice.folio}</span><span className={`status-pill status-${invoice.status.toLowerCase()}`}>{invoice.status}</span></div>
    <div className="record-figures">
      <div><span>Total</span><strong>{money(invoice.total)}</strong></div>
      <div><span>Abonado</span><strong>{money(invoice.paid)}</strong></div>
      <div><span>Saldo</span><strong className={!active ? 'muted-text' : saldo > 0 ? 'balance-due' : 'balance-clear'}>{active ? money(saldo) : 'Anulada'}</strong></div>
    </div>
    <div className="card-actions">
      {active && saldo > 0 && <button className="act primary" onClick={onPay}><Wallet />Abonar</button>}
      <DocButtons doc={doc} />
    </div>
    {payments.length > 0 && <div className="payment-history"><h3>Abonos</h3>{payments.map((payment) => <div key={payment.id} className="payment-row"><div><strong>{money(payment.amount)}</strong><span>{payment.method} · {shortDate(payment.createdAt)}{payment.note && ` · ${payment.note}`}</span></div><div className="row-actions"><button title="Descargar recibo" onClick={() => withInvoiceLib((lib) => lib.downloadReceiptPdf(doc, payment))}><Download size={15} /></button><button title="Compartir recibo" onClick={() => withInvoiceLib((lib) => lib.shareReceipt(doc, payment))}><Share2 size={15} /></button></div></div>)}</div>}
  </div>
}

function OrderDetail({ order, invoiceBox, onClose, onDelete, onChange }: { order: Order; invoiceBox: React.ReactNode; onClose: () => void; onDelete: () => void; onChange: (status: string, paymentStatus: string) => void }) {
  const wa = waLink(order.phone, `Hola ${order.customerName.split(' ')[0]}, te escribimos de ELA sobre tu pedido ${order.orderNumber}.`)
  return <div className="modal-wrap" onClick={onClose}><div className="modal-card detail-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close icon-button" onClick={onClose} aria-label="Cerrar"><X /></button>
    <span className="drawer-kicker">PEDIDO {order.orderNumber} · {shortDate(order.createdAt)}</span>
    <h2>{order.customerName}</h2>
    <div className="detail-contact">{order.phone && <a href={`tel:${order.phone}`}>{order.phone}</a>}{order.email && <a href={`mailto:${order.email}`}>{order.email}</a>}{order.address && <p><MapPin size={14} />{order.address}</p>}</div>
    {wa && <a className="wa-cta" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={18} />Escribirle por WhatsApp</a>}
    <div className="detail-lines">{order.items.map((line, index) => <div key={index}><span>{line.quantity} × {line.name}</span><strong>{money(line.price * line.quantity)}</strong></div>)}<div className="detail-total"><span>Total</span><strong>{money(order.total)}</strong></div></div>
    <div className="form-grid detail-status"><label>Estado<StatusSelect label="Estado" value={order.status} options={ORDER_STATUSES} onChange={(status) => onChange(status, order.paymentStatus)} /></label><label>Pago<StatusSelect label="Pago" value={order.paymentStatus} options={PAYMENT_STATUSES} onChange={(paymentStatus) => onChange(order.status, paymentStatus)} /></label></div>
    {invoiceBox}
    <div className="detail-footer"><button className="text-danger" onClick={onDelete}><Trash2 size={15} />Enviar pedido a la papelera</button></div>
  </div></div>
}

function AppointmentDetail({ item, invoiceBox, onClose, onDelete, onChange }: { item: Appointment; invoiceBox: React.ReactNode; onClose: () => void; onDelete: () => void; onChange: (status: string, paymentStatus: string) => void }) {
  const wa = waLink(item.phone, `Hola ${item.customerName.split(' ')[0]}, te escribimos de ELA para confirmar tu cita de ${item.serviceName} el ${niceDate(item.date).toLowerCase()} a las ${niceTime(item.time)}.`)
  return <div className="modal-wrap" onClick={onClose}><div className="modal-card detail-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close icon-button" onClick={onClose} aria-label="Cerrar"><X /></button>
    <span className="drawer-kicker">CITA {item.appointmentNumber}</span>
    <h2>{item.customerName}</h2>
    <div className="detail-contact">{item.phone && <a href={`tel:${item.phone}`}>{item.phone}</a>}{item.email && <a href={`mailto:${item.email}`}>{item.email}</a>}</div>
    {wa && <a className="wa-cta" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={18} />Confirmar por WhatsApp</a>}
    <div className="detail-lines"><div><span>{item.serviceName}</span><strong>{money(item.price)}</strong></div><div><span>Fecha</span><strong>{niceDate(item.date)} · {niceTime(item.time)}</strong></div>{item.notes && <div className="detail-note"><span>Notas de la clienta</span><p>{item.notes}</p></div>}</div>
    <div className="form-grid detail-status"><label>Estado<StatusSelect label="Estado" value={item.status} options={APPOINTMENT_STATUSES} onChange={(status) => onChange(status, item.paymentStatus)} /></label><label>Pago<StatusSelect label="Pago" value={item.paymentStatus} options={PAYMENT_STATUSES} onChange={(paymentStatus) => onChange(item.status, paymentStatus)} /></label></div>
    {invoiceBox}
    <div className="detail-footer"><button className="text-danger" onClick={onDelete}><Trash2 size={15} />Enviar cita a la papelera</button></div>
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
  onRestore: (kind: TrashKind, id: number) => Promise<void>
  onPurge: (kind: TrashKind, id: number, label: string) => Promise<void>
}) {
  const isEmpty = !trash.products.length && !trash.customers.length && !trash.orders.length && !trash.appointments.length && !trash.images.length && !trash.invoices.length
  return <div className="dashboard">
    <div className="admin-notice"><AlertTriangle size={16} /><div>Lo que está aquí se borra solo 30 días después. Puedes restaurarlo antes, o borrarlo ya. Al borrar una factura definitivamente se borran también sus recibos de abono.</div></div>

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

    {trash.invoices.length > 0 && <section className="admin-card">
      <div className="card-title"><div><span>COBROS</span><h2>{trash.invoices.length} {trash.invoices.length === 1 ? 'factura' : 'facturas'} en papelera</h2></div></div>
      <div className="record-list">{trash.invoices.map((invoice) => <article key={invoice.id} className="record-card">
        <header className="record-head"><div><strong className="record-name">{invoice.customerName}</strong><small>{invoice.folio} · {invoice.concept}</small></div><strong className="record-amount">{money(invoice.total)}</strong></header>
        <p className="record-meta"><DaysLeftBadge daysLeft={invoice.daysLeft} />{invoice.paid > 0 && <> · abonado {money(invoice.paid)}</>}</p>
        <div className="card-actions"><button className="act" onClick={() => onRestore('invoice', invoice.id)}><RotateCcw />Restaurar</button><button className="act danger" onClick={() => onPurge('invoice', invoice.id, `la factura ${invoice.folio} y sus abonos`)}><Trash />Borrar ya</button></div>
      </article>)}</div>
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
