import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, ArrowLeft, Ban, Boxes, Calendar, Download, FileText, ImageOff, ImagePlus, LayoutDashboard, LoaderCircle, LogOut, Pencil, PlusCircle, ReceiptText, RotateCcw, Save, Scissors, Search, Share2, Trash, Trash2, UserPlus, Users, Wallet } from 'lucide-react'
import { cancelInvoice, checkSession, deleteAppointment, deleteCustomer, deleteOrder, deleteProduct, getAdminData, login, logout, purgeAppointment, purgeCustomer, purgeOrder, purgeProduct, registerPayment, restoreAppointment, restoreCustomer, restoreOrder, restoreProduct, saveAppointmentAdmin, saveContent, saveCustomer, saveProduct, updateAppointmentStatus, updateOrderStatus } from '@/lib/store'
import { downloadInvoicePdf, downloadReceiptPdf, shareInvoice, shareReceipt, type InvoiceLike, type PaymentLike } from '@/lib/invoice'
import { compressImage } from '@/lib/image'

type Product = { id: number; kind: string; name: string; category: string; description: string; price: number; stock: number; durationMinutes: number; image: string; featured: boolean; active: boolean }
type Order = { id: number; orderNumber: string; customerName: string; email: string; phone: string; address: string; total: number; status: string; paymentStatus: string; items: Array<{ name: string; price: number; quantity: number }>; createdAt: string | Date }
type Appointment = { id: number; appointmentNumber: string; customerName: string; phone: string; email: string; serviceId: number | null; serviceName: string; price: number; date: string; time: string; notes: string; status: string; paymentStatus: string; createdAt: string | Date }
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
type Tab = 'resumen' | 'catalogo' | 'citas' | 'pedidos' | 'facturas' | 'clientes' | 'contenido' | 'papelera'
type CustomerDraft = { id?: number; name: string; email: string; phone: string; address: string; notes: string }
type ProductDraft = { id?: number; kind: string; name: string; category: string; description: string; price: number; stock: number; durationMinutes: number; image: string; featured: boolean; active: boolean }
type AppointmentDraft = { name: string; phone: string; email: string; serviceId: number; date: string; time: string; notes: string }

// Mensaje que el servidor lanza cuando un pedido/cita tiene una factura
// relacionada con abonos ya registrados (ver `checkInvoiceForCancel` en
// src/lib/store.ts). Se usa para distinguir ese caso y pedir una
// confirmación especial en vez de mostrar el error tal cual.
const invoiceWarning = (message: string) => message.includes('factura relacionada')

