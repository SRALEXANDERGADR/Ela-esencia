// Entrada del Worker: es la que trae TanStack Start (`fetch`, que sirve la
// tienda y el panel) más una tarea programada (`scheduled`).
//
// La tarea (ver `triggers.crons` en wrangler.jsonc) solo toca la base de datos
// cada 12 horas. Neon archiva los proyectos sin uso (a Ela le pasó a las 24
// horas) y, al despertarlos, la primera visita puede tardar tanto que el panel
// se cuelga. Con este toque la base nunca llega a dormirse del todo.
import handler from '@tanstack/react-start/server-entry'
import { neon } from '@neondatabase/serverless'

export default {
  fetch: handler.fetch,
  async scheduled(_event: unknown, env: { DATABASE_URL?: string }) {
    if (!env.DATABASE_URL) return
    await neon(env.DATABASE_URL)`select 1`
  },
}
