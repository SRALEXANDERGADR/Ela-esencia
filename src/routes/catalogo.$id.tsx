import { createFileRoute } from '@tanstack/react-router'
import { Storefront } from '@/components/Storefront'
import { getStorefront } from '@/lib/store'
import { formatMoney } from '@/lib/money'

// Enlace de «Enviar a una amiga»: /catalogo/<id>. Abre la tienda con la ficha
// de ese servicio o producto ya abierta y, al pegarlo en WhatsApp o Facebook,
// sale con su foto, su nombre y su precio. (El botón es del plan Completo; el
// enlace funciona en cualquier plan.)
const SITE = 'https://elaesencia.gadrnet.workers.dev'

export const Route = createFileRoute('/catalogo/$id')({
  loader: async ({ params }) => {
    const data = await getStorefront()
    const product = data.products.find((item) => item.id === Number(params.id)) ?? null
    return { data, product }
  },
  head: ({ loaderData, params }) => {
    const links = [{ rel: 'manifest', href: '/site.webmanifest' }]
    const product = loaderData?.product
    if (!product || !loaderData) return { links }
    const brand = loaderData.data.content.brandName || 'ELA'
    const image = new URL(product.image || '/og-cover.jpg', SITE).toString()
    const title = `${product.name} · ${brand}`
    const what = product.kind === 'servicio' ? `Agenda tu cita en ${brand}.` : `Pídelo en ${brand}.`
    const description = `${formatMoney(product.price)} · ${(product.description || what).replace(/\s+/g, ' ').trim()}`.slice(0, 200)
    return {
      links,
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'product' },
        { property: 'og:url', content: `${SITE}/catalogo/${params.id}` },
        { property: 'og:image', content: image },
        { property: 'og:image:alt', content: product.name },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
        { name: 'twitter:image', content: image },
      ],
    }
  },
  component: CatalogLink,
})

function CatalogLink() {
  const { data, product } = Route.useLoaderData()
  return <Storefront data={data} initialDetailId={product?.id} />
}
