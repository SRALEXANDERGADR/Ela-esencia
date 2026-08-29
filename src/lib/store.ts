import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db'
import { appointments, content, customers, invoices, orders, payments, products } from '../../db/schema'
import { createSession, clearSession, verifyPassword, verifySession } from './auth'
import { sendAppointmentNotificationEmail, sendOrderNotificationEmail } from './email'

export type CartLine = { productId: number; name: string; price: number; quantity: number; image: string }

const defaultContent: Record<string, string> = {
  brandName: 'ELA',
  brandTagline: 'La belleza de ser tú.',
  navServices: 'Servicios',
  navCatalog: 'Productos',
  navBenefits: 'Por qué elegirnos',
  navContact: 'Contacto',
  eyebrow: 'Belleza · Cuidado · Bienestar',
  heroTitle: 'La belleza de ser tú.',
  heroDescription: 'Servicios de belleza y productos artesanales hechos a mano, para realzar tu belleza natural y cuidar tu piel con amor.',
  heroCta: 'Ver servicios y productos',
  heroImage: 'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?auto=format&fit=crop&w=1400&q=85',
  benefitsTitle: 'Mimate. Cuida tu piel. Realza tu belleza.',
  benefit1Title: 'Productos artesanales',
  benefit1Text: 'Hechos a mano con ingredientes naturales.',
  benefit2Title: 'Hechos con amor',
  benefit2Text: 'Cada detalle está hecho para ti.',
  benefit3Title: 'Realza tu belleza',
  benefit3Text: 'Servicios personalizados para resaltar lo mejor de ti.',
  servicesTitle: 'Servicios de belleza',
  servicesDescription: 'Diseño de cejas y pestañas, pensados para realzar tu mirada de forma natural.',
  catalogTitle: 'Productos artesanales',
  catalogDescription: 'Jabones y mantequillas corporales elaborados artesanalmente con ingredientes naturales que limpian, nutren y cuidan tu piel.',
  storyTitle: 'La belleza de ser tú.',
  storyText: 'ELA nace para recordarte que cuidar tu piel y realzar tu belleza es también un acto de bienestar. Cada producto se elabora a mano y cada servicio se adapta a ti.',
  footerText: 'Belleza, cuidado y bienestar en Jarabacoa, República Dominicana.',
  whatsapp: '18298473618',
  location: 'Jarabacoa, República Dominicana',
  instagram: '@ela.esencia',
  tiktok: '@ela.esencia',
  schedule: 'Lunes a sábado · previa cita',
  developerCredit: 'Diseño y desarrollo de la tienda',
  cartTitle: 'Tu pedido',
  checkoutTitle: 'Completa tu pedido',
  appointmentTitle: 'Agenda tu cita',
  notificationEmail: '',
}

