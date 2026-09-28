import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm'
import { db } from '../../db'
import { appointments, content, customers, expenses, imageTrash, invoices, orders, payments, products, purchases, pushSubscriptions } from '../../db/schema'
import { createSession, clearSession, verifyPassword, verifySession } from './auth'
import { parseEmailList, sendAppointmentNotificationEmail, sendOrderNotificationEmail } from './email'
import { deleteImage, imagePathFromUrl } from './fotos'
import { formatMoney } from './money'
import { generateVapidKeys, sendPush } from './push'
import type { PushMessage, VapidKeys } from './push'

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
  // Se muestran en el pie de la tienda (separados por coma). Vacío = no se muestran.
  paymentMethods: 'Efectivo, Transferencia',
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
  // 6 dígitos: con 4 había 1 en 10.000 de repetir folio el mismo día y
  // el pedido fallaba por la restricción UNIQUE.
  const rand = pad(Math.floor(Math.random() * 1_000_000), 6)
  return `${prefix}-${fecha}-${rand}`
}

// Los productos de ejemplo se ponen UNA sola vez (tienda nueva). Antes, si
// la dueña borraba todos sus productos, los de ejemplo volvían a salir.
let seeded = false
async function ensureSeeded() {
  if (seeded) return
  await db.insert(content).values(Object.entries(defaultContent).map(([key, value]) => ({ key, value }))).onConflictDoNothing()
  const [flag] = await db.select().from(content).where(eq(content.key, 'productsSeeded')).limit(1)
  if (!flag) {
    const existing = await db.select({ count: sql<number>`count(*)` }).from(products)
    if (Number(existing[0]?.count ?? 0) === 0) await db.insert(products).values(seedProducts as any)
    await db.insert(content).values({ key: 'productsSeeded', value: '1' }).onConflictDoNothing()
  }
  seeded = true
}