const money = (value: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(value / 100)
const shortDate = (value: string | Date) => new Intl.DateTimeFormat('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
const blankProduct: ProductDraft = { kind: 'servicio', name: '', category: '', description: '', price: 0, stock: 0, durationMinutes: 30, image: '', featured: false, active: true }
const blankCustomer: CustomerDraft = { name: '', email: '', phone: '', address: '', notes: '' }
const authErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'No pudimos completar el acceso.'
const todayIso = () => new Date().toISOString().slice(0, 10)

export function AdminPanel() {
  const initialized = useRef(false)
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [data, setData] = useState<AdminData | null>(null)
  const [tab, setTab] = useState<Tab>('resumen')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [editing, setEditing] = useState<ProductDraft | null>(null)
  const [editingCustomer, setEditingCustomer] = useState<CustomerDraft | null>(null)
  const [bookingDraft, setBookingDraft] = useState<AppointmentDraft | null>(null)
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null)
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null)
  const [contentDraft, setContentDraft] = useState<Record<string, string>>({})

  async function refresh() {
    const result = await getAdminData()
    setData(result as AdminData)
    setContentDraft(result.content)
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
        setError(authErrorMessage(caught))
        setAuthenticated(false)
      }
    }
    initializeAuth().catch(() => setAuthenticated(false))
  }, [])

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    const form = new FormData(event.currentTarget)
    try { await login({ data: { password: String(form.get('password')) } }); setAuthenticated(true); await refresh() }
    catch (caught) { setError(authErrorMessage(caught)) }
    finally { setBusy(false) }
  }

  async function handleProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return; setBusy(true); setError('')
    try { await saveProduct({ data: { ...editing, price: Number(editing.price), stock: Number(editing.stock), durationMinutes: Number(editing.durationMinutes) } }); setEditing(null); await refresh() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos guardar el producto.') }
    finally { setBusy(false) }
  }

  async function handleCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editingCustomer) return; setBusy(true); setError('')
    try { await saveCustomer({ data: editingCustomer }); setEditingCustomer(null); await refresh() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos guardar el cliente.') }
    finally { setBusy(false) }
  }

  async function handleBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!bookingDraft) return; setBusy(true); setError('')
    try { await saveAppointmentAdmin({ data: bookingDraft }); setBookingDraft(null); await refresh() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos agendar la cita.') }
    finally { setBusy(false) }
  }

  async function handlePayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!payingInvoice) return; setBusy(true); setError('')
    const form = new FormData(event.currentTarget)
    try {
      await registerPayment({ data: { invoiceId: payingInvoice.id, amount: Math.round(Number(form.get('amount')) * 100), method: String(form.get('method')), note: String(form.get('note') || '') } })
      setPayingInvoice(null); await refresh()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos registrar el abono.') }
    finally { setBusy(false) }
  }

  // Envía un pedido/cita a la papelera. Si tiene una factura con abonos,
  // el servidor rechaza el intento con un mensaje explicativo; en ese caso
  // se pide una segunda confirmación explícita y se reintenta con `force`.
  async function sendToTrash(kind: 'order' | 'appointment', item: Order | Appointment, code: string) {
    const label = kind === 'order' ? `el pedido ${code}` : `la cita ${code}`
    if (!confirm(`¿Enviar ${label} a la papelera? Podrás restaurarlo durante 30 días.`)) return
    const action = kind === 'order' ? deleteOrder : deleteAppointment
    try {
      await action({ data: { id: item.id } }); await refresh()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No pudimos completar la acción.'
      if (invoiceWarning(message) && confirm(`${message}\n\n¿Confirmas de todas formas?`)) {
        try { await action({ data: { id: item.id, force: true } }); await refresh() }
        catch (err2) { setError(err2 instanceof Error ? err2.message : 'No pudimos completar la acción.') }
      } else if (!invoiceWarning(message)) setError(message)
    }
  }

  async function restoreItem(kind: 'product' | 'customer' | 'order' | 'appointment', id: number) {
    const action = { product: restoreProduct, customer: restoreCustomer, order: restoreOrder, appointment: restoreAppointment }[kind]
    await action({ data: id }); await refresh()
  }

  async function purgeItem(kind: 'product' | 'customer' | 'order' | 'appointment', id: number, label: string) {
    if (!confirm(`¿Eliminar definitivamente ${label}? Esta acción no se puede deshacer.`)) return
    const action = { product: purgeProduct, customer: purgeCustomer, order: purgeOrder, appointment: purgeAppointment }[kind]
    await action({ data: id }); await refresh()
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
      else setContentDraft((current) => ({ ...current, heroImage: result.url! }))
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos subir la imagen.') }
    finally { setUploading(false) }
  }

  const filteredProducts = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    if (!q) return data.products
    return data.products.filter((product) => product.name.toLowerCase().includes(q) || product.category.toLowerCase().includes(q))
  }, [data, query])

  const filteredCustomers = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    if (!q) return data.customers
    return data.customers.filter((customer) => customer.name.toLowerCase().includes(q) || customer.email.toLowerCase().includes(q) || customer.phone.toLowerCase().includes(q))
  }, [data, query])

  const filteredOrders = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    if (!q) return data.orders
    return data.orders.filter((order) => order.orderNumber.toLowerCase().includes(q) || order.customerName.toLowerCase().includes(q))
  }, [data, query])

  const filteredAppointments = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    if (!q) return data.appointments
    return data.appointments.filter((item) => item.appointmentNumber.toLowerCase().includes(q) || item.customerName.toLowerCase().includes(q) || item.serviceName.toLowerCase().includes(q))
  }, [data, query])

  const filteredInvoices = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    if (!q) return data.invoices
    return data.invoices.filter((invoice) => invoice.folio.toLowerCase().includes(q) || invoice.customerName.toLowerCase().includes(q) || invoice.concept.toLowerCase().includes(q))
  }, [data, query])

  function findInvoiceFor(sourceType: string, sourceId: number) {
    return data?.invoices.find((invoice) => invoice.sourceType === sourceType && invoice.sourceId === sourceId) || null
  }

  function paymentsFor(invoiceId: number) {
    return data?.payments.filter((payment) => payment.invoiceId === invoiceId) || []
  }

  if (authenticated === null) return <div className="admin-loading"><LoaderCircle /><p>Preparando tu espacio...</p></div>
  if (!authenticated) return <div className="admin-login"><div className="login-art"><Link to="/"><ArrowLeft /> Volver a la tienda</Link><div className="login-monogram">E</div><p>El detrás de escena de cada servicio y producto.</p></div><div className="login-form-wrap"><div><span>ACCESO PRIVADO</span><h1>Panel de<br />administración</h1><p>Ingresa la contraseña de administración.</p><form onSubmit={handleLogin}><label>Contraseña<input required type="password" name="password" placeholder="••••••••" autoFocus /></label>{error && <p className="form-error">{error}</p>}<button className="primary-button full" disabled={busy}>{busy ? 'Ingresando...' : 'Entrar al panel'}</button></form></div></div></div>

  if (!data) return <div className="admin-loading"><LoaderCircle /><p>Cargando información...</p></div>

  const pendingBalance = data.invoices.filter((invoice) => invoice.status !== 'Cancelada').reduce((sum, invoice) => sum + Math.max(invoice.total - invoice.paid, 0), 0)
  const upcomingAppointments = data.appointments.filter((item) => item.date >= todayIso() && item.status !== 'Cancelada' && item.status !== 'Completada').length
  const lowStock = data.products.filter((product) => product.kind === 'producto' && product.stock <= 5).length
  const services = data.products.filter((product) => product.kind === 'servicio')

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'resumen', label: 'Resumen', icon: <LayoutDashboard /> },
    { id: 'catalogo', label: 'Catálogo', icon: <Boxes /> },
    { id: 'citas', label: 'Citas', icon: <Calendar /> },
    { id: 'pedidos', label: 'Pedidos', icon: <ReceiptText /> },
    { id: 'facturas', label: 'Facturas y abonos', icon: <Wallet /> },
    { id: 'clientes', label: 'Clientes', icon: <Users /> },
    { id: 'contenido', label: 'Editor de contenido', icon: <FileText /> },
    { id: 'papelera', label: 'Papelera', icon: <Trash2 /> },
  ]

  return <div className="admin-shell">
    <aside className="admin-sidebar"><Link to="/" className="admin-brand"><span>E</span><div>ELA<small>Administración</small></div></Link>
      <nav>{tabs.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => { setTab(item.id); setQuery('') }}>{item.icon}{item.label}</button>)}</nav>
      <button className="logout" onClick={async () => { await logout(); setAuthenticated(false) }}><LogOut />Cerrar sesión</button>
    </aside>

    <main className="admin-main">
      <header><div><span>ESPACIO DE GESTIÓN</span><h1>{tabs.find((item) => item.id === tab)?.label}</h1></div><Link to="/">Ver tienda <ArrowLeft /></Link></header>
      {error && <div className="admin-alert">{error}</div>}

      {tab === 'resumen' && <div className="dashboard">
        <div className="metric-grid">
          <article><span>Pedidos totales</span><strong>{data.orders.length}</strong><small>Registro histórico</small></article>
          <article><span>Citas próximas</span><strong>{upcomingAppointments}</strong><small>Pendientes o confirmadas</small></article>
          <article><span>Saldos pendientes</span><strong>{money(pendingBalance)}</strong><small>Facturas por cobrar</small></article>
          <article><span>Servicios y productos</span><strong>{data.products.length}</strong><small>{lowStock} con stock bajo</small></article>
          <article><span>Clientes</span><strong>{data.customers.length}</strong><small>Base de contactos</small></article>
        </div>
        <section className="admin-card">
          <div className="card-title"><div><span>ACTIVIDAD RECIENTE</span><h2>Últimos pedidos</h2></div><button onClick={() => setTab('pedidos')}>Ver todos</button></div>
          <OrderTable orders={data.orders.slice(0, 5)} onRefresh={refresh} onDelete={(order) => sendToTrash('order', order, order.orderNumber)} onInvoice={(order) => setViewingInvoice(findInvoiceFor('pedido', order.id))} />
        </section>
        <section className="admin-card">
          <div className="card-title"><div><span>AGENDA</span><h2>Próximas citas</h2></div><button onClick={() => setTab('citas')}>Ver todas</button></div>
          <AppointmentTable appointments={data.appointments.filter((item) => item.date >= todayIso()).slice(0, 5)} onRefresh={refresh} onDelete={(item) => sendToTrash('appointment', item, item.appointmentNumber)} onInvoice={(item) => setViewingInvoice(findInvoiceFor('cita', item.id))} />
        </section>
      </div>}

      {tab === 'catalogo' && <section className="admin-card">
        <div className="card-title"><div><span>SERVICIOS Y PRODUCTOS</span><h2>{filteredProducts.length} artículos</h2></div><button className="admin-action" onClick={() => setEditing(blankProduct)}><PlusCircle />Nuevo artículo</button></div>
        <label className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o categoría…" /></label>
        <div className="admin-product-list">{filteredProducts.map((product) => <article key={product.id}><img src={product.image} alt="" /><div><span>{product.kind === 'servicio' ? <><Scissors size={12} /> Servicio</> : <><Boxes size={12} /> Producto</>} · {product.category}</span><h3>{product.name}</h3><p>{product.kind === 'servicio' ? `${product.durationMinutes} min` : `${product.stock} unidades`} · {money(product.price)}{!product.active && ' · Inactivo'}</p></div><div className="row-actions"><button onClick={() => setEditing(product)}><Pencil /></button><button onClick={async () => { if (confirm(`¿Enviar "${product.name}" a la papelera? Podrás restaurarlo durante 30 días.`)) { await deleteProduct({ data: product.id }); await refresh() } }}><Trash2 /></button></div></article>)}{!filteredProducts.length && <div className="empty-admin">No hay artículos que mostrar.</div>}</div>
      </section>}

      {tab === 'citas' && <section className="admin-card">
        <div className="card-title"><div><span>AGENDA</span><h2>{filteredAppointments.length} citas</h2></div><button className="admin-action" onClick={() => setBookingDraft({ name: '', phone: '', email: '', serviceId: services[0]?.id ?? 0, date: todayIso(), time: '10:00', notes: '' })}><PlusCircle />Nueva cita</button></div>
        <label className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por número, cliente o servicio…" /></label>
        <AppointmentTable appointments={filteredAppointments} onRefresh={refresh} onDelete={(item) => sendToTrash('appointment', item, item.appointmentNumber)} onInvoice={(item) => setViewingInvoice(findInvoiceFor('cita', item.id))} />
      </section>}

      {tab === 'pedidos' && <section className="admin-card">
        <div className="card-title"><div><span>HISTORIAL</span><h2>Pedidos de productos</h2></div></div>
        <label className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por número o cliente…" /></label>
        <OrderTable orders={filteredOrders} onRefresh={refresh} onDelete={(order) => sendToTrash('order', order, order.orderNumber)} onInvoice={(order) => setViewingInvoice(findInvoiceFor('pedido', order.id))} />
      </section>}

      {tab === 'facturas' && <section className="admin-card">
        <div className="card-title"><div><span>COBRANZA</span><h2>{filteredInvoices.length} facturas</h2></div></div>
        <label className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por folio, cliente o concepto…" /></label>
        <div className="table-wrap"><table><thead><tr><th>Folio</th><th>Cliente</th><th>Concepto</th><th>Fecha</th><th>Total</th><th>Abonado</th><th>Saldo</th><th>Estado</th><th /></tr></thead><tbody>{filteredInvoices.map((invoice) => {
          const saldo = Math.max(invoice.total - invoice.paid, 0)
          return <tr key={invoice.id}>
            <td data-label="Folio"><strong>{invoice.folio}</strong></td>
            <td data-label="Cliente">{invoice.customerName}<small>{invoice.phone}</small></td>
            <td data-label="Concepto">{invoice.concept}</td>
            <td data-label="Fecha">{shortDate(invoice.createdAt)}</td>
            <td data-label="Total">{money(invoice.total)}</td>
            <td data-label="Abonado">{money(invoice.paid)}</td>
            <td data-label="Saldo"><strong className={saldo > 0 ? 'balance-due' : 'balance-clear'}>{money(saldo)}</strong></td>
            <td data-label="Estado"><span className={`status-pill status-${invoice.status.toLowerCase()}`}>{invoice.status}</span></td>
            <td className="col-actions"><div className="row-actions">
              {saldo > 0 && invoice.status !== 'Cancelada' && <button title="Registrar abono" onClick={() => setPayingInvoice(invoice)}><Wallet /></button>}
              <button title="Ver factura" onClick={() => setViewingInvoice(invoice)}><ReceiptText /></button>
              {invoice.status !== 'Cancelada' && <button title="Anular factura" onClick={async () => {
                const message = invoice.paid > 0
                  ? `La factura ${invoice.folio} ya tiene ${money(invoice.paid)} en abonos registrados. Anularla no borra ese historial, pero la factura pasará a estado "Cancelada" y dejará de contar como saldo pendiente. ¿Confirmas la anulación?`
                  : `¿Anular la factura ${invoice.folio}?`
                if (!confirm(message)) return
                try { await cancelInvoice({ data: { id: invoice.id, force: invoice.paid > 0 } }); await refresh() }
                catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos anular la factura.') }
              }}><Ban /></button>}
            </div></td>
          </tr>
        })}</tbody></table>{!filteredInvoices.length && <div className="empty-admin">Todavía no hay facturas.</div>}</div>
      </section>}

      {tab === 'clientes' && <section className="admin-card">
        <div className="card-title"><div><span>COMUNIDAD</span><h2>{filteredCustomers.length} clientes</h2></div><button className="admin-action" onClick={() => setEditingCustomer(blankCustomer)}><UserPlus />Nuevo cliente</button></div>
        <label className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, correo o teléfono…" /></label>
        <div className="customer-grid">{filteredCustomers.map((customer) => <article key={customer.id}><div className="customer-card-top"><div className="avatar">{customer.name.slice(0, 2).toUpperCase()}</div><div className="row-actions"><button onClick={() => setEditingCustomer(customer)}><Pencil /></button><button onClick={async () => { if (confirm(`¿Enviar a ${customer.name} a la papelera? Podrás restaurarlo durante 30 días.`)) { await deleteCustomer({ data: customer.id }); await refresh() } }}><Trash2 /></button></div></div><h3>{customer.name}</h3>{customer.email && <a href={`mailto:${customer.email}`}>{customer.email}</a>}<p>{customer.phone}</p><p>{customer.address}</p>{customer.notes && <small className="customer-notes">{customer.notes}</small>}<small>{data.orders.filter((order) => order.customerName === customer.name).length} pedidos · {data.appointments.filter((item) => item.customerName === customer.name).length} citas</small></article>)}{!filteredCustomers.length && <div className="empty-admin">No hay clientes que mostrar.</div>}</div>
      </section>}

      {tab === 'contenido' && <ContentEditor values={contentDraft} onChange={setContentDraft} onUpload={(file) => uploadImage(file, 'hero')} onSave={async () => { setBusy(true); await saveContent({ data: contentDraft }); await refresh(); setBusy(false) }} busy={busy} uploading={uploading} />}

      {tab === 'papelera' && <TrashPanel trash={data.trash} onRestore={restoreItem} onPurge={purgeItem} />}
    </main>

    {editing && <div className="modal-wrap"><form className="product-modal" onSubmit={handleProduct}><button type="button" className="modal-close" onClick={() => setEditing(null)}>×</button><span>CATÁLOGO</span><h2>{editing.id ? 'Editar artículo' : 'Nuevo artículo'}</h2>{error && <p className="form-error">{error}</p>}
      <div className="form-grid">
        <label>Tipo<select value={editing.kind} onChange={(event) => setEditing({ ...editing, kind: event.target.value })}><option value="servicio">Servicio (se agenda)</option><option value="producto">Producto (se compra)</option></select></label>
        <label>Categoría<input required placeholder="Cejas, Pestañas, Jabones..." value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value })} /></label>
        <label>Nombre<input required value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>
        <label className="wide">Descripción<textarea required rows={3} value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} /></label>
        <label>Precio (DOP)<input required type="number" min="0" step="0.01" value={editing.price / 100} onChange={(event) => setEditing({ ...editing, price: Math.round(Number(event.target.value) * 100) })} /></label>
        {editing.kind === 'producto' ? <label>Existencias<input required type="number" min="0" value={editing.stock} onChange={(event) => setEditing({ ...editing, stock: Number(event.target.value) })} /></label> : <label>Duración (minutos)<input required type="number" min="5" value={editing.durationMinutes} onChange={(event) => setEditing({ ...editing, durationMinutes: Number(event.target.value) })} /></label>}
        <label className="wide">URL de imagen<input required value={editing.image} onChange={(event) => setEditing({ ...editing, image: event.target.value })} /></label>
        <label className="upload-zone wide"><ImagePlus />{uploading ? 'Subiendo...' : 'Subir imagen desde el dispositivo'}<input hidden disabled={uploading} type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && uploadImage(event.target.files[0], 'product')} /></label>
        <label className="check-field"><input type="checkbox" checked={editing.featured} onChange={(event) => setEditing({ ...editing, featured: event.target.checked })} />Destacado</label>
        <label className="check-field"><input type="checkbox" checked={editing.active} onChange={(event) => setEditing({ ...editing, active: event.target.checked })} />Visible en la tienda</label>
      </div>
      <button className="primary-button full" disabled={busy}><Save />{busy ? 'Guardando...' : 'Guardar artículo'}</button>
    </form></div>}

    {editingCustomer && <div className="modal-wrap"><form className="product-modal" onSubmit={handleCustomer}><button type="button" className="modal-close" onClick={() => setEditingCustomer(null)}>×</button><span>COMUNIDAD</span><h2>{editingCustomer.id ? 'Editar cliente' : 'Registrar cliente'}</h2><div className="form-grid"><label>Nombre completo<input required value={editingCustomer.name} onChange={(event) => setEditingCustomer({ ...editingCustomer, name: event.target.value })} /></label><label>Teléfono<input required value={editingCustomer.phone} onChange={(event) => setEditingCustomer({ ...editingCustomer, phone: event.target.value })} /></label><label>Correo<input type="email" value={editingCustomer.email} onChange={(event) => setEditingCustomer({ ...editingCustomer, email: event.target.value })} /></label><label>Dirección<input value={editingCustomer.address} onChange={(event) => setEditingCustomer({ ...editingCustomer, address: event.target.value })} /></label><label className="wide">Notas<textarea rows={3} value={editingCustomer.notes} onChange={(event) => setEditingCustomer({ ...editingCustomer, notes: event.target.value })} /></label></div><button className="primary-button full" disabled={busy}><Save />{busy ? 'Guardando...' : 'Guardar cliente'}</button></form></div>}

    {bookingDraft && <div className="modal-wrap"><form className="product-modal" onSubmit={handleBooking}><button type="button" className="modal-close" onClick={() => setBookingDraft(null)}>×</button><span>AGENDA</span><h2>Nueva cita</h2>
      <div className="form-grid">
        <label>Servicio<select required value={bookingDraft.serviceId} onChange={(event) => setBookingDraft({ ...bookingDraft, serviceId: Number(event.target.value) })}>{services.map((service) => <option key={service.id} value={service.id}>{service.name} — {money(service.price)}</option>)}</select></label>
        <label>Nombre de la clienta<input required value={bookingDraft.name} onChange={(event) => setBookingDraft({ ...bookingDraft, name: event.target.value })} /></label>
        <label>Teléfono<input required value={bookingDraft.phone} onChange={(event) => setBookingDraft({ ...bookingDraft, phone: event.target.value })} /></label>
        <label>Correo<input type="email" value={bookingDraft.email} onChange={(event) => setBookingDraft({ ...bookingDraft, email: event.target.value })} /></label>
        <label>Fecha<input required type="date" value={bookingDraft.date} onChange={(event) => setBookingDraft({ ...bookingDraft, date: event.target.value })} /></label>
        <label>Hora<input required type="time" value={bookingDraft.time} onChange={(event) => setBookingDraft({ ...bookingDraft, time: event.target.value })} /></label>
        <label className="wide">Notas<textarea rows={2} value={bookingDraft.notes} onChange={(event) => setBookingDraft({ ...bookingDraft, notes: event.target.value })} /></label>
      </div>
      <button className="primary-button full" disabled={busy}><Save />{busy ? 'Guardando...' : 'Agendar cita'}</button>
    </form></div>}

    {payingInvoice && <div className="modal-wrap"><form className="product-modal" onSubmit={handlePayment}><button type="button" className="modal-close" onClick={() => setPayingInvoice(null)}>×</button><span>ABONO</span><h2>Registrar abono — {payingInvoice.folio}</h2>
      <p className="invoice-summary">{payingInvoice.customerName} · Saldo pendiente: <strong>{money(Math.max(payingInvoice.total - payingInvoice.paid, 0))}</strong></p>
      <div className="form-grid">
        <label>Monto (en RD$)<input required type="number" min="1" step="0.01" name="amount" placeholder="0.00" /></label>
        <label>Método<select name="method" defaultValue="Efectivo"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option></select></label>
        <label className="wide">Nota (opcional)<input name="note" placeholder="Ej. abono inicial" /></label>
      </div>
      <button className="primary-button full" disabled={busy}><Save />{busy ? 'Guardando...' : 'Registrar abono'}</button>
    </form></div>}

    {viewingInvoice && <InvoiceViewer invoice={viewingInvoice} payments={paymentsFor(viewingInvoice.id)} onClose={() => setViewingInvoice(null)} />}
  </div>
}

