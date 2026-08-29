import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { env } from 'cloudflare:workers'
import * as schema from './schema.js'

// `env` viene del binding de variables/secretos de Cloudflare Workers.
// Con el plugin @cloudflare/vite-plugin, tanto `vite dev` como el build
// final ejecutan este código dentro del runtime de Workers, así que
// `cloudflare:workers` siempre está disponible aquí.
if (!env.DATABASE_URL) {
  throw new Error('Falta la variable de entorno DATABASE_URL (cadena de conexión de Neon). Configúrala como secreto de Cloudflare o en .dev.vars para desarrollo local.')
}

const sql = neon(env.DATABASE_URL)
export const db = drizzle({ client: sql, schema })