// ───────────────────────────────────────────────────────────────────────
// ESQUEMA — las tablas nuevas se crean solas la primera vez que arranca el
// Worker (no hace falta correr migraciones a mano en Neon). Si ya existen,
// solo se hace una consulta rápida (una vez por instancia).
// ───────────────────────────────────────────────────────────────────────
let schemaReady: Promise<void> | null = null
function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      // Sube el número si agregas otra tabla/columna aquí.
      const result = await db.execute(sql`select
        (select count(*) from information_schema.tables where table_schema = current_schema() and table_name in ('push_subscriptions', 'purchases', 'expenses'))
        + (select count(*) from information_schema.columns where table_schema = current_schema() and ((table_name = 'invoices' and column_name = 'deleted_at') or (table_name = 'products' and column_name in ('cost', 'original_price', 'images')))) as n`)
      const rows = ((result as unknown as { rows?: Array<{ n: number | string }> }).rows ?? (result as unknown as Array<{ n: number | string }>)) || []
      if (Number(rows[0]?.n ?? 0) >= 7) return
      await db.execute(sql`ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp`)
      await db.execute(sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "cost" integer NOT NULL DEFAULT 0`)
      await db.execute(sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "original_price" integer NOT NULL DEFAULT 0`)
      await db.execute(sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "images" jsonb NOT NULL DEFAULT '[]'::jsonb`)
      await db.execute(sql`CREATE TABLE IF NOT EXISTS "purchases" ("id" serial PRIMARY KEY, "product_id" integer NOT NULL, "product_name" text NOT NULL, "fund" text NOT NULL DEFAULT 'capital', "quantity" integer NOT NULL, "unit_cost" integer NOT NULL, "total_cost" integer NOT NULL, "remaining_quantity" integer NOT NULL, "notes" text NOT NULL DEFAULT '', "created_at" timestamp NOT NULL DEFAULT now())`)
      await db.execute(sql`CREATE TABLE IF NOT EXISTS "expenses" ("id" serial PRIMARY KEY, "type" text NOT NULL DEFAULT 'negocio', "description" text NOT NULL, "amount" integer NOT NULL, "created_at" timestamp NOT NULL DEFAULT now())`)
      await db.execute(sql`CREATE TABLE IF NOT EXISTS "push_subscriptions" ("id" serial PRIMARY KEY, "endpoint" text NOT NULL UNIQUE, "p256dh" text NOT NULL, "auth" text NOT NULL, "label" text NOT NULL DEFAULT '', "created_at" timestamp NOT NULL DEFAULT now())`)
    })().catch((error) => {
      schemaReady = null // se reintenta en la próxima petición
      throw error
    })
  }
  return schemaReady
}

async function requireAdmin() {
  const ok = await verifySession()
  if (!ok) throw new Error('Debes iniciar sesión para continuar.')
  await ensureSchema() // la columna invoices.deleted_at tiene que existir antes de leer facturas
}

// Fecha de hoy (YYYY-MM-DD) en República Dominicana (UTC-4, sin horario
// de verano). El Worker corre en UTC: sin esto, después de las 8 p. m.
// "hoy" ya sería mañana.
function todayInDR() {
  return new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

const clean = (value: unknown, max = 300) => String(value ?? '').trim().slice(0, max)

const ORDER_STATUSES = ['Pendiente', 'Preparando', 'Enviado', 'Entregado', 'Cancelado']
const APPOINTMENT_STATUSES = ['Pendiente', 'Confirmada', 'Completada', 'Cancelada']
const PAYMENT_STATUSES = ['Pendiente', 'Pagado', 'Reembolsado']
function checkStatus(status: string, paymentStatus: string, allowed: string[]) {
  if (!allowed.includes(status) || !PAYMENT_STATUSES.includes(paymentStatus)) throw new Error('Estado no válido.')
}

// Claves del contenido que son configuración privada y no deben llegar
// a la tienda pública (cualquiera podría leerlas en el navegador).
const PRIVATE_CONTENT_KEYS = ['notificationEmail', 'vapidKeys', 'productsSeeded', 'capitalInicial', 'reinvestPercent']

// ───────────────────────────────────────────────────────────────────────
// INVENTARIO Y LOTES (FIFO) — igual que en JB Tech Store (sin opciones).
// Cada compra ("Reponer") es un lote con su costo. Al vender, sale primero
// del lote más viejo que todavía tenga unidades.
// ───────────────────────────────────────────────────────────────────────
type OrderItem = { id: number; name: string; price: number; quantity: number; cost?: number; reinvCost?: number; reinvQty?: number }
const FUNDS = ['capital', 'reinversion'] as const
type Fund = (typeof FUNDS)[number]
/** Lo que costaron unas unidades vendidas, y cuánto de eso (y cuántas
 * unidades) salió de lotes pagados con el dinero para reinvertir. */
type TakenCost = { cost: number; reinv: number; reinvQty: number }

/** Línea de pedido con su costo por unidad y su parte de reinversión. */
function withCost(item: OrderItem, taken: TakenCost): OrderItem {
  const { reinvCost: _a, reinvQty: _b, ...rest } = item
  const line: OrderItem = { ...rest, cost: Math.round(taken.cost / Math.max(1, item.quantity)) }
  return taken.reinvQty > 0 ? { ...line, reinvCost: taken.reinv, reinvQty: taken.reinvQty } : line
}

async function loadProduct(productId: number) {
  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1)
  return product
}

/** El "costo actual" del producto es el del próximo lote que se va a
 * vender. Si ya no quedan lotes con unidades, se deja como está. */
async function syncCurrentCost(productId: number) {
  const [nextBatch] = await db.select({ unitCost: purchases.unitCost }).from(purchases)
    .where(and(eq(purchases.productId, productId), gt(purchases.remainingQuantity, 0)))
    .orderBy(purchases.createdAt, purchases.id).limit(1)
  if (nextBatch) await db.update(products).set({ cost: nextBatch.unitCost }).where(eq(products.id, productId))
}

// Consume del lote más viejo primero. Si no hay suficientes unidades en
// lotes (ej. existencias de antes de registrar compras), lo que falte usa
// el costo actual del producto, como dinero del negocio.
async function consumeFifoCost(product: typeof products.$inferSelect, quantity: number): Promise<TakenCost> {
  let remaining = quantity
  const taken: TakenCost = { cost: 0, reinv: 0, reinvQty: 0 }
  const batches = await db.select().from(purchases)
    .where(and(eq(purchases.productId, product.id), gt(purchases.remainingQuantity, 0)))
    .orderBy(purchases.createdAt, purchases.id)
  for (const batch of batches) {
    if (remaining <= 0) break
    const take = Math.min(remaining, batch.remainingQuantity)
    taken.cost += take * batch.unitCost
    if (batch.fund === 'reinversion') { taken.reinv += take * batch.unitCost; taken.reinvQty += take }
    remaining -= take
    await db.update(purchases).set({ remainingQuantity: batch.remainingQuantity - take }).where(eq(purchases.id, batch.id))
  }
  if (remaining > 0) taken.cost += remaining * product.cost
  await syncCurrentCost(product.id)
  return taken
}

/** Devuelve unidades a los lotes de los que salieron (el reverso de
 * consumeFifoCost): primero al lote más nuevo que ya se había empezado a
 * vender. Las `reinvQty` vuelven a lotes del dinero para reinvertir. */
async function returnToFifo(productId: number, quantity: number, reinvQty = 0) {
  const batches = await db.select().from(purchases)
    .where(and(eq(purchases.productId, productId), lt(purchases.remainingQuantity, purchases.quantity)))
    .orderBy(desc(purchases.createdAt), desc(purchases.id))
  const put = new Map<number, number>()
  const fill = (list: typeof batches, amount: number) => {
    let remaining = amount
    for (const batch of list) {
      if (remaining <= 0) break
      const room = batch.quantity - batch.remainingQuantity - (put.get(batch.id) ?? 0)
      if (room <= 0) continue
      const add = Math.min(room, remaining)
      put.set(batch.id, (put.get(batch.id) ?? 0) + add)
      remaining -= add
    }
    return remaining
  }
  const reinv = Math.min(quantity, Math.max(0, reinvQty))
  const left = fill(batches.filter((batch) => batch.fund === 'reinversion'), reinv) + fill(batches.filter((batch) => batch.fund !== 'reinversion'), quantity - reinv)
  fill(batches, left)
  for (const batch of batches) {
    const add = put.get(batch.id)
    if (add) await db.update(purchases).set({ remainingQuantity: batch.remainingQuantity + add }).where(eq(purchases.id, batch.id))
  }
}

/** Saca unidades del inventario (FIFO) y devuelve lo que costaron. */
async function takeStock(productId: number, quantity: number, label: string): Promise<TakenCost> {
  if (quantity <= 0) return { cost: 0, reinv: 0, reinvQty: 0 }
  const product = await loadProduct(productId)
  if (!product || product.kind !== 'producto') throw new Error(`El producto ${label} ya no existe.`)
  if (product.stock < quantity) throw new Error(`No hay suficientes unidades de ${product.name} (quedan ${product.stock}).`)
  const taken = await consumeFifoCost(product, quantity)
  await db.update(products).set({ stock: sql`greatest(0, ${products.stock} - ${quantity})` }).where(eq(products.id, productId))
  return taken
}

/** Devuelve unidades al inventario y a sus lotes. */
async function returnStock(productId: number, quantity: number, reinvQty = 0) {
  if (quantity <= 0) return
  const product = await loadProduct(productId)
  if (!product || product.kind !== 'producto') return // se borró definitivamente: no hay a dónde devolver
  await returnToFifo(productId, quantity, reinvQty)
  await db.update(products).set({ stock: sql`${products.stock} + ${quantity}` }).where(eq(products.id, productId))
  await syncCurrentCost(productId)
}

/** Saca del inventario todas las líneas; si una falla, devuelve las que ya
 * había sacado (el driver de Neon no tiene transacciones). */
async function takeLines(lines: OrderItem[]): Promise<OrderItem[]> {
  const done: OrderItem[] = []
  try {
    for (const line of lines) done.push(withCost(line, await takeStock(line.id, line.quantity, line.name)))
    return done
  } catch (error) {
    for (const line of done) await returnStock(line.id, line.quantity, line.reinvQty ?? 0)
    throw error
  }
}

async function returnLines(lines: OrderItem[]) {
  for (const line of lines) await returnStock(line.id, line.quantity, line.reinvQty ?? 0)
}

// Mantiene el "Pago" del pedido/cita igual que su factura: si la factura
// queda saldada, el pedido/cita pasa a "Pagado".
async function syncSourcePayment(sourceType: string, sourceId: number, status: string) {
  const paymentStatus = status === 'Pagada' ? 'Pagado' : 'Pendiente'
  if (sourceType === 'pedido') await db.update(orders).set({ paymentStatus }).where(and(eq(orders.id, sourceId), sql`${orders.paymentStatus} <> 'Reembolsado'`))
  else await db.update(appointments).set({ paymentStatus }).where(and(eq(appointments.id, sourceId), sql`${appointments.paymentStatus} <> 'Reembolsado'`))
}

// Al marcar un pedido/cita como "Pagado" desde su lista, se registra solo
// el abono por el saldo que faltaba, para que la factura también quede
// "Pagada" y los números de cobranza cuadren.
async function settleInvoiceFor(sourceType: 'pedido' | 'cita', sourceId: number) {
  const [invoice] = await db.select().from(invoices).where(and(eq(invoices.sourceType, sourceType), eq(invoices.sourceId, sourceId))).limit(1)
  if (!invoice || invoice.status === 'Cancelada' || invoice.deletedAt) return
  const due = invoice.total - invoice.paid
  if (due <= 0) return
  await db.insert(payments).values({ folio: makeFolio('REC'), invoiceId: invoice.id, amount: due, method: 'Efectivo', note: 'Marcado como pagado desde el panel' })
  await db.update(invoices).set({ paid: invoice.total, status: 'Pagada' }).where(eq(invoices.id, invoice.id))
}

// Si se reactiva un pedido/cita cancelado, su factura (anulada sin abonos
// al cancelarlo) vuelve a estar vigente.
async function reopenInvoiceFor(sourceType: 'pedido' | 'cita', sourceId: number) {
  await db.update(invoices).set({ status: 'Pendiente' }).where(and(eq(invoices.sourceType, sourceType), eq(invoices.sourceId, sourceId), eq(invoices.status, 'Cancelada'), eq(invoices.paid, 0)))
}

// Envía una imagen a la papelera de imágenes. Si la URL no es de una foto
// que subimos nosotros (a GitHub o a R2), ej. una imagen de Unsplash de la
// semilla inicial o una URL externa pegada a mano, no hace nada.
async function trashImage(url: string, reason: string) {
  if (!url) return
  const path = imagePathFromUrl(env, url)
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
      for (const url of [product.image, ...(product.images ?? [])]) if (url) await trashImage(url, 'Producto eliminado definitivamente tras 30 días en papelera')
    }
  } catch { /* se reintenta en el próximo acceso al panel */ }

  try { await db.delete(customers).where(and(isNotNull(customers.deletedAt), lt(customers.deletedAt, cutoff))) } catch { /* idem */ }
  try { await db.delete(orders).where(and(isNotNull(orders.deletedAt), lt(orders.deletedAt, cutoff))) } catch { /* idem */ }
  try { await db.delete(appointments).where(and(isNotNull(appointments.deletedAt), lt(appointments.deletedAt, cutoff))) } catch { /* idem */ }
  try {
    const expiredInvoices = await db.select({ id: invoices.id }).from(invoices).where(and(isNotNull(invoices.deletedAt), lt(invoices.deletedAt, cutoff)))
    if (expiredInvoices.length) {
      const ids = expiredInvoices.map((row) => row.id)
      await db.delete(payments).where(inArray(payments.invoiceId, ids))
      await db.delete(invoices).where(inArray(invoices.id, ids))
    }
  } catch { /* idem */ }

  try {
    const expiredImages = await db.select().from(imageTrash).where(lt(imageTrash.deletedAt, cutoff))
    for (const image of expiredImages) {
      try { await deleteImage(env, image.path) } catch { /* si GitHub o R2 fallan, se reintenta luego: la fila no se borra */ continue }
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
  if (!invoice) return null
  if (invoice.status === 'Cancelada') return invoice
  if (invoice.paid > 0) {
    if (!force) throw new Error(`Este registro tiene una factura relacionada (${invoice.folio}) con abonos ya registrados. Confirma de nuevo para continuar: el pedido/cita se cancelará pero la factura y su historial de pagos se conservarán intactos.`)
    return invoice
  }
  await db.update(invoices).set({ status: 'Cancelada' }).where(eq(invoices.id, invoice.id))
  return { ...invoice, status: 'Cancelada' }
}

// Al mandar un pedido/cita a la papelera, su factura (si no tiene abonos)
// se va con él; al restaurarlo vuelve, y al borrarlo definitivamente se
// borra también. Una factura con abonos se queda en Cobros.
async function trashInvoiceWith(invoice: { id: number; paid: number } | null) {
  if (invoice && invoice.paid === 0) await db.update(invoices).set({ deletedAt: new Date() }).where(eq(invoices.id, invoice.id))
}
async function restoreInvoiceOf(sourceType: 'pedido' | 'cita', sourceId: number) {
  await db.update(invoices).set({ deletedAt: null }).where(and(eq(invoices.sourceType, sourceType), eq(invoices.sourceId, sourceId)))
}
async function purgeInvoiceOf(sourceType: 'pedido' | 'cita', sourceId: number) {
  const rows = await db.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.sourceType, sourceType), eq(invoices.sourceId, sourceId), isNotNull(invoices.deletedAt)))
  if (!rows.length) return
  const ids = rows.map((row) => row.id)
  await db.delete(payments).where(inArray(payments.invoiceId, ids))
  await db.delete(invoices).where(inArray(invoices.id, ids))
}

async function findOrCreateCustomer(data: { name: string; email?: string; phone: string; address?: string }) {
  if (data.email) {
    const [existing] = await db.select().from(customers).where(and(sql`lower(${customers.email}) = ${data.email.toLowerCase()}`, isNull(customers.deletedAt))).limit(1)
    if (existing) return existing
  }
  const [existingByPhone] = data.phone ? await db.select().from(customers).where(and(eq(customers.phone, data.phone), isNull(customers.deletedAt))).limit(1) : []
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
    const ok = await verifyPassword(String(data.password ?? ''))
    if (!ok) {
      // Una pequeña pausa hace muy lento probar contraseñas al azar.
      await new Promise((resolve) => setTimeout(resolve, 900))
      throw new Error('Contraseña incorrecta.')
    }
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
  await ensureSchema() // las columnas nuevas de products tienen que existir antes de leerlas
  await ensureSeeded()
  const [productRows, contentRows] = await Promise.all([
    db.select().from(products).where(and(eq(products.active, true), isNull(products.deletedAt))).orderBy(desc(products.featured), products.id),
    db.select().from(content),
  ])
  const publicContent = contentRows.filter((item) => !PRIVATE_CONTENT_KEYS.includes(item.key))
  // La tienda pública nunca recibe el costo (lo que pagó la dueña).
  const publicProducts = productRows.map(({ cost: _cost, ...product }) => product)
  return { products: publicProducts, content: Object.fromEntries(publicContent.map((item) => [item.key, item.value])) }
})

export const createOrder = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string; phone: string; email: string; address: string; items: CartLine[] }) => data)
  .handler(async ({ data }) => {
    await ensureSchema()
    data = { ...data, name: clean(data.name, 120), phone: clean(data.phone, 40), email: clean(data.email, 160), address: clean(data.address, 400) }
    if (!data.name || !data.phone || !Array.isArray(data.items) || !data.items.length) throw new Error('Completa todos los datos del pedido.')
    // Junta líneas repetidas y rechaza cantidades raras (0, negativas o
    // con decimales), que antes podían dar un total negativo.
    const wanted = new Map<number, number>()
    for (const item of data.items) {
      const quantity = Number(item.quantity)
      const productId = Number(item.productId)
      if (!Number.isInteger(productId) || productId < 1) throw new Error('Uno de los productos de tu bolsa ya no está disponible. Revisa tu bolsa.')
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error(`Revisa la cantidad de ${clean(item.name, 80)}.`)
      wanted.set(productId, (wanted.get(productId) ?? 0) + quantity)
    }
    const productRows = await db.select().from(products).where(and(inArray(products.id, [...wanted.keys()]), isNull(products.deletedAt), eq(products.active, true)))
    const calculated = [...wanted.entries()].map(([productId, quantity]) => {
      const product = productRows.find((row) => row.id === productId)
      if (!product || product.kind !== 'producto') throw new Error('Uno de los productos de tu bolsa ya no está disponible. Revisa tu bolsa.')
      if (product.stock < quantity) throw new Error(product.stock > 0 ? `Solo quedan ${product.stock} de ${product.name}.` : `${product.name} se agotó.`)
      return { id: product.id, name: product.name, price: product.price, quantity }
    })
    const total = calculated.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const customer = await findOrCreateCustomer(data)
    const orderNumber = makeFolio('PED')
    const createdAt = new Date()

    // El driver HTTP de Neon no soporta transacciones interactivas, así que
    // estas operaciones se hacen en secuencia en vez de dentro de una tx.
    // Sale del inventario por lotes (FIFO) y cada línea guarda lo que costó.
    const items = await takeLines(calculated)
    let order: typeof orders.$inferSelect
    try {
      [order] = await db.insert(orders).values({ orderNumber, customerId: customer.id, customerName: data.name, email: data.email, phone: data.phone, address: data.address, items, total, createdAt }).returning()
    } catch (error) {
      await returnLines(items)
      throw error
    }
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

    // Correo y aviso al teléfono AL MISMO TIEMPO (la clienta espera menos).
    // Si alguno falla, el pedido ya quedó guardado igual: nunca se le
    // muestra error a la clienta.
    const units = calculated.reduce((sum, item) => sum + item.quantity, 0)
    const names = calculated.map((item) => `${item.quantity}× ${item.name}`).join(', ')
    await Promise.allSettled([
      (async () => {
        const [notificationRow] = await db.select().from(content).where(eq(content.key, 'notificationEmail')).limit(1)
        if (notificationRow?.value) await sendOrderNotificationEmail(env, notificationRow.value, { orderNumber, createdAt, customerName: data.name, email: data.email, phone: data.phone, address: data.address, total, items: calculated })
      })(),
      notifyAdmins({
        title: `🛍️ Nuevo pedido · ${formatMoney(total)}`,
        body: `${data.name} pidió ${units} ${units === 1 ? 'artículo' : 'artículos'}: ${names}`.slice(0, 220),
        url: '/admin?tab=pedidos',
        tag: orderNumber,
      }),
    ])

    return { orderNumber, total, orderId: order.id }
  })

export const createAppointment = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string; phone: string; email: string; serviceId: number; date: string; time: string; notes: string }) => data)
  .handler(async ({ data }) => {
    await ensureSchema()
    data = { ...data, name: clean(data.name, 120), phone: clean(data.phone, 40), email: clean(data.email, 160), notes: clean(data.notes, 600), date: clean(data.date, 10), time: clean(data.time, 5) }
    data.serviceId = Number(data.serviceId)
    if (!data.name || !data.phone || !Number.isInteger(data.serviceId) || data.serviceId < 1 || !data.date || !data.time) throw new Error('Completa todos los datos de la cita.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !/^\d{2}:\d{2}$/.test(data.time)) throw new Error('Revisa la fecha y la hora de la cita.')
    if (data.date < todayInDR()) throw new Error('Elige una fecha de hoy en adelante.')
    const [service] = await db.select().from(products).where(and(eq(products.id, data.serviceId), isNull(products.deletedAt), eq(products.active, true))).limit(1)
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

    await Promise.allSettled([
      (async () => {
        const [notificationRow] = await db.select().from(content).where(eq(content.key, 'notificationEmail')).limit(1)
        if (notificationRow?.value) await sendAppointmentNotificationEmail(env, notificationRow.value, { appointmentNumber, createdAt, customerName: data.name, phone: data.phone, email: data.email, serviceName: service.name, price: service.price, date: data.date, time: data.time, notes: data.notes })
      })(),
      notifyAdmins({
        title: `📅 Nueva cita · ${service.name}`,
        body: `${data.name} agendó para el ${prettyDateEs(data.date)} a las ${prettyTimeEs(data.time)}.`.slice(0, 220),
        url: '/admin?tab=citas',
        tag: appointmentNumber,
      }),
    ])

    return { appointmentNumber, appointmentId: appointment.id }
  })

// ───────────────────────────────────────────────────────────────────────
// ADMIN — lectura
// ───────────────────────────────────────────────────────────────────────
export const getAdminData = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAdmin()
  await ensureSchema()
  await ensureSeeded()
  await cleanupExpired()
  const [productRows, orderRows, appointmentRows, customerRows, invoiceRows, paymentRows, contentRows, trashedProducts, trashedOrders, trashedAppointments, trashedCustomers, trashedImages, trashedInvoices, purchaseRows, expenseRows] = await Promise.all([
    db.select().from(products).where(isNull(products.deletedAt)).orderBy(desc(products.createdAt)),
    db.select().from(orders).where(isNull(orders.deletedAt)).orderBy(desc(orders.createdAt)),
    db.select().from(appointments).where(isNull(appointments.deletedAt)).orderBy(desc(appointments.date), desc(appointments.time)),
    db.select().from(customers).where(isNull(customers.deletedAt)).orderBy(desc(customers.createdAt)),
    db.select().from(invoices).where(isNull(invoices.deletedAt)).orderBy(desc(invoices.createdAt)),
    db.select().from(payments).orderBy(desc(payments.createdAt)),
    db.select().from(content),
    db.select().from(products).where(isNotNull(products.deletedAt)).orderBy(desc(products.deletedAt)),
    db.select().from(orders).where(isNotNull(orders.deletedAt)).orderBy(desc(orders.deletedAt)),
    db.select().from(appointments).where(isNotNull(appointments.deletedAt)).orderBy(desc(appointments.deletedAt)),
    db.select().from(customers).where(isNotNull(customers.deletedAt)).orderBy(desc(customers.deletedAt)),
    db.select().from(imageTrash).orderBy(desc(imageTrash.deletedAt)),
    db.select().from(invoices).where(isNotNull(invoices.deletedAt)).orderBy(desc(invoices.deletedAt)),
    db.select().from(purchases).orderBy(desc(purchases.createdAt), desc(purchases.id)),
    db.select().from(expenses).orderBy(desc(expenses.createdAt), desc(expenses.id)),
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
    purchases: purchaseRows,
    expenses: expenseRows,
    content: Object.fromEntries(contentRows.filter((item) => item.key !== 'vapidKeys' && item.key !== 'productsSeeded').map((item) => [item.key, item.value])),
    trash: {
      products: withDaysLeft(trashedProducts),
      orders: withDaysLeft(trashedOrders),
      appointments: withDaysLeft(trashedAppointments),
      customers: withDaysLeft(trashedCustomers),
      images: withDaysLeft(trashedImages),
      invoices: withDaysLeft(trashedInvoices),
    },
  }
})

// ───────────────────────────────────────────────────────────────────────
// ADMIN — productos y servicios
// ───────────────────────────────────────────────────────────────────────
export const saveProduct = createServerFn({ method: 'POST' })
  .inputValidator((data: { id?: number; kind: string; name: string; category: string; description: string; price: number; originalPrice?: number; stock: number; durationMinutes: number; image: string; images?: string[]; featured: boolean; active: boolean }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    if (!clean(data.name)) throw new Error('Escribe el nombre del artículo.')
    if (!['producto', 'servicio'].includes(data.kind)) throw new Error('Tipo de artículo inválido.')
    if (!(Number(data.price) >= 0) || !(Number(data.stock) >= 0)) throw new Error('El precio y las existencias no pueden ser negativos.')
    // Un producto nuevo empieza en 0: las unidades se suman con «Reponer»,
    // así queda registrado lo que costaron (igual que en JB Tech Store).
    // Fotos extra: hasta 10, sin repetir la principal ni entre ellas.
    const mainImage = clean(data.image, 1000)
    const images = [...new Set((Array.isArray(data.images) ? data.images : []).map((url) => clean(url, 1000)).filter((url) => url && url !== mainImage))].slice(0, 10)
    const values = { images, kind: data.kind, name: clean(data.name, 160), category: clean(data.category, 80) || 'General', description: clean(data.description, 2000), price: Math.round(Number(data.price)), originalPrice: Math.max(0, Math.round(Number(data.originalPrice) || 0)), stock: data.id ? Math.floor(Number(data.stock)) : 0, durationMinutes: Math.max(0, Math.floor(Number(data.durationMinutes) || 0)), image: clean(data.image, 1000), featured: data.featured, active: data.active }
    if (data.id) {
      const [current] = await db.select().from(products).where(eq(products.id, data.id)).limit(1)
      // Las fotos que ya no se usan (ni como principal ni en la galería) van
      // a la papelera de imágenes.
      const kept = new Set([mainImage, ...images])
      for (const url of [current?.image, ...(current?.images ?? [])]) {
        if (url && !kept.has(url)) await trashImage(url, 'Imagen reemplazada desde el panel de administración')
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
  for (const url of [product?.image, ...(product?.images ?? [])]) if (url) await trashImage(url, 'Producto eliminado definitivamente desde la papelera')
  return true
})

// ───────────────────────────────────────────────────────────────────────
// ADMIN — pedidos y citas
// ───────────────────────────────────────────────────────────────────────
export const updateOrderStatus = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; status: string; paymentStatus: string; force?: boolean }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    checkStatus(data.status, data.paymentStatus, ORDER_STATUSES)
    const [current] = await db.select().from(orders).where(eq(orders.id, data.id)).limit(1)
    if (!current) throw new Error('Pedido no encontrado.')
    const cancelling = data.status === 'Cancelado' && current.status !== 'Cancelado'
    const reopening = data.status !== 'Cancelado' && current.status === 'Cancelado'
    if (cancelling) await checkInvoiceForCancel('pedido', data.id, Boolean(data.force))
    let items = current.items as OrderItem[]
    // Cancelar devuelve las unidades a sus lotes. Reactivar las vuelve a
    // sacar (si todavía hay), y el costo se recalcula: pueden salir ahora
    // de otros lotes que cuando se hizo el pedido.
    if (cancelling) await returnLines(items)
    if (reopening) {
      try { items = await takeLines(items) }
      catch (caught) { throw new Error(`${caught instanceof Error ? caught.message : 'No hay suficientes unidades.'} No se puede reactivar este pedido; si tienes más, regístralas con «Reponer».`) }
    }
    await db.update(orders).set({ status: data.status, paymentStatus: data.paymentStatus, items }).where(eq(orders.id, data.id))
    if (reopening) await reopenInvoiceFor('pedido', data.id)
    if (data.paymentStatus === 'Pagado' && current.paymentStatus !== 'Pagado') await settleInvoiceFor('pedido', data.id)
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
    const [current] = await db.select().from(orders).where(eq(orders.id, data.id)).limit(1)
    if (!current) throw new Error('Pedido no encontrado.')
    const invoice = await checkInvoiceForCancel('pedido', data.id, Boolean(data.force))
    await trashInvoiceWith(invoice)
    // Al mandarlo a la papelera, sus unidades vuelven al inventario
    // (si ya estaba cancelado, ya habían vuelto).
    await db.update(orders).set({ deletedAt: new Date() }).where(eq(orders.id, data.id))
    if (current.status !== 'Cancelado') await returnLines(current.items as OrderItem[])
    return true
  })

// Restaurar un pedido de la papelera: vuelve como "Cancelado" (sus
// unidades ya habían vuelto al inventario). Si se quiere retomar, se
// cambia el estado y ahí se vuelven a sacar las unidades.
export const restoreOrder = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.update(orders).set({ deletedAt: null, status: 'Cancelado' }).where(eq(orders.id, data))
  await restoreInvoiceOf('pedido', data)
  return true
})

export const purgeOrder = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await purgeInvoiceOf('pedido', data)
  await db.delete(orders).where(eq(orders.id, data))
  return true
})

export const updateAppointmentStatus = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; status: string; paymentStatus: string; force?: boolean }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    checkStatus(data.status, data.paymentStatus, APPOINTMENT_STATUSES)
    const [current] = await db.select().from(appointments).where(eq(appointments.id, data.id)).limit(1)
    if (!current) throw new Error('Cita no encontrada.')
    if (data.status === 'Cancelada' && current.status !== 'Cancelada') await checkInvoiceForCancel('cita', data.id, Boolean(data.force))
    await db.update(appointments).set({ status: data.status, paymentStatus: data.paymentStatus }).where(eq(appointments.id, data.id))
    if (data.status !== 'Cancelada' && current.status === 'Cancelada') await reopenInvoiceFor('cita', data.id)
    if (data.paymentStatus === 'Pagado' && current.paymentStatus !== 'Pagado') await settleInvoiceFor('cita', data.id)
    return true
  })

export const deleteAppointment = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; force?: boolean }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const invoice = await checkInvoiceForCancel('cita', data.id, Boolean(data.force))
    await trashInvoiceWith(invoice)
    await db.update(appointments).set({ deletedAt: new Date() }).where(eq(appointments.id, data.id))
    return true
  })

// Igual que los pedidos: vuelve como "Cancelada" (su factura se anuló al
// borrarla). Para retomarla se cambia el estado y la factura se reactiva.
export const restoreAppointment = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.update(appointments).set({ deletedAt: null, status: 'Cancelada' }).where(eq(appointments.id, data))
  await restoreInvoiceOf('cita', data)
  return true
})

export const purgeAppointment = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await purgeInvoiceOf('cita', data)
  await db.delete(appointments).where(eq(appointments.id, data))
  return true
})

export const saveAppointmentAdmin = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string; phone: string; email: string; serviceId: number; date: string; time: string; notes: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    data = { ...data, name: clean(data.name, 120), phone: clean(data.phone, 40), email: clean(data.email, 160), notes: clean(data.notes, 600) }
    if (!data.name || !data.date || !data.time) throw new Error('Completa el nombre, la fecha y la hora.')
    const [service] = await db.select().from(products).where(and(eq(products.id, data.serviceId), isNull(products.deletedAt))).limit(1)
    if (!service || service.kind !== 'servicio') throw new Error('Selecciona un servicio válido.')
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
    if (invoice.status === 'Cancelada') throw new Error('Esta factura está anulada: no se le pueden registrar abonos.')
    if (invoice.deletedAt) throw new Error('Esta factura está en la papelera. Restáurala primero.')
    const amount = Math.round(Number(data.amount))
    const due = invoice.total - invoice.paid
    if (amount > due) throw new Error(`El abono no puede ser mayor que el saldo pendiente (${formatMoney(due)}).`)
    const folio = makeFolio('REC')
    const newPaid = invoice.paid + amount
    const status = newPaid >= invoice.total ? 'Pagada' : newPaid > 0 ? 'Abonado' : 'Pendiente'
    await db.insert(payments).values({ folio, invoiceId: invoice.id, amount, method: clean(data.method, 30) || 'Efectivo', note: clean(data.note, 200) })
    await db.update(invoices).set({ paid: newPaid, status }).where(eq(invoices.id, invoice.id))
    if (status === 'Pagada') await syncSourcePayment(invoice.sourceType, invoice.sourceId, status)
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

// Enviar una factura a la papelera: deja de verse en Cobros y no cuenta en
// los saldos. Si todavía está vigente, se anula al mismo tiempo. Con
// abonos exige confirmación (`force`). 30 días para restaurarla.
export const deleteInvoice = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; force?: boolean }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, data.id)).limit(1)
    if (!invoice) throw new Error('Factura no encontrada.')
    if (invoice.paid > 0 && !data.force) throw new Error('Esta factura tiene abonos registrados. Confirma de nuevo para enviarla a la papelera.')
    await db.update(invoices).set({ deletedAt: new Date(), status: 'Cancelada' }).where(eq(invoices.id, data.id))
    return true
  })

export const restoreInvoice = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.update(invoices).set({ deletedAt: null }).where(eq(invoices.id, data))
  return true
})

// Borra definitivamente la factura y todos sus abonos/recibos.
export const purgeInvoice = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.delete(payments).where(eq(payments.invoiceId, data))
  await db.delete(invoices).where(eq(invoices.id, data))
  return true
})

// ───────────────────────────────────────────────────────────────────────
// ADMIN — contenido del sitio
// ───────────────────────────────────────────────────────────────────────
export const saveContent = createServerFn({ method: 'POST' }).inputValidator((data: Record<string, string>) => data).handler(async ({ data }) => {
  await requireAdmin()
  for (const [key, raw] of Object.entries(data)) {
    if (key === 'vapidKeys' || key === 'productsSeeded') continue
    // Los correos de avisos se guardan limpios: "a@x.com, b@y.com".
    const value = key === 'notificationEmail' ? parseEmailList(String(raw ?? '')).join(', ') : String(raw ?? '')
    await db.insert(content).values({ key, value }).onConflictDoUpdate({ target: content.key, set: { value } })
  }
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

// ───────────────────────────────────────────────────────────────────────
// NOTIFICACIONES AL TELÉFONO (app "ELA Admin") — ver src/lib/push.ts.
// Igual que en JB Tech Store: Web Push hecho a mano con WebCrypto.
// ───────────────────────────────────────────────────────────────────────
const PUSH_SUBJECT = 'https://elaesencia.gadrnet.workers.dev'


function prettyDateEs(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Intl.DateTimeFormat('es-DO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}

function prettyTimeEs(time: string) {
  const [h, min] = time.split(':').map(Number)
  if (Number.isNaN(h)) return time
  return `${((h + 11) % 12) + 1}:${String(min || 0).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`
}

/** Claves VAPID: se crean solas la primera vez y se guardan en la tabla de
 * contenido (key `vapidKeys`). Nunca se mandan al navegador. */
async function getVapidKeys(): Promise<VapidKeys> {
  const read = async () => {
    const [row] = await db.select().from(content).where(eq(content.key, 'vapidKeys')).limit(1)
    if (!row?.value) return null
    try { return JSON.parse(row.value) as VapidKeys } catch { return null }
  }
  const existing = await read()
  if (existing?.publicKey && existing.privateJwk) return existing
  const fresh = await generateVapidKeys()
  await db.insert(content).values({ key: 'vapidKeys', value: JSON.stringify(fresh) }).onConflictDoNothing()
  return (await read()) ?? fresh
}

async function sendToSubscriptions(rows: Array<{ id: number; endpoint: string; p256dh: string; auth: string }>, message: PushMessage) {
  if (!rows.length) return { sent: 0, failed: 0, problem: '' }
  const keys = await getVapidKeys()
  const results = await Promise.all(rows.map((row) => sendPush(row, message, keys, PUSH_SUBJECT)))
  // Si el servicio de avisos falló un momento (sin conexión, "muy ocupado"
  // o error de su lado), se intenta una vez más antes de rendirse.
  const retry = rows.map((_, index) => index).filter((index) => results[index].result === 'error' && (results[index].status === 0 || results[index].status === 429 || results[index].status >= 500))
  if (retry.length) {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await Promise.all(retry.map(async (index) => { results[index] = await sendPush(rows[index], message, keys, PUSH_SUBJECT) }))
  }
  // Aparatos que ya no existen (app desinstalada o permiso quitado): fuera.
  const gone = rows.filter((_, index) => results[index].result === 'gone').map((row) => row.id)
  if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone))
  const firstProblem = results.find((item) => item.result !== 'ok')
  return {
    sent: results.filter((item) => item.result === 'ok').length,
    failed: results.filter((item) => item.result !== 'ok').length,
    problem: firstProblem ? `${firstProblem.result === 'gone' ? 'el aparato ya no acepta avisos' : 'error'} (código ${firstProblem.status || 'sin respuesta'}${firstProblem.detail ? `: ${firstProblem.detail}` : ''})` : '',
  }
}

async function notifyAdmins(message: PushMessage) {
  await ensureSchema()
  const rows = await db.select().from(pushSubscriptions)
  return sendToSubscriptions(rows, message)
}

/** Lo que la app necesita para activar las notificaciones en un aparato. */
export const getPushSetup = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAdmin()
  await ensureSchema()
  const keys = await getVapidKeys()
  const rows = await db.select({ id: pushSubscriptions.id, endpoint: pushSubscriptions.endpoint, label: pushSubscriptions.label, createdAt: pushSubscriptions.createdAt }).from(pushSubscriptions).orderBy(desc(pushSubscriptions.createdAt))
  return { publicKey: keys.publicKey, devices: rows.map((row) => ({ id: row.id, endpoint: row.endpoint, label: row.label, createdAt: row.createdAt })) }
})

export const savePushSubscription = createServerFn({ method: 'POST' })
  .inputValidator((data: { endpoint: string; p256dh: string; auth: string; label: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    await ensureSchema()
    const endpoint = String(data.endpoint || '')
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000) throw new Error('La suscripción del navegador no es válida.')
    if (!data.p256dh || !data.auth) throw new Error('Faltan las claves de la suscripción.')
    const values = { endpoint, p256dh: String(data.p256dh).slice(0, 200), auth: String(data.auth).slice(0, 100), label: String(data.label || '').slice(0, 80) }
    await db.insert(pushSubscriptions).values(values).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { p256dh: values.p256dh, auth: values.auth, label: values.label } })
    return true
  })

export const removePushSubscription = createServerFn({ method: 'POST' }).inputValidator((endpoint: string) => endpoint).handler(async ({ data }) => {
  await requireAdmin()
  await ensureSchema()
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, String(data || '')))
  return true
})

/** Manda un aviso de prueba (a este aparato o, sin endpoint, a todos). */
export const sendTestPush = createServerFn({ method: 'POST' }).inputValidator((endpoint: string) => endpoint).handler(async ({ data }) => {
  await requireAdmin()
  await ensureSchema()
  const rows = data
    ? await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, String(data)))
    : await db.select().from(pushSubscriptions)
  if (!rows.length) throw new Error('Este aparato todavía no tiene las notificaciones activadas.')
  const result = await sendToSubscriptions(rows, { title: '🔔 Notificaciones activadas', body: 'Así te va a llegar cada cita y cada pedido nuevo de la tienda.', url: '/admin', tag: 'prueba' })
  if (!result.sent) throw new Error(`No se pudo entregar la prueba: ${result.problem}. Toca «Activar notificaciones» otra vez.`)
  return result
})

// ───────────────────────────────────────────────────────────────────────
// ADMIN — compras (Reponer), ventas por fuera y gastos (igual que en JB)
// ───────────────────────────────────────────────────────────────────────

// Registra una compra: suma las unidades y crea un lote con su costo. Las
// ventas sacan primero del lote más viejo. `fund` = con qué dinero se pagó.
export const recordPurchase = createServerFn({ method: 'POST' })
  .inputValidator((data: { productId: number; quantity: number; unitCost: number; fund?: string; notes?: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const fund: Fund = FUNDS.includes(data.fund as Fund) ? (data.fund as Fund) : 'capital'
    const product = await loadProduct(Number(data.productId))
    if (!product || product.kind !== 'producto') throw new Error('Elige un producto (los servicios no llevan existencias).')
    const quantity = Math.round(Number(data.quantity))
    const unitCost = Math.round(Number(data.unitCost))
    if (!Number.isFinite(quantity) || quantity < 1) throw new Error('Pon cuántas unidades compraste (al menos 1).')
    if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error('El costo no es válido.')
    // El lote nuevo solo pasa a ser "el costo actual" si ya no quedaba
    // existencia vieja (es el próximo que se va a vender).
    await db.update(products).set({ stock: product.stock + quantity, cost: product.stock <= 0 ? unitCost : product.cost }).where(eq(products.id, product.id))
    await db.insert(purchases).values({ productId: product.id, productName: product.name, fund, quantity, unitCost, totalCost: quantity * unitCost, remainingQuantity: quantity, notes: clean(data.notes, 300) })
    return { total: quantity * unitCost, fund }
  })

// Borra una compra registrada por error. Solo quita lo que TODAVÍA no se ha
// vendido de ese lote; lo vendido se queda (esas ventas guardaron su costo).
export const deletePurchase = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  const [purchase] = await db.select().from(purchases).where(eq(purchases.id, data)).limit(1)
  if (!purchase) throw new Error('Esa compra ya no existe.')
  if (purchase.remainingQuantity <= 0) throw new Error('Ese lote ya se vendió completo: no queda nada que quitar.')
  const sold = purchase.quantity - purchase.remainingQuantity
  if (sold > 0) {
    await db.update(purchases).set({ quantity: sold, remainingQuantity: 0, totalCost: sold * purchase.unitCost, notes: `${purchase.notes ? `${purchase.notes} · ` : ''}ajustada: se quitaron ${purchase.remainingQuantity} sin vender` }).where(eq(purchases.id, data))
  } else {
    await db.delete(purchases).where(eq(purchases.id, data))
  }
  await db.update(products).set({ stock: sql`greatest(0, ${products.stock} - ${purchase.remainingQuantity})` }).where(eq(products.id, purchase.productId))
  await syncCurrentCost(purchase.productId)
  return true
})

// Venta hecha por fuera de la web (en persona o por WhatsApp): sale del
// inventario por lotes, crea el pedido (ya entregado) con su factura y, si
// ya pagaron, el abono. Cuenta en Finanzas igual que un pedido de la tienda.
export const recordManualSale = createServerFn({ method: 'POST' })
  .inputValidator((data: { customerName?: string; phone?: string; notes?: string; paid: boolean; items: Array<{ productId: number; quantity: number; price: number }> }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    if (!Array.isArray(data.items) || !data.items.length) throw new Error('Agrega al menos un producto.')
    const lines: OrderItem[] = []
    for (const raw of data.items) {
      const productId = Number(raw.productId)
      const quantity = Math.round(Number(raw.quantity))
      const price = Math.round(Number(raw.price))
      if (!Number.isInteger(productId) || productId < 1) throw new Error('Elige el producto de cada línea.')
      if (!Number.isFinite(quantity) || quantity < 1) throw new Error('La cantidad debe ser 1 o más.')
      if (!Number.isFinite(price) || price < 0) throw new Error('El precio no es válido.')
      const product = await loadProduct(productId)
      if (!product || product.kind !== 'producto') throw new Error('Uno de los productos ya no existe.')
      const already = lines.filter((line) => line.id === productId).reduce((sum, line) => sum + line.quantity, 0)
      if (product.stock < already + quantity) throw new Error(`No hay suficientes unidades de ${product.name} (quedan ${product.stock}). Si tienes más, regístralas primero con «Reponer».`)
      lines.push({ id: product.id, name: product.name, price, quantity })
    }
    const items = await takeLines(lines)
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const customerName = clean(data.customerName, 120) || 'Venta en persona'
    const phone = clean(data.phone, 40)
    const customer = phone ? await findOrCreateCustomer({ name: customerName, phone }) : null
    const orderNumber = makeFolio('VTA')
    const paid = Boolean(data.paid)
    const [order] = await db.insert(orders).values({ orderNumber, customerId: customer?.id ?? null, customerName, email: '', phone, address: '', items, total, status: 'Entregado', paymentStatus: paid ? 'Pagado' : 'Pendiente' }).returning()
    const units = items.reduce((sum, item) => sum + item.quantity, 0)
    const [invoice] = await db.insert(invoices).values({ folio: makeFolio('FAC'), sourceType: 'pedido', sourceId: order.id, customerId: customer?.id ?? null, customerName, phone, concept: `Venta por fuera ${orderNumber} — ${units} artículo(s)${clean(data.notes, 120) ? ` · ${clean(data.notes, 120)}` : ''}`, total, paid: paid ? total : 0, status: paid ? 'Pagada' : 'Pendiente' }).returning()
    if (paid && total > 0) await db.insert(payments).values({ folio: makeFolio('REC'), invoiceId: invoice.id, amount: total, method: 'Efectivo', note: 'Venta por fuera' })
    return { orderNumber, total }
  })

// Gasto del negocio (sale del dinero del negocio) o personal (de lo tuyo).
export const recordExpense = createServerFn({ method: 'POST' })
  .inputValidator((data: { type: string; description: string; amount: number }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const description = clean(data.description, 200)
    const amount = Math.round(Number(data.amount))
    if (!description) throw new Error('Escribe qué fue el gasto.')
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('El monto debe ser mayor a 0.')
    await db.insert(expenses).values({ type: data.type === 'personal' ? 'personal' : 'negocio', description, amount })
    return true
  })

export const deleteExpense = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.delete(expenses).where(eq(expenses.id, data))
  return true
})