function statusOptionsFor(kind: 'order' | 'appointment') {
  return kind === 'order' ? ['Pendiente', 'Preparando', 'Enviado', 'Entregado', 'Cancelado'] : ['Pendiente', 'Confirmada', 'Completada', 'Cancelada']
}

function OrderTable({ orders, onRefresh, onDelete, onInvoice }: { orders: Order[]; onRefresh: () => Promise<void>; onDelete: (order: Order) => void; onInvoice: (order: Order) => void }) {
  return <div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Fecha</th><th>Estado</th><th>Pago</th><th>Total</th><th /></tr></thead><tbody>{orders.map((order) => <tr key={order.id}>
    <td data-label="Pedido"><strong>{order.orderNumber}</strong></td>
    <td data-label="Cliente">{order.customerName}<small>{order.phone}</small></td>
    <td data-label="Fecha">{shortDate(order.createdAt)}</td>
    <td data-label="Estado"><select value={order.status} onChange={async (event) => {
      const status = event.target.value
      try { await updateOrderStatus({ data: { id: order.id, status, paymentStatus: order.paymentStatus } }); await onRefresh() }
      catch (caught) {
        const message = caught instanceof Error ? caught.message : 'No pudimos actualizar el estado.'
        if (message.includes('factura relacionada') && confirm(`${message}\n\n¿Confirmas de todas formas?`)) { await updateOrderStatus({ data: { id: order.id, status, paymentStatus: order.paymentStatus, force: true } }); await onRefresh() }
        else if (!message.includes('factura relacionada')) alert(message)
      }
    }}>{statusOptionsFor('order').map((option) => <option key={option}>{option}</option>)}</select></td>
    <td data-label="Pago"><select value={order.paymentStatus} onChange={async (event) => { await updateOrderStatus({ data: { id: order.id, status: order.status, paymentStatus: event.target.value } }); await onRefresh() }}><option>Pendiente</option><option>Pagado</option><option>Reembolsado</option></select></td>
    <td data-label="Total"><strong>{money(order.total)}</strong></td>
    <td className="col-actions"><div className="row-actions"><button title="Ver factura" onClick={() => onInvoice(order)}><ReceiptText /></button><button title="Eliminar" onClick={() => onDelete(order)}><Trash2 /></button></div></td>
  </tr>)}</tbody></table>{!orders.length && <div className="empty-admin">Todavía no hay pedidos.</div>}</div>
}

