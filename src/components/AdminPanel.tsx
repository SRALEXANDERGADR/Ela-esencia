import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Boxes, Calendar, Download, FileText, ImagePlus, LayoutDashboard, LoaderCircle, LogOut, Pencil, PlusCircle, ReceiptText, Save, Scissors, Search, Share2, Trash2, UserPlus, Users, Wallet } from 'lucide-react'
import { cancelInvoice, checkSession, deleteAppointment, deleteCustomer, deleteOrder, deleteProduct, getAdminData, login, logout, registerPayment, saveAppointmentAdmin, saveContent, saveCustomer, saveProduct, updateAppointmentStatus, updateOrderStatus } from '@/lib/store'
import { downloadInvoicePdf, downloadReceiptPdf, shareInvoice, type InvoiceLike, type PaymentLike } from '@/lib/invoice'

type Product = { id: number; kind: string; name: string; category: string; description: string; price: number; stock: number; durationMinutes: number; image: string; featured: boolean; active: boolean }
type Order = { id: number; orderNumber: string; customerName: string; email: string; phone: string; address: string; total: number; status: string; paymentStatus: string; items: Array<{ name: string; price: number; quantity: number }>; createdAt: string | Date }
type Appointment = { id: number; appointmentNumber: string; customerName: string; phone: string; email: string; serviceId: number | null; serviceName: string; price: number; date: string; time: string; notes: string; status: string; paymentStatus: string; createdAt: string | Date }
type Customer = { id: number; name: string; email: string; phone: string; address: string; notes: string; createdAt: string | Date }
type Invoice = InvoiceLike & { sourceId: number; customerId: number | null }
type Payment = PaymentLike & { id: number; invoiceId: number }
type AdminData = { products: Product[]; orders: Order[]; appointments: Appointment[]; customers: Customer[]; invoices: Invoice[]; payments: Payment[]; content: Record<string, string> }
type Tab = 'resumen' | 'catalogo' | 'citas' | 'pedidos' | 'facturas' | 'clientes' | 'contenido'
type CustomerDraft = { id?: number; name: string; email: string; phone: string; address: string; notes: string }
type ProductDraft = { id?: number; kind: string; name: string; category: string; description: string; price: number; stock: number; durationMinutes: number; image: string; featured: boolean; active: boolean }
type AppointmentDraft = { name: string; phone: string; email: string; serviceId: number; date: string; time: string; notes: string }

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

  async function uploadImage(file: File, target: 'product' | 'hero') {
    setBusy(true); setError('')
    try {
      const body = new FormData(); body.append('file', file)
      const response = await fetch('/api/upload', { method: 'POST', body })
      const result = await response.json() as { url?: string; error?: string }
      if (!response.ok || !result.url) throw new Error(result.error || 'No pudimos subir la imagen.')
      if (target === 'product') setEditing((current) => current ? { ...current, image: result.url! } : current)
      else setContentDraft((current) => ({ ...current, heroImage: result.url! }))
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos subir la imagen.') }
    finally { setBusy(false) }
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
          <OrderTable orders={data.orders.slice(0, 5)} onRefresh={refresh} onDelete={async (order) => { if (confirm(`¿Eliminar el pedido ${order.orderNumber}?`)) { await deleteOrder({ data: order.id }); await refresh() } }} onInvoice={(order) => setViewingInvoice(findInvoiceFor('pedido', order.id))} />
        </section>
        <section className="admin-card">
          <div className="card-title"><div><span>AGENDA</span><h2>Próximas citas</h2></div><button onClick={() => setTab('citas')}>Ver todas</button></div>
          <AppointmentTable appointments={data.appointments.filter((item) => item.date >= todayIso()).slice(0, 5)} onRefresh={refresh} onDelete={async (item) => { if (confirm(`¿Eliminar la cita ${item.appointmentNumber}?`)) { await deleteAppointment({ data: item.id }); await refresh() } }} onInvoice={(item) => setViewingInvoice(findInvoiceFor('cita', item.id))} />
        </section>
      </div>}

      {tab === 'catalogo' && <section className="admin-card">
        <div className="card-title"><div><span>SERVICIOS Y PRODUCTOS</span><h2>{filteredProducts.length} artículos</h2></div><button className="admin-action" onClick={() => setEditing(blankProduct)}><PlusCircle />Nuevo artículo</button></div>
        <label className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o categoría…" /></label>
        <div className="admin-product-list">{filteredProducts.map((product) => <article key={product.id}><img src={product.image} alt="" /><div><span>{product.kind === 'servicio' ? <><Scissors size={12} /> Servicio</> : <><Boxes size={12} /> Producto</>} · {product.category}</span><h3>{product.name}</h3><p>{product.kind === 'servicio' ? `${product.durationMinutes} min` : `${product.stock} unidades`} · {money(product.price)}{!product.active && ' · Inactivo'}</p></div><div className="row-actions"><button onClick={() => setEditing(product)}><Pencil /></button><button onClick={async () => { if (confirm('¿Eliminar este artículo?')) { await deleteProduct({ data: product.id }); await refresh() } }}><Trash2 /></button></div></article>)}{!filteredProducts.length && <div className="empty-admin">No hay artículos que mostrar.</div>}</div>
      </section>}

      {tab === 'citas' && <section className="admin-card">
        <div className="card-title"><div><span>AGENDA</span><h2>{filteredAppointments.length} citas</h2></div><button className="admin-action" onClick={() => setBookingDraft({ name: '', phone: '', email: '', serviceId: services[0]?.id ?? 0, date: todayIso(), time: '10:00', notes: '' })}><PlusCircle />Nueva cita</button></div>
        <label className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por número, cliente o servicio…" /></label>
        <AppointmentTable appointments={filteredAppointments} onRefresh={refresh} onDelete={async (item) => { if (confirm(`¿Eliminar la cita ${item.appointmentNumber}?`)) { await deleteAppointment({ data: item.id }); await refresh() } }} onInvoice={(item) => setViewingInvoice(findInvoiceFor('cita', item.id))} />
      </section>}

      {tab === 'pedidos' && <section className="admin-card">
        <div className="card-title"><div><span>HISTORIAL</span><h2>Pedidos de productos</h2></div></div>
        <label className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por número o cliente…" /></label>
        <OrderTable orders={filteredOrders} onRefresh={refresh} onDelete={async (order) => { if (confirm(`¿Eliminar el pedido ${order.orderNumber}?`)) { await deleteOrder({ data: order.id }); await refresh() } }} onInvoice={(order) => setViewingInvoice(findInvoiceFor('pedido', order.id))} />
      </section>}

      {tab === 'facturas' && <section className="admin-card">
        <div className="card-title"><div><span>COBRANZA</span><h2>{filteredInvoices.length} facturas</h2></div></div>
        <label className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por folio, cliente o concepto…" /></label>
        <div className="table-wrap"><table><thead><tr><th>Folio</th><th>Cliente</th><th>Concepto</th><th>Fecha</th><th>Total</th><th>Abonado</th><th>Saldo</th><th>Estado</th><th /></tr></thead><tbody>{filteredInvoices.map((invoice) => {
          const saldo = Math.max(invoice.total - invoice.paid, 0)
          return <tr key={invoice.id}>
            <td><strong>{invoice.folio}</strong></td>
            <td>{invoice.customerName}<small>{invoice.phone}</small></td>
            <td>{invoice.concept}</td>
            <td>{shortDate(invoice.createdAt)}</td>
            <td>{money(invoice.total)}</td>
            <td>{money(invoice.paid)}</td>
            <td><strong className={saldo > 0 ? 'balance-due' : 'balance-clear'}>{money(saldo)}</strong></td>
            <td><span className={`status-pill status-${invoice.status.toLowerCase()}`}>{invoice.status}</span></td>
            <td><div className="row-actions">
              {saldo > 0 && invoice.status !== 'Cancelada' && <button title="Registrar abono" onClick={() => setPayingInvoice(invoice)}><Wallet /></button>}
              <button title="Ver factura" onClick={() => setViewingInvoice(invoice)}><ReceiptText /></button>
              {invoice.status !== 'Cancelada' && <button title="Cancelar factura" onClick={async () => { if (confirm(`¿Cancelar la factura ${invoice.folio}?`)) { await cancelInvoice({ data: invoice.id }); await refresh() } }}><Trash2 /></button>}
            </div></td>
          </tr>
        })}</tbody></table>{!filteredInvoices.length && <div className="empty-admin">Todavía no hay facturas.</div>}</div>
      </section>}

      {tab === 'clientes' && <section className="admin-card">
        <div className="card-title"><div><span>COMUNIDAD</span><h2>{filteredCustomers.length} clientes</h2></div><button className="admin-action" onClick={() => setEditingCustomer(blankCustomer)}><UserPlus />Nuevo cliente</button></div>
        <label className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, correo o teléfono…" /></label>
        <div className="customer-grid">{filteredCustomers.map((customer) => <article key={customer.id}><div className="customer-card-top"><div className="avatar">{customer.name.slice(0, 2).toUpperCase()}</div><div className="row-actions"><button onClick={() => setEditingCustomer(customer)}><Pencil /></button><button onClick={async () => { if (confirm(`¿Eliminar a ${customer.name}?`)) { await deleteCustomer({ data: customer.id }); await refresh() } }}><Trash2 /></button></div></div><h3>{customer.name}</h3>{customer.email && <a href={`mailto:${customer.email}`}>{customer.email}</a>}<p>{customer.phone}</p><p>{customer.address}</p>{customer.notes && <small className="customer-notes">{customer.notes}</small>}<small>{data.orders.filter((order) => order.customerName === customer.name).length} pedidos · {data.appointments.filter((item) => item.customerName === customer.name).length} citas</small></article>)}{!filteredCustomers.length && <div className="empty-admin">No hay clientes que mostrar.</div>}</div>
      </section>}

      {tab === 'contenido' && <ContentEditor values={contentDraft} onChange={setContentDraft} onUpload={(file) => uploadImage(file, 'hero')} onSave={async () => { setBusy(true); await saveContent({ data: contentDraft }); await refresh(); setBusy(false) }} busy={busy} />}
    </main>

    {editing && <div className="modal-wrap"><form className="product-modal" onSubmit={handleProduct}><button type="button" className="modal-close" onClick={() => setEditing(null)}>×</button><span>CATÁLOGO</span><h2>{editing.id ? 'Editar artículo' : 'Nuevo artículo'}</h2>
      <div className="form-grid">
        <label>Tipo<select value={editing.kind} onChange={(event) => setEditing({ ...editing, kind: event.target.value })}><option value="servicio">Servicio (se agenda)</option><option value="producto">Producto (se compra)</option></select></label>
        <label>Categoría<input required placeholder="Cejas, Pestañas, Jabones..." value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value })} /></label>
        <label>Nombre<input required value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>
        <label className="wide">Descripción<textarea required rows={3} value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} /></label>
        <label>Precio en centavos<input required type="number" min="0" value={editing.price} onChange={(event) => setEditing({ ...editing, price: Number(event.target.value) })} /></label>
        {editing.kind === 'producto' ? <label>Existencias<input required type="number" min="0" value={editing.stock} onChange={(event) => setEditing({ ...editing, stock: Number(event.target.value) })} /></label> : <label>Duración (minutos)<input required type="number" min="5" value={editing.durationMinutes} onChange={(event) => setEditing({ ...editing, durationMinutes: Number(event.target.value) })} /></label>}
        <label className="wide">URL de imagen<input required value={editing.image} onChange={(event) => setEditing({ ...editing, image: event.target.value })} /></label>
        <label className="upload-zone wide"><ImagePlus />Subir imagen desde el dispositivo<input hidden type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && uploadImage(event.target.files[0], 'product')} /></label>
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
    <td><strong>{order.orderNumber}</strong></td>
    <td>{order.customerName}<small>{order.phone}</small></td>
    <td>{shortDate(order.createdAt)}</td>
    <td><select value={order.status} onChange={async (event) => { await updateOrderStatus({ data: { id: order.id, status: event.target.value, paymentStatus: order.paymentStatus } }); await onRefresh() }}>{statusOptionsFor('order').map((option) => <option key={option}>{option}</option>)}</select></td>
    <td><select value={order.paymentStatus} onChange={async (event) => { await updateOrderStatus({ data: { id: order.id, status: order.status, paymentStatus: event.target.value } }); await onRefresh() }}><option>Pendiente</option><option>Pagado</option><option>Reembolsado</option></select></td>
    <td><strong>{money(order.total)}</strong></td>
    <td><div className="row-actions"><button title="Ver factura" onClick={() => onInvoice(order)}><ReceiptText /></button><button title="Eliminar" onClick={() => onDelete(order)}><Trash2 /></button></div></td>
  </tr>)}</tbody></table>{!orders.length && <div className="empty-admin">Todavía no hay pedidos.</div>}</div>
}

