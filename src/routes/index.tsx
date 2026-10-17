import { createFileRoute } from '@tanstack/react-router'
import { Storefront } from '@/components/Storefront'
import { getStorefront } from '@/lib/store'

export const Route = createFileRoute('/')({
  // La tienda y el panel son 2 "apps" distintas al instalarlas: cada página
  // trae su propio manifest (el del panel lo agrega el panel al entrar).
  // El tamaño de la portada va aquí (no en __root) para no aplicárselo a las
  // fotos de los artículos en los enlaces de «Enviar a una amiga».
  head: () => ({
    meta: [{ property: 'og:image:width', content: '1200' }, { property: 'og:image:height', content: '630' }],
    links: [{ rel: 'manifest', href: '/site.webmanifest' }],
  }),
  loader: () => getStorefront(),
  component: Home,
})

function Home() {
  return <Storefront data={Route.useLoaderData()} />
}
