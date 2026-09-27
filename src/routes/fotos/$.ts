import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'

// Sirve las fotos de productos y servicios guardadas en R2 (ver src/lib/fotos.ts).
// Cada foto tiene un nombre único que nunca cambia, así que el navegador
// puede guardarla un año sin volver a pedirla.
export const Route = createFileRoute('/fotos/$')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const key = params._splat || ''
        if (!env.FOTOS || !key || key.includes('..') || key.includes('/')) return new Response('Foto no encontrada', { status: 404 })
        const object = await env.FOTOS.get(key)
        if (!object) return new Response('Foto no encontrada', { status: 404 })
        const headers = new Headers({
          'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
          'Cache-Control': 'public, max-age=31536000, immutable',
          ETag: object.httpEtag,
        })
        if (request.headers.get('If-None-Match') === object.httpEtag) return new Response(null, { status: 304, headers })
        return new Response(object.body, { headers })
      },
    },
  },
})