function AppointmentTable({ appointments, onRefresh, onDelete, onInvoice }: { appointments: Appointment[]; onRefresh: () => Promise<void>; onDelete: (item: Appointment) => void; onInvoice: (item: Appointment) => void }) {
  return <div className="table-wrap"><table><thead><tr><th>Cita</th><th>Clienta</th><th>Servicio</th><th>Fecha y hora</th><th>Estado</th><th>Pago</th><th>Precio</th><th /></tr></thead><tbody>{appointments.map((item) => <tr key={item.id}>
    <td><strong>{item.appointmentNumber}</strong></td>
    <td>{item.customerName}<small>{item.phone}</small></td>
    <td>{item.serviceName}</td>
    <td>{item.date} · {item.time}</td>
    <td><select value={item.status} onChange={async (event) => { await updateAppointmentStatus({ data: { id: item.id, status: event.target.value, paymentStatus: item.paymentStatus } }); await onRefresh() }}>{statusOptionsFor('appointment').map((option) => <option key={option}>{option}</option>)}</select></td>
    <td><select value={item.paymentStatus} onChange={async (event) => { await updateAppointmentStatus({ data: { id: item.id, status: item.status, paymentStatus: event.target.value } }); await onRefresh() }}><option>Pendiente</option><option>Pagado</option><option>Reembolsado</option></select></td>
    <td><strong>{money(item.price)}</strong></td>
    <td><div className="row-actions"><button title="Ver factura" onClick={() => onInvoice(item)}><ReceiptText /></button><button title="Eliminar" onClick={() => onDelete(item)}><Trash2 /></button></div></td>
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
      <button className="admin-action" disabled={working} onClick={() => shareInvoice(invoice, invoice.phone)}><Share2 />Compartir por WhatsApp</button>
    </div>
    {payments.length > 0 && <div className="payment-history"><h3>Historial de abonos</h3>{payments.map((payment) => <div key={payment.id} className="payment-row"><div><strong>{money(payment.amount)}</strong><span>{payment.method} · {shortDate(payment.createdAt)}</span></div><button onClick={() => downloadReceiptPdf(invoice, payment)}><Download size={15} />Recibo {payment.folio}</button></div>)}</div>}
  </div></div>
}

function ContentEditor({ values, onChange, onUpload, onSave, busy }: { values: Record<string, string>; onChange: (value: Record<string, string>) => void; onUpload: (file: File) => void; onSave: () => Promise<void>; busy: boolean }) {
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
  return <section className="content-editor"><div className="editor-top"><div><span>TEXTOS E IMÁGENES</span><h2>Editor de la tienda</h2><p>Cambia la voz de la marca sin tocar el código.</p></div><button className="admin-action" disabled={busy} onClick={onSave}><Save />{busy ? 'Guardando...' : 'Guardar cambios'}</button></div>{groups.map(([title, keys]) => <div className="editor-group" key={title as string}><h3>{title}</h3><div className="editor-fields">{(keys as string[]).map((key) => <label className={['heroDescription', 'storyText', 'catalogDescription', 'servicesDescription'].includes(key) ? 'wide' : ''} key={key}>{labels[key]}{['heroDescription', 'storyText', 'catalogDescription', 'servicesDescription'].includes(key) ? <textarea rows={3} value={values[key] ?? ''} onChange={(event) => onChange({ ...values, [key]: event.target.value })} /> : <input type={key === 'notificationEmail' ? 'email' : 'text'} placeholder={key === 'notificationEmail' ? 'pedidos@tudominio.com' : undefined} value={values[key] ?? ''} onChange={(event) => onChange({ ...values, [key]: event.target.value })} />} {hints[key] && <small className="field-hint">{hints[key]}</small>} {key === 'heroImage' && <span className="inline-upload"><ImagePlus />Subir desde dispositivo<input hidden type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && onUpload(event.target.files[0])} /></span>}</label>)}</div></div>)}</section>
}
