import { HeadContent, Link, Scripts, createRootRoute } from '@tanstack/react-router'

import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      {
        name: 'theme-color',
        content: '#f6efe2',
      },
      {
        title: 'ELA — La belleza de ser tú.',
      },
      {
        name: 'description',
        content: 'Servicios de belleza (diseño de cejas, pestañas) y productos artesanales (jabones, mantequillas corporales) en Jarabacoa, República Dominicana.',
      },
      {
        property: 'og:title',
        content: 'ELA — La belleza de ser tú.',
      },
      {
        property: 'og:description',
        content: 'Belleza, cuidado y bienestar: servicios de cejas y pestañas, y productos artesanales hechos a mano.',
      },
      {
        property: 'og:type',
        content: 'website',
      },
      {
        property: 'og:url',
        content: 'https://elaesencia.gadrnet.workers.dev/',
      },
      {
        property: 'og:image',
        content: 'https://elaesencia.gadrnet.workers.dev/og-cover.jpg',
      },
      {
        property: 'og:image:width',
        content: '1200',
      },
      {
        property: 'og:image:height',
        content: '630',
      },
      {
        property: 'og:image:alt',
        content: 'ELA — La belleza de ser tú.',
      },
      {
        name: 'twitter:card',
        content: 'summary_large_image',
      },
      {
        name: 'twitter:title',
        content: 'ELA — La belleza de ser tú.',
      },
      {
        name: 'twitter:description',
        content: 'Belleza, cuidado y bienestar: servicios de cejas y pestañas, y productos artesanales hechos a mano.',
      },
      {
        name: 'twitter:image',
        content: 'https://elaesencia.gadrnet.workers.dev/og-cover.jpg',
      },
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Jost:wght@400;500;600;700&family=DM+Mono:wght@400;500&family=Mrs+Saint+Delafield&display=swap' },
      { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
      { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
      { rel: 'icon', type: 'image/png', sizes: '48x48', href: '/favicon-48x48.png' },
      { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/site.webmanifest' },
      { rel: 'msapplication-config', href: '/browserconfig.xml' },
    ],
  }),
  shellComponent: RootDocument,
  // Si algo falla, se muestra un mensaje amable en vez de una pantalla en
  // blanco. El error real queda en los logs de Cloudflare.
  errorComponent: () => <ErrorScreen title="No pudimos cargar la página" text="Hubo un problema de conexión. Vuelve a intentarlo en un momento." retry />,
  notFoundComponent: () => <ErrorScreen title="Esta página no existe" text="Puede que el enlace esté incompleto o que la página se haya movido." />,
})

function ErrorScreen({ title, text, retry = false }: { title: string; text: string; retry?: boolean }) {
  return (
    <main className="error-screen">
      <span className="brand-mark"><span className="brand-mark-main">Ela</span><span className="brand-mark-sub">esencia</span></span>
      <h1>{title}</h1>
      <p>{text}</p>
      <div>
        {retry && <button className="primary-button" onClick={() => window.location.reload()}>Intentar de nuevo</button>}
        <Link className="back-link" to="/">Ir a la tienda</Link>
      </div>
    </main>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
