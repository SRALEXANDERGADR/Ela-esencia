# Project Guide

## Architecture

ELA es una aplicación TanStack Start desplegada en Cloudflare Workers, para un negocio de belleza que vende dos cosas distintas bajo un mismo catálogo: **servicios** agendables (diseño de cejas, pestañas) y **productos** artesanales comprables (jabones, mantequillas). Los datos públicos de la tienda y las operaciones de administración usan server functions de TanStack. Los registros estructurados persisten en Postgres en Neon (vía el driver `neon-http` de Drizzle), las imágenes subidas se confirman en un repo de GitHub vía la API de Contents y se sirven desde `raw.githubusercontent.com`, la autenticación de admin es una única contraseña compartida (`ADMIN_PASSWORD`) con cookie de sesión firmada, y los nuevos pedidos/citas disparan opcionalmente un correo de aviso vía Resend.

## Key Directories

- `src/routes/`: rutas basadas en archivos para la tienda, políticas, panel admin y la ruta de servidor `/api/upload`.
- `src/components/Storefront.tsx`: tienda pública — sección de servicios agendables, catálogo de productos con carrito, checkout y formulario de citas.
- `src/components/AdminPanel.tsx`: panel administrativo — resumen, catálogo, citas, pedidos, facturas/abonos, clientes, editor de contenido.
- `src/lib/store.ts`: server functions, contenido semilla y operaciones de base de datos.
- `src/lib/auth.ts`: verificación de `ADMIN_PASSWORD` y helpers de la cookie de sesión firmada.
- `src/lib/github.ts`: sube imágenes a GitHub vía la API de Contents.
- `src/lib/email.ts`: envía el correo de aviso de "nuevo pedido" y "nueva cita" vía Resend.
- `src/lib/invoice.ts`: genera facturas y recibos en PDF (folio, badge de estado, descarga, compartir por WhatsApp) — inspirado en el sistema de facturación de Alexander Perfiles.
- `db/`: schema de Drizzle Postgres y cliente de Neon.
- `db/migrations/`: `0000_init.sql` es la migración inicial; genera nuevas con `pnpm db:generate` tras cambiar `db/schema.ts`, aplica con `pnpm db:migrate` (necesita `DATABASE_URL` en el entorno).
- `wrangler.jsonc`: configuración del Worker de Cloudflare. No requiere bindings — la base de datos y el almacenamiento de imágenes se alcanzan por HTTP usando secretos (`DATABASE_URL`, `GITHUB_TOKEN`, `GITHUB_REPO`, `RESEND_API_KEY`).

## Conventions

- TypeScript y componentes funcionales de React.
- Los precios se guardan siempre como centavos enteros, tanto en base de datos como en el estado de la app.
- Todo el texto de cara al usuario va en español.
- Neon Postgres para registros consultables, GitHub (API de Contents) para archivos subidos.
- Cada mutación administrativa del servidor está protegida con `requireAdmin()` / `verifySession()`.
- Genera una migración después de cada cambio de schema con `pnpm db:generate`.
- Conserva la dirección visual crema, dorado y serif elegante (inspirada en el flyer original de ELA) salvo que el dueño del producto pida un rediseño.
- Un `product` tiene un campo `kind`: `'servicio'` (se agenda, usa `durationMinutes`, ignora `stock`) o `'producto'` (se compra, usa `stock`, ignora `durationMinutes`).

## Non-obvious Decisions

- El checkout de productos crea un pedido interno en vez de procesar pagos con tarjeta; el pago y la entrega se coordinan después por WhatsApp. Lo mismo aplica a las citas: se agenda internamente y se confirma horario por WhatsApp.
- Cada pedido y cada cita generan automáticamente una **factura** (`invoices`) con folio propio en el momento de crearse — no hace falta un paso manual del admin para facturar.
- Los **abonos** (`payments`) son parciales: cada uno genera su propio folio de recibo y actualiza `invoices.paid`/`invoices.status` (`Pendiente` → `Abonado` → `Pagada`). El histórico de recibos de una factura nunca se recalcula retroactivamente.
- Los productos y el contenido editable por defecto se insertan de forma perezosa en el primer acceso a los datos (`ensureSeeded`), para que un despliegue nuevo sea usable de inmediato.
- El login de admin es una única contraseña compartida guardada como secreto `ADMIN_PASSWORD` del Worker, verificada en el servidor, respaldada por una cookie de sesión firmada con HMAC (secreto `SESSION_SECRET`). No hay sistema de cuentas por usuario.
- Las imágenes subidas se limitan a tipos MIME de imagen y 8 MB, y se confirman directamente en el repo de GitHub de la app (`GITHUB_UPLOAD_PATH`, por defecto `public/uploads`) en vez de un object store — no hay bucket que aprovisionar.
- Los clientes se pueden crear automáticamente al hacer checkout o agendar una cita (buscando primero por correo y luego por teléfono), o añadirse/editarse manualmente desde el panel admin.
- El correo de aviso de pedido/cita solo se envía si `RESEND_API_KEY` está definido Y hay una dirección de destino guardada en el editor de contenido (`notificationEmail`). La falta de configuración nunca bloquea la creación del pedido o la cita.

## Reglas añadidas (septiembre 2026)