function AppointmentTable({ appointments, onRefresh, onDelete, onInvoice }: { appointments: Appointment[]; onRefresh: () => Promise<void>; onDelete: (item: Appointment) => void; onInvoice: (item: Appointment) => void }) {
  return <div className="table-wrap"><table><thead><tr><th>Cita</th><th>Clienta</th><th>Servicio</th><th>Fecha y hora</th><th>Estado</th><th>Pago</th><th>Precio</th><th /></tr></thead><tbody>{appointments.map((item) => <tr key={item.id}>
    <td data-label="Cita"><strong>{item.appointmentNumber}</strong></td>
    <td data-label="Clienta">{item.customerName}<small>{item.phone}</small></td>
    <td data-label="Servicio">{item.serviceName}</td>
    <td data-label="Fecha y hora">{item.date} · {item.time}</td>
    <td data-label="Estado"><select value={item.status} onChange={async (event) => {
      const status = event.target.value
      try { await updateAppointmentStatus({ data: { id: item.id, status, paymentStatus: item.paymentStatus } }); await onRefresh() }
      catch (caught) {
        const message = caught instanceof Error ? caught.message : 'No pudimos actualizar el estado.'
        if (message.includes('factura relacionada') && confirm(`${message}\n\n¿Confirmas de todas formas?`)) { await updateAppointmentStatus({ data: { id: item.id, status, paymentStatus: item.paymentStatus, force: true } }); await onRefresh() }
        else if (!message.includes('factura relacionada')) alert(message)
      }
    }}>{statusOptionsFor('appointment').map((option) => <option key={option}>{option}</option>)}</select></td>
    <td data-label="Pago"><select value={item.paymentStatus} onChange={async (event) => { await updateAppointmentStatus({ data: { id: item.id, status: item.status, paymentStatus: event.target.value } }); await onRefresh() }}><option>Pendiente</option><option>Pagado</option><option>Reembolsado</option></select></td>
    <td data-label="Precio"><strong>{money(item.price)}</strong></td>
    <td className="col-actions"><div className="row-actions"><button title="Ver factura" onClick={() => onInvoice(item)}><ReceiptText /></button><button title="Eliminar" onClick={() => onDelete(item)}><Trash2 /></button></div></td>
  </tr>)}</tbody></table>{!appointments.length && <div className="empty-admin">No hay citas para mostrar.</div>}</div>
}

