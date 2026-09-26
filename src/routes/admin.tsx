import { createFileRoute } from '@tanstack/react-router'
import { AdminPanel } from '@/components/AdminPanel'

// El panel se puede instalar como app ("ELA Admin") con su propio ícono y
// recibe las notificaciones de citas y pedidos nuevos (ver public/admin-sw.js).
export const Route = createFileRoute('/admin')({
  head: () => ({
    meta: [
      { title: 'ELA Admin' },
      { name: 'robots', content: 'noindex' },
      { name: 'apple-mobile-web-app-title', content: 'ELA Admin' },
    ],
    // El manifest (lo que hace que Chrome ofrezca "Instalar app") NO va
    // aquí: lo agrega el panel solo DESPUÉS de entrar con la contraseña, así
    // nadie más ve la oferta de instalar el panel.
    links: [{ rel: 'apple-touch-icon', href: '/admin-192.png' }],
  }),
  component: AdminPanel,
})
