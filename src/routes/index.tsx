import { createFileRoute } from '@tanstack/react-router'
import { Storefront } from '@/components/Storefront'
import { getStorefront } from '@/lib/store'

export const Route = createFileRoute('/')({
  // La tienda y el panel son 2 "apps" distintas al instalarlas: cada página
  // trae su propio manifest (el del panel lo agrega el panel al entrar).
  head: () => ({ links: [{ rel: 'manifest', href: '/site.webmanifest' }] }),
  loader: () => getStorefront(),
  component: Home,
})

function Home() {
  return <Storefront data={Route.useLoaderData()} />
}