const seedProducts = [
  { kind: 'servicio', name: 'Diseño y arreglo de cejas', category: 'Cejas', description: 'Realza tu mirada con unas cejas definidas, armoniosas y adaptadas a tu rostro.', price: 15000, stock: 0, durationMinutes: 30, image: 'https://images.unsplash.com/photo-1583001931096-959e9a1a6223?auto=format&fit=crop&w=900&q=85', featured: true },
  { kind: 'servicio', name: 'Pestañas por grupito', category: 'Pestañas', description: 'Aplicación de pestañas por grupitos para lograr una mirada más intensa, natural y femenina, adaptada al estilo que deseas.', price: 30000, stock: 0, durationMinutes: 60, image: 'https://images.unsplash.com/photo-1591019479261-15d8f1a4c7c0?auto=format&fit=crop&w=900&q=85', featured: true },
  { kind: 'producto', name: 'Jabón artesanal ELA', category: 'Jabones', description: 'Jabones elaborados artesanalmente con ingredientes naturales que limpian, nutren y cuidan tu piel.', price: 20000, stock: 20, durationMinutes: 0, image: 'https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?auto=format&fit=crop&w=900&q=85', featured: true },
  { kind: 'producto', name: 'Mantequilla corporal artesanal', category: 'Mantequillas', description: 'Texturas nutritivas e hidratantes que dejan tu piel suave, luminosa y con un delicioso aroma.', price: 25000, stock: 15, durationMinutes: 0, image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=900&q=85', featured: true },
]

function pad(value: number, length = 2) {
  return String(value).padStart(length, '0')
}

/** Folio con el mismo espíritu que usa Alexander Perfiles: prefijo + fecha
 * de emisión (DDMMAAAA) + un número corto, para que sea legible de un
 * vistazo y no se repita entre documentos. */
function makeFolio(prefix: string) {
  const now = new Date()
  const fecha = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}`
  const rand = pad(Math.floor(Math.random() * 10000), 4)
  return `${prefix}-${fecha}-${rand}`
}

async function ensureSeeded() {
  await db.insert(content).values(Object.entries(defaultContent).map(([key, value]) => ({ key, value }))).onConflictDoNothing()
  const existing = await db.select({ count: sql<number>`count(*)` }).from(products)
  if (Number(existing[0]?.count ?? 0) === 0) await db.insert(products).values(seedProducts as any)
}

async function requireAdmin() {
  const ok = await verifySession()
  if (!ok) throw new Error('Debes iniciar sesión para continuar.')
}

async function findOrCreateCustomer(data: { name: string; email?: string; phone: string; address?: string }) {
  if (data.email) {
    const [existing] = await db.select().from(customers).where(eq(customers.email, data.email)).limit(1)
    if (existing) return existing
  }
  const [existingByPhone] = data.phone ? await db.select().from(customers).where(eq(customers.phone, data.phone)).limit(1) : []
  if (existingByPhone) return existingByPhone
  const [created] = await db.insert(customers).values({ name: data.name, email: data.email || '', phone: data.phone, address: data.address || '' }).returning()
  return created
}

// ───────────────────────────────────────────────────────────────────────
// SESIÓN
// ───────────────────────────────────────────────────────────────────────
export const login = createServerFn({ method: 'POST' })
  .inputValidator((data: { password: string }) => data)
  .handler(async ({ data }) => {
    const ok = await verifyPassword(data.password)
    if (!ok) throw new Error('Contraseña incorrecta.')
    await createSession()
    return true
  })

export const logout = createServerFn({ method: 'POST' }).handler(async () => {
  clearSession()
  return true
})

export const checkSession = createServerFn({ method: 'GET' }).handler(async () => {
  return verifySession()
})

// ───────────────────────────────────────────────────────────────────────
// TIENDA PÚBLICA
// ───────────────────────────────────────────────────────────────────────
export const getStorefront = createServerFn({ method: 'GET' }).handler(async () => {
  await ensureSeeded()
  const [productRows, contentRows] = await Promise.all([
    db.select().from(products).where(eq(products.active, true)).orderBy(desc(products.featured), products.id),
    db.select().from(content),
  ])
  return { products: productRows, content: Object.fromEntries(contentRows.map((item) => [item.key, item.value])) }
})

export const createOrder = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string; phone: string; email: string; address: string; items: CartLine[] }) => data)
  .handler(async ({ data }) => {
    if (!data.name || !data.phone || !data.items.length) throw new Error('Completa todos los datos del pedido.')
    const productRows = await db.select().from(products).where(inArray(products.id, data.items.map((item) => item.productId)))
    const calculated = data.items.map((item) => {
      const product = productRows.find((row) => row.id === item.productId)
      if (!product) throw new Error(`El producto ${item.name} ya no está disponible.`)
      if (product.kind === 'producto' && product.stock < item.quantity) throw new Error(`Stock insuficiente para ${item.name}.`)
      return { id: product.id, name: product.name, price: product.price, quantity: item.quantity }
    })
    const total = calculated.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const customer = await findOrCreateCustomer(data)
    const orderNumber = makeFolio('PED')
    const createdAt = new Date()

    const [order] = await db.transaction(async (tx) => {
      const inserted = await tx.insert(orders).values({ orderNumber, customerId: customer.id, customerName: data.name, email: data.email, phone: data.phone, address: data.address, items: calculated, total, createdAt }).returning()
      for (const item of calculated) await tx.update(products).set({ stock: sql`${products.stock} - ${item.quantity}` }).where(and(eq(products.id, item.id), sql`${products.stock} >= ${item.quantity}`))
      await tx.insert(invoices).values({
        folio: makeFolio('FAC'),
        sourceType: 'pedido',
        sourceId: inserted[0].id,
        customerId: customer.id,
        customerName: data.name,
        phone: data.phone,
        concept: `Pedido ${orderNumber} — ${calculated.length} artículo(s)`,
        total,
      })
      return inserted
    })

    const [notificationRow] = await db.select().from(content).where(eq(content.key, 'notificationEmail')).limit(1)
    if (notificationRow?.value) {
      await sendOrderNotificationEmail(env, notificationRow.value, { orderNumber, createdAt, customerName: data.name, email: data.email, phone: data.phone, address: data.address, total, items: calculated })
    }

    return { orderNumber, total, orderId: order.id }
  })

export const createAppointment = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string; phone: string; email: string; serviceId: number; date: string; time: string; notes: string }) => data)
  .handler(async ({ data }) => {
    if (!data.name || !data.phone || !data.serviceId || !data.date || !data.time) throw new Error('Completa todos los datos de la cita.')
    const [service] = await db.select().from(products).where(eq(products.id, data.serviceId)).limit(1)
    if (!service || service.kind !== 'servicio') throw new Error('El servicio seleccionado ya no está disponible.')
    const customer = await findOrCreateCustomer(data)
    const appointmentNumber = makeFolio('CITA')
    const createdAt = new Date()

    const [appointment] = await db.transaction(async (tx) => {
      const inserted = await tx.insert(appointments).values({ appointmentNumber, customerId: customer.id, customerName: data.name, phone: data.phone, email: data.email, serviceId: service.id, serviceName: service.name, price: service.price, date: data.date, time: data.time, notes: data.notes, createdAt }).returning()
      await tx.insert(invoices).values({
        folio: makeFolio('FAC'),
        sourceType: 'cita',
        sourceId: inserted[0].id,
        customerId: customer.id,
        customerName: data.name,
        phone: data.phone,
        concept: `${service.name} — cita del ${data.date} ${data.time}`,
        total: service.price,
      })
      return inserted
    })

    const [notificationRow] = await db.select().from(content).where(eq(content.key, 'notificationEmail')).limit(1)
    if (notificationRow?.value) {
      await sendAppointmentNotificationEmail(env, notificationRow.value, { appointmentNumber, createdAt, customerName: data.name, phone: data.phone, email: data.email, serviceName: service.name, price: service.price, date: data.date, time: data.time, notes: data.notes })
    }

    return { appointmentNumber, appointmentId: appointment.id }
  })

// ───────────────────────────────────────────────────────────────────────
// ADMIN — lectura
// ───────────────────────────────────────────────────────────────────────
export const getAdminData = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAdmin()
  await ensureSeeded()
  const [productRows, orderRows, appointmentRows, customerRows, invoiceRows, paymentRows, contentRows] = await Promise.all([
    db.select().from(products).orderBy(desc(products.createdAt)),
    db.select().from(orders).orderBy(desc(orders.createdAt)),
    db.select().from(appointments).orderBy(desc(appointments.date), desc(appointments.time)),
    db.select().from(customers).orderBy(desc(customers.createdAt)),
    db.select().from(invoices).orderBy(desc(invoices.createdAt)),
    db.select().from(payments).orderBy(desc(payments.createdAt)),
    db.select().from(content),
  ])
  return {
    products: productRows,
    orders: orderRows,
    appointments: appointmentRows,
    customers: customerRows,
    invoices: invoiceRows,
    payments: paymentRows,
    content: Object.fromEntries(contentRows.map((item) => [item.key, item.value])),
  }
})

// ───────────────────────────────────────────────────────────────────────
// ADMIN — productos y servicios
// ───────────────────────────────────────────────────────────────────────
export const saveProduct = createServerFn({ method: 'POST' })
  .inputValidator((data: { id?: number; kind: string; name: string; category: string; description: string; price: number; stock: number; durationMinutes: number; image: string; featured: boolean; active: boolean }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const values = { kind: data.kind, name: data.name, category: data.category, description: data.description, price: Number(data.price), stock: Number(data.stock), durationMinutes: Number(data.durationMinutes), image: data.image, featured: data.featured, active: data.active }
    if (data.id) {
      await db.update(products).set(values).where(eq(products.id, data.id))
      return data.id
    }
    const [created] = await db.insert(products).values(values).returning({ id: products.id })
    return created.id
  })

export const deleteProduct = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.delete(products).where(eq(products.id, data))
  return true
})

// ───────────────────────────────────────────────────────────────────────
// ADMIN — pedidos y citas
// ───────────────────────────────────────────────────────────────────────
export const updateOrderStatus = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; status: string; paymentStatus: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    await db.update(orders).set({ status: data.status, paymentStatus: data.paymentStatus }).where(eq(orders.id, data.id))
    return true
  })

export const deleteOrder = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.delete(orders).where(eq(orders.id, data))
  return true
})

export const updateAppointmentStatus = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; status: string; paymentStatus: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    await db.update(appointments).set({ status: data.status, paymentStatus: data.paymentStatus }).where(eq(appointments.id, data.id))
    return true
  })

export const deleteAppointment = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.delete(appointments).where(eq(appointments.id, data))
  return true
})

export const saveAppointmentAdmin = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string; phone: string; email: string; serviceId: number; date: string; time: string; notes: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const [service] = await db.select().from(products).where(eq(products.id, data.serviceId)).limit(1)
    if (!service) throw new Error('Selecciona un servicio válido.')
    const customer = await findOrCreateCustomer(data)
    const appointmentNumber = makeFolio('CITA')
    const [appointment] = await db.transaction(async (tx) => {
      const inserted = await tx.insert(appointments).values({ appointmentNumber, customerId: customer.id, customerName: data.name, phone: data.phone, email: data.email, serviceId: service.id, serviceName: service.name, price: service.price, date: data.date, time: data.time, notes: data.notes }).returning()
      await tx.insert(invoices).values({ folio: makeFolio('FAC'), sourceType: 'cita', sourceId: inserted[0].id, customerId: customer.id, customerName: data.name, phone: data.phone, concept: `${service.name} — cita del ${data.date} ${data.time}`, total: service.price })
      return inserted
    })
    return appointment.id
  })

// ───────────────────────────────────────────────────────────────────────
// ADMIN — facturas y abonos (saldo pendiente)
// ───────────────────────────────────────────────────────────────────────
export const registerPayment = createServerFn({ method: 'POST' })
  .inputValidator((data: { invoiceId: number; amount: number; method: string; note: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    if (!data.amount || data.amount <= 0) throw new Error('El monto del abono debe ser mayor a cero.')
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, data.invoiceId)).limit(1)
    if (!invoice) throw new Error('Factura no encontrada.')
    const folio = makeFolio('REC')
    const newPaid = invoice.paid + Number(data.amount)
    const status = newPaid >= invoice.total ? 'Pagada' : newPaid > 0 ? 'Abonado' : 'Pendiente'
    await db.transaction(async (tx) => {
      await tx.insert(payments).values({ folio, invoiceId: invoice.id, amount: Number(data.amount), method: data.method, note: data.note })
      await tx.update(invoices).set({ paid: newPaid, status }).where(eq(invoices.id, invoice.id))
    })
    return { folio }
  })

export const cancelInvoice = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.update(invoices).set({ status: 'Cancelada' }).where(eq(invoices.id, data))
  return true
})

// ───────────────────────────────────────────────────────────────────────
// ADMIN — contenido del sitio
// ───────────────────────────────────────────────────────────────────────
export const saveContent = createServerFn({ method: 'POST' }).inputValidator((data: Record<string, string>) => data).handler(async ({ data }) => {
  await requireAdmin()
  for (const [key, value] of Object.entries(data)) await db.insert(content).values({ key, value }).onConflictDoUpdate({ target: content.key, set: { value } })
  return true
})

// ───────────────────────────────────────────────────────────────────────
// ADMIN — clientes
// ───────────────────────────────────────────────────────────────────────
export const saveCustomer = createServerFn({ method: 'POST' })
  .inputValidator((data: { id?: number; name: string; email: string; phone: string; address: string; notes: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const name = data.name.trim()
    if (!name) throw new Error('El nombre es obligatorio.')
    const values = { name, email: data.email.trim(), phone: data.phone.trim(), address: data.address.trim(), notes: data.notes.trim() }
    if (data.id) {
      await db.update(customers).set(values).where(eq(customers.id, data.id))
      return data.id
    }
    const [created] = await db.insert(customers).values(values).returning({ id: customers.id })
    return created.id
  })

export const deleteCustomer = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.delete(customers).where(eq(customers.id, data))
  return true
})
