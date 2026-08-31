import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { and, desc, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm'
import { db } from '../../db'
import { appointments, content, customers, imageTrash, invoices, orders, payments, products } from '../../db/schema'
import { createSession, clearSession, verifyPassword, verifySession } from './auth'
import { sendAppointmentNotificationEmail, sendOrderNotificationEmail } from './email'
import { deleteImageFile, pathFromDownloadUrl } from './github'

// Días que un elemento permanece en papelera (productos, clientes, pedidos,
// citas e imágenes) antes de eliminarse definitivamente. Ver sección 8 del
// pedido de mejoras: las facturas y registros financieros NUNCA entran
// aquí, solo se archivan (status 'Cancelada').
const TRASH_DAYS = 30
const TRASH_MS = TRASH_DAYS * 24 * 60 * 60 * 1000

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

// Envía una imagen (por su download_url) a la papelera de imágenes. Si la
// URL no pertenece al repo configurado (ej. una imagen de Unsplash de la
// semilla inicial, o una URL externa pegada a mano), no hace nada: solo
// administramos lo que nosotros mismos subimos a GitHub.
async function trashImage(url: string, reason: string) {
  if (!url) return
  const path = pathFromDownloadUrl(env, url)
  if (!path) return
  await db.insert(imageTrash).values({ path, url, reason })
}

// Job de limpieza: borra definitivamente lo que lleva más de 30 días en
// papelera (productos/servicios, clientes, pedidos, citas) y, por
// separado, lo que lleva más de 30 días en la papelera de imágenes. Se
// ejecuta de forma perezosa cada vez que se abre el panel admin (mismo
// espíritu que `ensureSeeded`), así no depende de configurar un cron
// aparte para funcionar. Cada paso está aislado con try/catch para que un
// fallo puntual (ej. GitHub caído) no tumbe el resto de la limpieza.
async function cleanupExpired() {
  const cutoff = new Date(Date.now() - TRASH_MS)

  try {
    const expiredProducts = await db.select().from(products).where(and(isNotNull(products.deletedAt), lt(products.deletedAt, cutoff)))
    for (const product of expiredProducts) {
      await db.delete(products).where(eq(products.id, product.id))
      if (product.image) await trashImage(product.image, 'Producto eliminado definitivamente tras 30 días en papelera')
    }
  } catch { /* se reintenta en el próximo acceso al panel */ }

  try { await db.delete(customers).where(and(isNotNull(customers.deletedAt), lt(customers.deletedAt, cutoff))) } catch { /* idem */ }
  try { await db.delete(orders).where(and(isNotNull(orders.deletedAt), lt(orders.deletedAt, cutoff))) } catch { /* idem */ }
  try { await db.delete(appointments).where(and(isNotNull(appointments.deletedAt), lt(appointments.deletedAt, cutoff))) } catch { /* idem */ }

  try {
    const expiredImages = await db.select().from(imageTrash).where(lt(imageTrash.deletedAt, cutoff))
    for (const image of expiredImages) {
      try { await deleteImageFile(env, image.path) } catch { /* si GitHub falla, se reintenta luego: la fila no se borra */ continue }
      await db.delete(imageTrash).where(eq(imageTrash.id, image.id))
    }
  } catch { /* idem */ }
}

// Antes de cancelar/eliminar un pedido o una cita, revisa su factura
// relacionada (sección 3 del pedido de mejoras):
//  - Sin factura, o factura ya cancelada: no hay nada que sincronizar.
//  - Factura sin abonos: se cancela automáticamente junto con el pedido/cita.
//  - Factura con abonos: se exige confirmación especial (`force`) y, si se
//    confirma, el pedido/cita igual se cancela/elimina pero la factura NO
//    se toca, para conservar el historial financiero intacto.
async function checkInvoiceForCancel(sourceType: 'pedido' | 'cita', sourceId: number, force: boolean) {
  const [invoice] = await db.select().from(invoices).where(and(eq(invoices.sourceType, sourceType), eq(invoices.sourceId, sourceId))).limit(1)
  if (!invoice || invoice.status === 'Cancelada') return
  if (invoice.paid > 0) {
    if (!force) throw new Error(`Este registro tiene una factura relacionada (${invoice.folio}) con abonos ya registrados. Confirma de nuevo para continuar: el pedido/cita se cancelará pero la factura y su historial de pagos se conservarán intactos.`)
    return
  }
  await db.update(invoices).set({ status: 'Cancelada' }).where(eq(invoices.id, invoice.id))
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
    db.select().from(products).where(and(eq(products.active, true), isNull(products.deletedAt))).orderBy(desc(products.featured), products.id),
    db.select().from(content),
  ])
  return { products: productRows, content: Object.fromEntries(contentRows.map((item) => [item.key, item.value])) }
})

