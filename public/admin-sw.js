// Service worker de la app "ELA Admin" (el panel admin instalado como app).
// Recibe los avisos de citas y pedidos nuevos aunque la app esté cerrada, los
// muestra como notificación (con el punto en el ícono) y, al tocarlos,
// abre la app directo en Citas o Pedidos.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// Si no hay internet al abrir la app, en vez de la pantalla del dinosaurio
// se ve un aviso sencillo.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f6efe2;color:#2b241c;font-family:system-ui,sans-serif;text-align:center;padding:24px"><div><h1 style="font-size:20px">Sin conexión</h1><p style="color:#8a7a63">Revisa el internet y vuelve a abrir la app.</p></div></body></html>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )))
})

async function updateBadge() {
  try {
    const open = await self.registration.getNotifications()
    if (self.navigator && 'setAppBadge' in self.navigator) {
      if (open.length) await self.navigator.setAppBadge(open.length)
      else await self.navigator.clearAppBadge()
    }
  } catch (error) { /* el aparato no maneja números en el ícono: queda el punto de Android */ }
}

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (error) { data = { body: event.data ? event.data.text() : '' } }
  const title = data.title || '🔔 ELA'
  event.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body: data.body || 'Hay novedades en la tienda.',
      icon: '/admin-192.png',
      badge: '/badge-96.png',
      tag: data.tag || 'ela',
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: data.url || '/admin' },
    })
    await updateBadge()
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/admin', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const app = windows.find((client) => new URL(client.url).pathname.startsWith('/admin'))
    if (app) {
      await app.focus()
      if ('navigate' in app) await app.navigate(url).catch(() => {})
    } else {
      await self.clients.openWindow(url)
    }
    await updateBadge()
  })())
})

self.addEventListener('notificationclose', (event) => event.waitUntil(updateBadge()))
