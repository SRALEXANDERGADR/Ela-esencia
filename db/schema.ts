import { pgTable, serial, text, integer, boolean, timestamp, jsonb, varchar } from 'drizzle-orm/pg-core'

// ───────────────────────────────────────────────────────────────────────
// PRODUCTOS Y SERVICIOS
// ELA vende dos cosas distintas bajo un mismo catálogo:
//   - "servicio": diseño de cejas, pestañas por grupito... se agenda (cita)
//   - "producto": jabones, mantequillas artesanales... se compra (pedido)
// El campo `kind` distingue cuál flujo aplica (citas vs carrito).
// ───────────────────────────────────────────────────────────────────────
export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  kind: varchar('kind', { length: 20 }).notNull().default('producto'), // 'producto' | 'servicio'
  name: text('name').notNull(),
  category: text('category').notNull().default('General'),
  description: text('description').notNull().default(''),
  price: integer('price').notNull().default(0), // centavos
  stock: integer('stock').notNull().default(0), // solo aplica a productos
  durationMinutes: integer('duration_minutes').notNull().default(30), // solo aplica a servicios
  image: text('image').notNull().default(''),
  featured: boolean('featured').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// ───────────────────────────────────────────────────────────────────────
// CLIENTES
// ───────────────────────────────────────────────────────────────────────
export const customers = pgTable('customers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().default(''),
  phone: text('phone').notNull().default(''),
  address: text('address').notNull().default(''),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// ───────────────────────────────────────────────────────────────────────
// PEDIDOS (compra de productos artesanales vía carrito/checkout)
// ───────────────────────────────────────────────────────────────────────
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  orderNumber: text('order_number').notNull().unique(),
  customerId: integer('customer_id'),
  customerName: text('customer_name').notNull(),
  email: text('email').notNull().default(''),
  phone: text('phone').notNull().default(''),
  address: text('address').notNull().default(''),
  items: jsonb('items').notNull().$type<Array<{ id: number; name: string; price: number; quantity: number }>>(),
  total: integer('total').notNull(),
  status: text('status').notNull().default('Pendiente'), // Pendiente, Preparando, Enviado, Entregado, Cancelado
  paymentStatus: text('payment_status').notNull().default('Pendiente'), // Pendiente, Pagado, Reembolsado
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// ───────────────────────────────────────────────────────────────────────
// CITAS (agenda de servicios: cejas, pestañas...)
// ───────────────────────────────────────────────────────────────────────
export const appointments = pgTable('appointments', {
  id: serial('id').primaryKey(),
  appointmentNumber: text('appointment_number').notNull().unique(),
  customerId: integer('customer_id'),
  customerName: text('customer_name').notNull(),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  serviceId: integer('service_id'),
  serviceName: text('service_name').notNull(),
  price: integer('price').notNull().default(0),
  date: text('date').notNull(), // YYYY-MM-DD
  time: text('time').notNull(), // HH:MM
  notes: text('notes').notNull().default(''),
  status: text('status').notNull().default('Pendiente'), // Pendiente, Confirmada, Completada, Cancelada
  paymentStatus: text('payment_status').notNull().default('Pendiente'), // Pendiente, Pagado, Reembolsado
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// ───────────────────────────────────────────────────────────────────────
// FACTURAS — un documento formal ligado a un pedido o una cita, que
// permite registrar abonos parciales (saldo pendiente) igual que en
// Alexander Perfiles/Ventas. El folio se genera al crearla.
// ───────────────────────────────────────────────────────────────────────
export const invoices = pgTable('invoices', {
  id: serial('id').primaryKey(),
  folio: text('folio').notNull().unique(),
  sourceType: text('source_type').notNull(), // 'pedido' | 'cita'
  sourceId: integer('source_id').notNull(),
  customerId: integer('customer_id'),
  customerName: text('customer_name').notNull(),
  phone: text('phone').notNull().default(''),
  concept: text('concept').notNull(), // texto descriptivo del renglón principal
  total: integer('total').notNull(), // centavos
  paid: integer('paid').notNull().default(0), // centavos abonados hasta ahora
  status: text('status').notNull().default('Pendiente'), // Pendiente, Abonado, Pagada, Cancelada
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// ───────────────────────────────────────────────────────────────────────
// PAGOS / ABONOS — historial de cada abono hecho a una factura. Cada uno
// genera su propio recibo con folio propio (como en Alexander Perfiles).
// ───────────────────────────────────────────────────────────────────────
export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  folio: text('folio').notNull().unique(),
  invoiceId: integer('invoice_id').notNull(),
  amount: integer('amount').notNull(), // centavos
  method: text('method').notNull().default('Efectivo'), // Efectivo, Transferencia, Tarjeta
  note: text('note').notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// ───────────────────────────────────────────────────────────────────────
// CONTENIDO DEL SITIO (editor de textos e imágenes desde el admin)
// ───────────────────────────────────────────────────────────────────────
export const content = pgTable('content', {
  key: text('key').primaryKey(),
  value: text('value').notNull().default(''),
})