export const createOrder = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string; phone: string; email: string; address: string; items: CartLine[] }) => data)
  .handler(async ({ data }) => {
    if (!data.name || !data.phone || !data.items.length) throw new Error('Completa todos los datos del pedido.')
    const productRows = await db.select().from(products).where(and(inArray(products.id, data.items.map((item) => item.productId)), isNull(products.deletedAt)))
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

    // El driver HTTP de Neon no soporta transacciones interactivas, así que
    // estas operaciones se hacen en secuencia en vez de dentro de una tx.
    const [order] = await db.insert(orders).values({ orderNumber, customerId: customer.id, customerName: data.name, email: data.email, phone: data.phone, address: data.address, items: calculated, total, createdAt }).returning()
    for (const item of calculated) await db.update(products).set({ stock: sql`${products.stock} - ${item.quantity}` }).where(and(eq(products.id, item.id), sql`${products.stock} >= ${item.quantity}`))
    await db.insert(invoices).values({
      folio: makeFolio('FAC'),
      sourceType: 'pedido',
      sourceId: order.id,
      customerId: customer.id,
      customerName: data.name,
      phone: data.phone,
      concept: `Pedido ${orderNumber} — ${calculated.length} artículo(s)`,
      total,
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
    const [service] = await db.select().from(products).where(and(eq(products.id, data.serviceId), isNull(products.deletedAt))).limit(1)
    if (!service || service.kind !== 'servicio') throw new Error('El servicio seleccionado ya no está disponible.')
    const customer = await findOrCreateCustomer(data)
    const appointmentNumber = makeFolio('CITA')
    const createdAt = new Date()

    const [appointment] = await db.insert(appointments).values({ appointmentNumber, customerId: customer.id, customerName: data.name, phone: data.phone, email: data.email, serviceId: service.id, serviceName: service.name, price: service.price, date: data.date, time: data.time, notes: data.notes, createdAt }).returning()
    await db.insert(invoices).values({
      folio: makeFolio('FAC'),
      sourceType: 'cita',
      sourceId: appointment.id,
      customerId: customer.id,
      customerName: data.name,
      phone: data.phone,
      concept: `${service.name} — cita del ${data.date} ${data.time}`,
      total: service.price,
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
  await cleanupExpired()
  const [productRows, orderRows, appointmentRows, customerRows, invoiceRows, paymentRows, contentRows, trashedProducts, trashedOrders, trashedAppointments, trashedCustomers, trashedImages] = await Promise.all([
    db.select().from(products).where(isNull(products.deletedAt)).orderBy(desc(products.createdAt)),
    db.select().from(orders).where(isNull(orders.deletedAt)).orderBy(desc(orders.createdAt)),
    db.select().from(appointments).where(isNull(appointments.deletedAt)).orderBy(desc(appointments.date), desc(appointments.time)),
    db.select().from(customers).where(isNull(customers.deletedAt)).orderBy(desc(customers.createdAt)),
    db.select().from(invoices).orderBy(desc(invoices.createdAt)),
    db.select().from(payments).orderBy(desc(payments.createdAt)),
    db.select().from(content),
    db.select().from(products).where(isNotNull(products.deletedAt)).orderBy(desc(products.deletedAt)),
    db.select().from(orders).where(isNotNull(orders.deletedAt)).orderBy(desc(orders.deletedAt)),
    db.select().from(appointments).where(isNotNull(appointments.deletedAt)).orderBy(desc(appointments.deletedAt)),
    db.select().from(customers).where(isNotNull(customers.deletedAt)).orderBy(desc(customers.deletedAt)),
    db.select().from(imageTrash).orderBy(desc(imageTrash.deletedAt)),
  ])

  // A cada elemento en papelera se le agrega `daysLeft`: cuántos días
  // faltan para su eliminación definitiva automática, para que el panel
  // lo muestre sin tener que recalcular la regla de los 30 días en el cliente.
  const withDaysLeft = <T extends { deletedAt: Date | string | null }>(rows: T[]) => rows.map((row) => {
    const deletedAt = new Date(row.deletedAt as string).getTime()
    const daysLeft = Math.max(0, Math.ceil((deletedAt + TRASH_MS - Date.now()) / (24 * 60 * 60 * 1000)))
    return { ...row, daysLeft }
  })

  return {
    products: productRows,
    orders: orderRows,
    appointments: appointmentRows,
    customers: customerRows,
    invoices: invoiceRows,
    payments: paymentRows,
    content: Object.fromEntries(contentRows.map((item) => [item.key, item.value])),
    trash: {
      products: withDaysLeft(trashedProducts),
      orders: withDaysLeft(trashedOrders),
      appointments: withDaysLeft(trashedAppointments),
      customers: withDaysLeft(trashedCustomers),
      images: withDaysLeft(trashedImages),
    },
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
      const [current] = await db.select().from(products).where(eq(products.id, data.id)).limit(1)
      if (current && current.image && current.image !== data.image) {
        await trashImage(current.image, 'Imagen reemplazada desde el panel de administración')
      }
      await db.update(products).set(values).where(eq(products.id, data.id))
      return data.id
    }
    const [created] = await db.insert(products).values(values).returning({ id: products.id })
    return created.id
  })

// "Eliminar" un producto/servicio ahora lo manda a la papelera (30 días
// para restaurarlo) en vez de borrarlo físicamente. La imagen se conserva
// mientras el producto pueda restaurarse; solo se manda a su propia
// papelera cuando el producto se elimina definitivamente (`purgeProduct`
// manual, o automáticamente vía `cleanupExpired`).
export const deleteProduct = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.update(products).set({ deletedAt: new Date() }).where(eq(products.id, data))
  return true
})

export const restoreProduct = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.update(products).set({ deletedAt: null }).where(eq(products.id, data))
  return true
})

