// Tipado mínimo de las variables/secretos de Cloudflare Workers usados por la app.
interface Env {
  DATABASE_URL: string
  ADMIN_PASSWORD: string
  SESSION_SECRET: string
  // Subida de imágenes de producto/servicio a GitHub (obligatorio para poder subir imágenes). Ver README.md.
  GITHUB_TOKEN?: string
  // Formato "usuario/repositorio"
  GITHUB_REPO?: string
  // Rama donde se guardan las imágenes (por defecto "main")
  GITHUB_BRANCH?: string
  // Carpeta del repo donde se guardan las imágenes (por defecto "public/uploads")
  GITHUB_UPLOAD_PATH?: string
  // Almacén R2 de Cloudflare para las fotos nuevas (binding "FOTOS" en wrangler.jsonc). Sin él, se usa GitHub.
  FOTOS?: FotosBucket
  // Envío de correo de aviso de pedidos y citas con Resend (https://resend.com). Ver README.md.
  RESEND_API_KEY?: string
  // Remitente del correo, ej. "ELA <pedidos@tudominio.com>" (opcional)
  RESEND_FROM_EMAIL?: string
}

// Lo mínimo que usamos de un bucket R2 (la app no carga los tipos completos de Workers).
interface FotosBucket {
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }): Promise<unknown>
  get(key: string): Promise<{ body: ReadableStream; httpEtag: string; httpMetadata?: { contentType?: string; cacheControl?: string } } | null>
  delete(key: string): Promise<void>
}

declare module 'cloudflare:workers' {
  export const env: Env
}
