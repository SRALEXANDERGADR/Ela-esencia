// ───────────────────────────────────────────────────────────────────────
// PLANES de ELA Esencia — el ÚNICO lugar donde se decide qué lleva cada plan.
// Todo el código pregunta aquí con puede(plan, 'funcion'); no hay "if plan ===".
// Es el mismo código para los 3 planes: solo cambia la variable PLAN.
// (Este archivo no usa nada del servidor: lo pueden importar la tienda y el panel.)
// ───────────────────────────────────────────────────────────────────────

export const PLANES = ['basico', 'profesional', 'completo'] as const
export type Plan = (typeof PLANES)[number]

export const NOMBRE_PLAN: Record<Plan, string> = { basico: 'Básico', profesional: 'Profesional', completo: 'Completo' }

/** Nombre de la cookie donde la demo recuerda el plan escogido (30 días). */
export const COOKIE_PLAN = 'gadr_plan'

/** Cada función y el plan MÍNIMO que la trae (los planes de arriba traen todo lo de abajo). */
export const FUNCIONES = {
  // Profesional: el negocio funciona solo en línea
  carrito: 'profesional', //     Bolsa y pedidos en la web
  citas: 'profesional', //       Agendar citas en la web + citas en el panel
  pedidos: 'profesional', //     Pedidos en el panel, con su estado
  cobros: 'profesional', //      Facturas (PDF/imagen) y abonos
  clientes: 'profesional', //    Lista de clientas
  existencia: 'profesional', //  Cantidad de unidades de cada producto
  metodosPago: 'profesional', // Métodos de pago visibles en la tienda
  // Completo: todo lo que tiene la web
  lotes: 'completo', //          Inventario por lotes (Reponer / compras)
  ventaFuera: 'completo', //     Venta por fuera de la web
  gastos: 'completo', //         Gastos del negocio y personales
  finanzas: 'completo', //       Finanzas y ganancias
  app: 'completo', //            App «ELA Admin» con notificaciones
  correo: 'completo', //         Avisos por correo
  papelera: 'completo', //       Papelera (restaurar lo borrado)
  historial: 'completo', //      «Mis citas y pedidos»: la clienta sigue, cambia o cancela lo suyo
  enviarAmiga: 'completo', //    «Enviar a una amiga»: enlace /catalogo/<id> con foto y precio
  retoque: 'completo', //        Días de retoque gratis (servicios) y de cambio (productos)
} as const satisfies Record<string, Plan>

export type Funcion = keyof typeof FUNCIONES

export const esPlan = (valor: unknown): valor is Plan => typeof valor === 'string' && (PLANES as readonly string[]).includes(valor)

/** ¿Este plan trae esta función? */
export function puede(plan: Plan, funcion: Funcion): boolean {
  return PLANES.indexOf(plan) >= PLANES.indexOf(FUNCIONES[funcion])
}

/** Plan mínimo que trae la función (para el texto «Disponible en el plan …»). */
export const planMinimo = (funcion: Funcion): Plan => FUNCIONES[funcion]

/** Claves de «Textos de la web» que solo existen en ciertos planes. */
export const CLAVES_POR_FUNCION: Record<string, Funcion> = {
  paymentMethods: 'metodosPago',
  notificationEmail: 'correo',
  capitalInicial: 'finanzas',
  reinvestPercent: 'finanzas',
  cartTitle: 'carrito',
  checkoutTitle: 'carrito',
  appointmentTitle: 'citas',
  guaranteeTerms: 'retoque',
}
