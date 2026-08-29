# ELA — La belleza de ser tú.

Tienda web completa para ELA (belleza, cuidado y bienestar): agenda de **servicios** (diseño de cejas, pestañas por grupito...) y venta de **productos artesanales** (jabones, mantequillas corporales), con panel administrativo protegido, facturación con folios y abonos parciales, y editor de contenido del sitio.

Este proyecto combina lo mejor de las tiendas previas del negocio:

- La base técnica y el patrón de tienda + carrito + checkout de **Ventas** y **Ritual Cobre** (TanStack Start + Neon + Cloudflare Workers).
- El editor de contenido completo y el aviso automático por correo de **Ritual Cobre**.
- El sistema de **facturación con folio, badge de estado, descarga en PDF y recibo de abono compartible por WhatsApp** de **Alexander Perfiles** (`factura.js`), adaptado a la identidad de ELA.
- Un flujo nuevo de **citas** (agenda de servicios), que no existía en ninguna de las tiendas anteriores, ya que ELA vende tanto servicios agendables como productos físicos.

## Tecnologías

- TanStack Start, React 19 y TypeScript
- Tailwind CSS 4 y CSS personalizado (identidad crema, dorado y serif elegante, inspirada en el flyer de ELA)
- **Postgres en Neon** con Drizzle ORM para servicios/productos, clientes, pedidos, citas, facturas y abonos
- **GitHub (API de Contents)** para alojar las imágenes subidas desde el panel — se sirven desde `raw.githubusercontent.com`, sin necesidad de crear buckets
- Sesión de administrador protegida con `ADMIN_PASSWORD` (Cloudflare Secret) + cookie firmada con `SESSION_SECRET`
- Aviso automático por correo (Resend) cada vez que un cliente completa un pedido o agenda una cita
- Generación de facturas y recibos en PDF en el navegador con `jsPDF`, sin backend adicional
- Cloudflare Workers (vía `@cloudflare/vite-plugin`) para hosting y API

## Qué incluye la tienda pública

- **Servicios de belleza** (cejas, pestañas...): tarjetas con duración y precio, botón "Agendar cita" que abre un formulario de fecha/hora y genera un número de cita.
- **Productos artesanales** (jabones, mantequillas...): catálogo filtrable por categoría y buscador, carrito lateral y checkout.
- Sección de beneficios, historia de marca, y footer con WhatsApp, ubicación, Instagram y TikTok — todo editable desde el panel.
- Página de políticas (`/politicas`).

## Panel de administración (`/admin`)

- **Resumen**: pedidos totales, citas próximas, saldos pendientes, servicios/productos y stock bajo, clientes, más actividad reciente de pedidos y agenda.
- **Catálogo**: crear, editar, eliminar y subir imágenes tanto de servicios (con duración) como de productos (con existencias).
- **Citas**: agenda completa, cambio de estado (Pendiente/Confirmada/Completada/Cancelada) y estado de pago, crear citas manualmente, ver factura.
- **Pedidos**: historial de pedidos de productos, cambio de estado y pago, ver factura.
- **Facturas y abonos**: cada pedido y cada cita genera automáticamente una factura con folio. Desde aquí se registran abonos parciales (saldo pendiente), se descarga la factura en PDF, se comparte por WhatsApp, se descarga cada recibo de abono por separado, y se puede cancelar una factura.
- **Clientes**: registrar, editar y eliminar clientes manualmente, además de los que se crean solos al agendar o comprar.
- **Editor de contenido**: todos los textos e imágenes del sitio (marca, hero, beneficios, servicios, catálogo, historia, footer, ubicación, redes sociales), incluyendo el correo que recibe el aviso de nuevos pedidos y citas.
- Búsqueda incluida en catálogo, citas, pedidos, facturas y clientes.

## Desarrollo local

1. Instala dependencias con `pnpm install` (o `npm install`).
2. Copia `.dev.vars.example` a `.dev.vars` y completa los valores (ver abajo).
3. Genera tipos de bindings: `pnpm cf-typegen`.
4. Inicia el entorno local: `pnpm dev`.
5. Abre `http://localhost:3000`.

## Configuración inicial (Cloudflare + Neon + GitHub)

1. Crea un proyecto en [Neon](https://neon.tech), copia la cadena de conexión y guárdala como secreto: `wrangler secret put DATABASE_URL`.
2. Aplica la migración inicial (`db/migrations/0000_init.sql`) contra tu base de datos de Neon, o genera nuevas migraciones con `pnpm db:generate` y `pnpm db:migrate` si modificas `db/schema.ts`.
3. Crea un token de GitHub con permiso de escritura sobre el repo donde se guardarán las imágenes, y define los secretos: `wrangler secret put GITHUB_TOKEN` y `wrangler secret put GITHUB_REPO` (formato `usuario/repositorio`). Opcionalmente `GITHUB_BRANCH` y `GITHUB_UPLOAD_PATH`.
4. Define los secretos de acceso: `wrangler secret put ADMIN_PASSWORD` y `wrangler secret put SESSION_SECRET`.
5. (Opcional) Para recibir el aviso por correo de cada pedido y cada cita, crea una cuenta en [Resend](https://resend.com) y define `wrangler secret put RESEND_API_KEY` (y opcionalmente `RESEND_FROM_EMAIL`). Luego escribe el correo de destino en **Panel administrativo → Editor de contenido → Notificaciones**.
6. Despliega: `pnpm deploy`.
7. Actualiza el número de WhatsApp, la ubicación, las redes sociales y todos los textos desde **Panel administrativo → Editor de contenido**.
8. Carga los servicios y productos reales de ELA (con sus fotos) desde **Panel administrativo → Catálogo** — el proyecto trae datos de ejemplo basados en el flyer original que puedes editar o eliminar.

## Sobre las facturas y los abonos

Cada vez que un cliente completa un pedido o agenda una cita, se crea automáticamente una **factura** con folio propio (formato `FAC-DDMMAAAA-XXXX`). Desde la pestaña **Facturas y abonos** puedes:

- Ver el saldo pendiente de cada factura en tiempo real.
- Registrar un abono parcial (efectivo, transferencia o tarjeta), lo que genera un **recibo** con su propio folio (`REC-DDMMAAAA-XXXX`).
- Descargar tanto la factura como cada recibo en PDF, o compartirlos directamente por WhatsApp.
- El estado de la factura pasa automáticamente de *Pendiente* → *Abonado* → *Pagada* según el saldo restante.