- **Inventario:** cancelar un pedido (o mandarlo a la papelera) devuelve sus unidades; reactivarlo las vuelve a sacar (revisa antes que alcancen). Un pedido restaurado de la papelera vuelve como "Cancelado".
- **Pago y factura sincronizados:** marcar un pedido/cita como "Pagado" registra solo el abono por el saldo que faltaba; cuando los abonos saldan una factura, su pedido/cita pasa a "Pagado". No se aceptan abonos mayores que el saldo ni en facturas anuladas.
- **Validación en el servidor:** cantidades enteras de 1 a 99, solo productos activos, citas desde hoy (hora de RD, UTC-4), textos recortados.
- **La tienda pública no recibe `notificationEmail`** (ver `PRIVATE_CONTENT_KEYS` en `store.ts`).
- El número de WhatsApp se limpia (solo dígitos) antes de armar el enlace `wa.me`, así funciona aunque se escriba "+1 (829) 000-0000".
- El módulo de facturas PDF (`src/lib/invoice.ts`, jsPDF + html2canvas) se carga solo al descargar o compartir, para que el panel abra más rápido.
- La bolsa se guarda en el navegador (`localStorage`, clave `ela-cart`).

## App "ELA Admin" y notificaciones (igual que JB Tech Store)

- **Tienda y panel son 2 apps separadas.** La tienda (`public/site.webmanifest`, id y `start_url` = `/`) siempre abre en el inicio. Está en inicio, políticas, términos y en `/admin` mientras no se haya entrado. "ELA Admin" (`public/admin.webmanifest`, `scope: /admin`) solo se ofrece con la sesión abierta, y se quita al salir del panel. Así una clienta que instale desde el menú de Chrome (⋮ → Instalar / Agregar a la pantalla principal) nunca se lleva el panel.
- Efecto aceptado: desde la app ELA Admin, "Ver la tienda" abre la tienda con la barra de dirección arriba (es otra app).
- Cada cita o pedido nuevo de la tienda manda una notificación push a los aparatos activados (Admin → Ajustes → App y avisos). Al tocarla abre `/admin?tab=citas` o `/admin?tab=pedidos`.
- `src/lib/push.ts`: Web Push hecho a mano con WebCrypto (copiado de JB Tech Store). `public/admin-sw.js`: service worker con alcance `/admin`.
- Tabla `push_subscriptions`: se crea sola con `ensureSchema()` en `store.ts`. Las claves VAPID se crean solas y se guardan en `content` (key `vapidKeys`); nunca van al navegador ni al editor de textos.
- Íconos de la app: `public/admin-192.png`, `admin-512.png` y `badge-96.png` (el ícono chiquito de la notificación).
- Menú del panel agrupado: Día a día (Inicio, Citas, Pedidos, Cobros), Tu tienda (Catálogo, Clientes, Textos de la web), Ajustes (App y avisos, Papelera). En el teléfono, Inicio tiene el menú en cuadritos.

## Tarjetas, papelera de facturas y revisión (septiembre 2026)

- Pedidos, citas y cobros se ven en **tarjetas** con todo a la vista y sus botones: WhatsApp, Ver, Factura, Borrar (y en cobros: Abonar, Descargar, Compartir, Anular). "Ver" abre el pedido/cita **junto con su factura** (abonar, descargar, compartir, recibos).
- **Facturas en papelera** (`invoices.deleted_at`, creada por `ensureSchema()`): 30 días para restaurar; al borrarse definitivamente se borran sus abonos. Mandar un pedido/cita a la papelera se lleva su factura si no tiene abonos; restaurarlo la trae de vuelta (el pedido/cita vuelve como Cancelado/Cancelada).
- Dinero siempre con `formatMoney` de `src/lib/money.ts` ("RD$1,250.00"); `Intl` con es-DO salía "DOP" en Android.
- El PDF de la factura detalla los artículos del pedido y toma WhatsApp/ubicación de "Textos de la web". Se guarda como JPG dentro del PDF (~100 KB).
- Los productos de ejemplo se ponen una sola vez (`content.productsSeeded`); borrar todos los productos ya no los hace volver.
- Correo y notificación de un pedido/cita nuevo se mandan al mismo tiempo (`Promise.allSettled`).

## Inventario por lotes (FIFO) y Finanzas (igual que JB Tech Store, sin opciones)

- **Compras por lotes** (tabla `purchases`, creada por `ensureSchema()`): cada «Reponer» crea un lote con su costo y con qué dinero se pagó (`fund`: 'capital' o 'reinversion'). Al vender (pedido de la tienda, venta por fuera o reactivar un pedido) sale primero del lote más viejo con unidades (`takeStock`/`consumeFifoCost`). Cancelar o borrar un pedido devuelve las unidades a sus lotes (`returnStock`). Cada línea del pedido guarda `cost` (por unidad) y, si aplica, `reinvCost`/`reinvQty`.
- `products.cost` = costo del próximo lote que se vende (lo pone el sistema). `products.original_price` = precio de antes (tachado en la tienda). **La tienda pública nunca recibe `cost`.**
- Un producto nuevo empieza en 0 y al guardarlo se abre «Reponer». Las existencias viejas sin lote salen como "Sin costo registrado" (su costo cuenta como 0).
- **Venta por fuera** (`recordManualSale`): crea un pedido `VTA-…` (Entregado) con su factura, y el abono si ya pagaron.
- **Gastos** (tabla `expenses`): 'negocio' o 'personal'.
- **Finanzas** (en `AdminPanel.tsx`): cuentan pedidos y citas "Pagado" no cancelados (las citas no tienen costo). Mismas fórmulas que JB: Dinero del negocio = capital inicial − compras con dinero del negocio + (costo de lo vendido − recuperado de reinversión) − gastos del negocio; Dinero para reinvertir = % de la ganancia del negocio − compras con ese dinero + lo recuperado; Puedes retirar = el resto de la ganancia + ganancia propia de la reinversión − gastos personales. `capitalInicial` y `reinvestPercent` están en `content` (privados).
- El crédito "GADR Net" del pie usa el mismo estilo oficial que JB (letra recta, "Net" en #9FAD90, punto #B2603C).
