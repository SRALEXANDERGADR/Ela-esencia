import { createFileRoute } from '@tanstack/react-router'

// Lo usa el service worker de la app JB Admin (public/admin-sw.js) cuando el
// navegador cambia la dirección de los avisos, para que no se apaguen solos.
// GET: clave pública (es pública). POST: cambiar la dirección vieja por la
// nueva (solo si la vieja estaba guardada; ver renewPushSubscription).
export const Route = createFileRoute('/api/push-renew')({
  server: {
    handlers: {
      GET: async () => {
        const { getPushPublicKey } = await import('@/lib/push-renew')
        return Response.json({ publicKey: await getPushPublicKey() }, { headers: { 'Cache-Control': 'no-store' } })
      },
      POST: async ({ request }) => {
        // Se carga aquí adentro para que el código del servidor no llegue al navegador.
        const { renewPushSubscription } = await import('@/lib/push-renew')
        const body = (await request.json().catch(() => null)) as Record<string, string> | null
        if (!body) return Response.json({ ok: false }, { status: 400 })
        const ok = await renewPushSubscription({ oldEndpoint: body.oldEndpoint, endpoint: body.endpoint, p256dh: body.p256dh, auth: body.auth })
        return Response.json({ ok }, { status: ok ? 200 : 404 })
      },
    },
  },
})