// Elimina definitivamente un producto/servicio antes de que se cumplan los
// 30 días automáticos (acción manual desde la papelera). Su imagen pasa a
// la papelera de imágenes, no se borra de GitHub al instante.
export const purgeProduct = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  const [product] = await db.select().from(products).where(eq(products.id, data)).limit(1)
  await db.delete(products).where(eq(products.id, data))
  if (product?.image) await trashImage(product.image, 'Producto eliminado definitivamente desde la papelera')
  return true
})

// ───────────────────────────────────────────────────────────────────────
// ADMIN — pedidos y citas
// ───────────────────────────────────────────────────────────────────────
export const updateOrderStatus = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; status: string; paymentStatus: string; force?: boolean }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    if (data.status === 'Cancelado') await checkInvoiceForCancel('pedido', data.id, Boolean(data.force))
    await db.update(orders).set({ status: data.status, paymentStatus: data.paymentStatus }).where(eq(orders.id, data.id))
    return true
  })

// "Eliminar" un pedido lo manda a la papelera. Antes revisa su factura
// relacionada (ver `checkInvoiceForCancel`): si tiene abonos, exige
// `force: true` para continuar y NO la cancela; si no tiene abonos, la
// cancela automáticamente junto con el pedido.
export const deleteOrder = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; force?: boolean }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    await checkInvoiceForCancel('pedido', data.id, Boolean(data.force))
    await db.update(orders).set({ deletedAt: new Date() }).where(eq(orders.id, data.id))
    return true
  })

export const restoreOrder = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.update(orders).set({ deletedAt: null }).where(eq(orders.id, data))
  return true
})

export const purgeOrder = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.delete(orders).where(eq(orders.id, data))
  return true
})

export const updateAppointmentStatus = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; status: string; paymentStatus: string; force?: boolean }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    if (data.status === 'Cancelada') await checkInvoiceForCancel('cita', data.id, Boolean(data.force))
    await db.update(appointments).set({ status: data.status, paymentStatus: data.paymentStatus }).where(eq(appointments.id, data.id))
    return true
  })

export const deleteAppointment = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; force?: boolean }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    await checkInvoiceForCancel('cita', data.id, Boolean(data.force))
    await db.update(appointments).set({ deletedAt: new Date() }).where(eq(appointments.id, data.id))
    return true
  })

export const restoreAppointment = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.update(appointments).set({ deletedAt: null }).where(eq(appointments.id, data))
  return true
})

export const purgeAppointment = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.delete(appointments).where(eq(appointments.id, data))
  return true
})

export const saveAppointmentAdmin = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string; phone: string; email: string; serviceId: number; date: string; time: string; notes: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const [service] = await db.select().from(products).where(and(eq(products.id, data.serviceId), isNull(products.deletedAt))).limit(1)
    if (!service) throw new Error('Selecciona un servicio válido.')
    const customer = await findOrCreateCustomer(data)
    const appointmentNumber = makeFolio('CITA')
    const [appointment] = await db.insert(appointments).values({ appointmentNumber, customerId: customer.id, customerName: data.name, phone: data.phone, email: data.email, serviceId: service.id, serviceName: service.name, price: service.price, date: data.date, time: data.time, notes: data.notes }).returning()
    await db.insert(invoices).values({ folio: makeFolio('FAC'), sourceType: 'cita', sourceId: appointment.id, customerId: customer.id, customerName: data.name, phone: data.phone, concept: `${service.name} — cita del ${data.date} ${data.time}`, total: service.price })
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
    await db.insert(payments).values({ folio, invoiceId: invoice.id, amount: Number(data.amount), method: data.method, note: data.note })
    await db.update(invoices).set({ paid: newPaid, status }).where(eq(invoices.id, invoice.id))
    return { folio }
  })

// "Anular factura" (antes "eliminar"): la factura nunca se borra
// físicamente, solo cambia a estado 'Cancelada' y deja de contar para
// saldos pendientes. Si ya tiene abonos registrados, exige `force: true`
// para evitar anulaciones accidentales de facturas con dinero de por medio.
export const cancelInvoice = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; force?: boolean }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, data.id)).limit(1)
    if (!invoice) throw new Error('Factura no encontrada.')
    if (invoice.paid > 0 && !data.force) throw new Error('Esta factura ya tiene abonos registrados. Confirma de nuevo para anularla de todas formas.')
    await db.update(invoices).set({ status: 'Cancelada' }).where(eq(invoices.id, data.id))
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
  await db.update(customers).set({ deletedAt: new Date() }).where(eq(customers.id, data))
  return true
})

export const restoreCustomer = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.update(customers).set({ deletedAt: null }).where(eq(customers.id, data))
  return true
})

export const purgeCustomer = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.delete(customers).where(eq(customers.id, data))
  return true
})