function InvoiceViewer({ invoice, payments, onClose }: { invoice: Invoice; payments: Payment[]; onClose: () => void }) {
  const [working, setWorking] = useState(false)
  const saldo = Math.max(invoice.total - invoice.paid, 0)
  return <div className="modal-wrap"><div className="modal-card invoice-modal"><button className="modal-close icon-button" onClick={onClose}>×</button>
    <span className="drawer-kicker">FACTURA {invoice.folio}</span>
    <h2>{invoice.customerName}</h2>
    <p className="invoice-summary">{invoice.concept}</p>
    <div className="invoice-figures">
      <div><span>Total</span><strong>{money(invoice.total)}</strong></div>
      <div><span>Abonado</span><strong>{money(invoice.paid)}</strong></div>
      <div><span>Saldo</span><strong className={saldo > 0 ? 'balance-due' : 'balance-clear'}>{money(saldo)}</strong></div>
    </div>
    <div className="invoice-actions">
      <button className="admin-action" disabled={working} onClick={async () => { setWorking(true); await downloadInvoicePdf(invoice); setWorking(false) }}><Download />Descargar factura</button>
      <button className="admin-action" disabled={working} onClick={async () => { setWorking(true); await shareInvoice(invoice); setWorking(false) }}><Share2 />Compartir por WhatsApp</button>
    </div>
    {payments.length > 0 && <div className="payment-history"><h3>Historial de abonos</h3>{payments.map((payment) => <div key={payment.id} className="payment-row"><div><strong>{money(payment.amount)}</strong><span>{payment.method} · {shortDate(payment.createdAt)}</span></div><div className="row-actions"><button onClick={() => downloadReceiptPdf(invoice, payment)}><Download size={15} />Recibo {payment.folio}</button><button onClick={() => shareReceipt(invoice, payment)}><Share2 size={15} /></button></div></div>)}</div>}
  </div></div>
}

