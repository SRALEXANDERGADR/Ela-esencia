import { createFileRoute } from '@tanstack/react-router'
import { Storefront } from '@/components/Storefront'
import { getStorefront } from '@/lib/store'

export const Route = createFileRoute('/')({
  loader: () => getStorefront(),
  component: Home,
})

function Home() {
  return <Storefront data={Route.useLoaderData()} />
}
