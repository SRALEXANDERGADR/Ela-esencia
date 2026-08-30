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