function ContentEditor({ values, onChange, onUpload, onSave, busy, uploading }: { values: Record<string, string>; onChange: (value: Record<string, string>) => void; onUpload: (file: File) => void; onSave: () => Promise<void>; busy: boolean; uploading: boolean }) {
  const groups = useMemo(() => [
    ['Marca y navegación', ['brandName', 'brandTagline', 'navServices', 'navCatalog', 'navBenefits', 'navContact']],
    ['Hero principal', ['eyebrow', 'heroTitle', 'heroDescription', 'heroCta', 'heroImage']],
    ['Beneficios', ['benefitsTitle', 'benefit1Title', 'benefit1Text', 'benefit2Title', 'benefit2Text', 'benefit3Title', 'benefit3Text']],
    ['Servicios y catálogo', ['servicesTitle', 'servicesDescription', 'catalogTitle', 'catalogDescription']],
    ['Historia', ['storyTitle', 'storyText']],
    ['Footer, ubicación y redes', ['footerText', 'whatsapp', 'location', 'instagram', 'tiktok', 'schedule', 'developerCredit']],
    ['Carrito, checkout y citas', ['cartTitle', 'checkoutTitle', 'appointmentTitle']],
    ['Notificaciones', ['notificationEmail']],
  ], [])
  const labels: Record<string, string> = { brandName: 'Nombre de marca', brandTagline: 'Eslogan', navServices: 'Navegación: servicios', navCatalog: 'Navegación: productos', navBenefits: 'Navegación: beneficios', navContact: 'Navegación: contacto', eyebrow: 'Texto superior', heroTitle: 'Título principal', heroDescription: 'Descripción principal', heroCta: 'Botón principal', heroImage: 'Imagen principal (URL)', benefitsTitle: 'Título de beneficios', benefit1Title: 'Beneficio 1 — título', benefit1Text: 'Beneficio 1 — texto', benefit2Title: 'Beneficio 2 — título', benefit2Text: 'Beneficio 2 — texto', benefit3Title: 'Beneficio 3 — título', benefit3Text: 'Beneficio 3 — texto', servicesTitle: 'Título de servicios', servicesDescription: 'Descripción de servicios', catalogTitle: 'Título del catálogo', catalogDescription: 'Descripción del catálogo', storyTitle: 'Título de historia', storyText: 'Historia de marca', footerText: 'Descripción del footer', whatsapp: 'Número de WhatsApp', location: 'Ubicación', instagram: 'Instagram', tiktok: 'TikTok', schedule: 'Horario', developerCredit: 'Crédito del desarrollador', cartTitle: 'Título del carrito', checkoutTitle: 'Título del checkout', appointmentTitle: 'Título del formulario de citas', notificationEmail: 'Correo para avisos de pedidos y citas' }
  const hints: Record<string, string> = { notificationEmail: 'Cada vez que alguien complete un pedido o agende una cita, se enviará un correo automático con los detalles a esta dirección.' }
  return <section className="content-editor"><div className="editor-top"><div><span>TEXTOS E IMÁGENES</span><h2>Editor de la tienda</h2><p>Cambia la voz de la marca sin tocar el código.</p></div><button className="admin-action" disabled={busy} onClick={onSave}><Save />{busy ? 'Guardando...' : 'Guardar cambios'}</button></div>{groups.map(([title, keys]) => <div className="editor-group" key={title as string}><h3>{title}</h3><div className="editor-fields">{(keys as string[]).map((key) => <label className={['heroDescription', 'storyText', 'catalogDescription', 'servicesDescription'].includes(key) ? 'wide' : ''} key={key}>{labels[key]}{['heroDescription', 'storyText', 'catalogDescription', 'servicesDescription'].includes(key) ? <textarea rows={3} value={values[key] ?? ''} onChange={(event) => onChange({ ...values, [key]: event.target.value })} /> : <input type={key === 'notificationEmail' ? 'email' : 'text'} placeholder={key === 'notificationEmail' ? 'pedidos@tudominio.com' : undefined} value={values[key] ?? ''} onChange={(event) => onChange({ ...values, [key]: event.target.value })} />} {hints[key] && <small className="field-hint">{hints[key]}</small>} {key === 'heroImage' && <span className="inline-upload"><ImagePlus />{uploading ? 'Subiendo...' : 'Subir desde dispositivo'}<input hidden disabled={uploading} type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && onUpload(event.target.files[0])} /></span>}</label>)}</div></div>)}</section>
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
    <div className="admin-alert" style={{ background: '#faf4ea', color: '#7a6d5c', border: '1px solid #eee2cf' }}>
      <AlertTriangle size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
      Los elementos aquí se eliminan definitivamente 30 días después de enviarse a la papelera. Puedes restaurarlos antes de que se cumpla el plazo, o eliminarlos ya mismo. Las facturas nunca aparecen aquí: se anulan, pero se conservan siempre.
    </div>

    {isEmpty && <div className="empty-admin">La papelera está vacía.</div>}

    {trash.products.length > 0 && <section className="admin-card">
      <div className="card-title"><div><span>CATÁLOGO</span><h2>{trash.products.length} artículos en papelera</h2></div></div>
      <div className="admin-product-list">{trash.products.map((product) => <article key={product.id}>
        <img src={product.image} alt="" />
        <div><span>{product.kind === 'servicio' ? <><Scissors size={12} /> Servicio</> : <><Boxes size={12} /> Producto</>} · {product.category}</span><h3>{product.name}</h3><p><DaysLeftBadge daysLeft={product.daysLeft} /></p></div>
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
      <p style={{ color: '#a99a84', fontSize: 13, marginTop: -8 }}><ImageOff size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />Estas imágenes ya no están asignadas a ningún producto y se borrarán de GitHub automáticamente al vencer el plazo.</p>
      <div className="admin-product-list">{trash.images.map((image) => <article key={image.id}>
        <img src={image.url} alt="" />
        <div><span>{image.reason || 'Imagen reemplazada'}</span><h3>{image.path.split('/').pop()}</h3><p><DaysLeftBadge daysLeft={image.daysLeft} /></p></div>
      </article>)}</div>
    </section>}
  </div>
}
