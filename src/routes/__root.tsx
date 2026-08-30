import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
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
        content: 'https://gadrnet.workers.dev/',
      },
      {
        property: 'og:image',
        content: 'https://gadrnet.workers.dev/og-cover.jpg',
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
        content: 'https://gadrnet.workers.dev/og-cover.jpg',
      },
    ],
    links: [
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
})

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
