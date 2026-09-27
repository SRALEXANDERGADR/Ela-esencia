// Fotos de productos y servicios. Si el Worker tiene el almacén R2 de Cloudflare
// (binding FOTOS en wrangler.jsonc), las fotos nuevas se guardan ahí y se
// sirven desde /fotos/<nombre> (ver src/routes/fotos/$.ts). Así subir una
// foto ya no hace un commit ni vuelve a publicar la tienda.
// Si no hay R2, se siguen subiendo a GitHub como antes. Las fotos viejas de
// GitHub siguen funcionando igual (y se borran de GitHub como siempre).
import { deleteImageFile as deleteFromGithub, pathFromDownloadUrl, uploadImage as uploadToGithub } from './github'

export const R2_URL_PREFIX = '/fotos/'
// En la papelera de imágenes, las fotos de R2 se guardan como "r2/<nombre>".
const R2_PATH_PREFIX = 'r2/'
const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // 8 MB

export async function uploadImage(env: Env, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo debe ser una imagen.')
  if (file.size > MAX_IMAGE_BYTES) throw new Error('La imagen no puede superar 8 MB.')

  if (env.FOTOS) {
    const extension = file.type.split('/')[1]?.split('+')[0]?.toLowerCase() || 'jpg'
    const safeBase = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60)
    const key = `${Date.now()}-${safeBase || 'imagen'}.${extension}`
    await env.FOTOS.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' },
    })
    return R2_URL_PREFIX + key
  }

  // Sin R2: a GitHub, como antes. Se arma en bloques de 32 KB en vez de letra
  // por letra: con fotos grandes gastaba mucho tiempo de CPU del Worker.
  let binary = ''
  const bytes = new Uint8Array(await file.arrayBuffer())
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return uploadToGithub(env, { filename: file.name, dataUrl: `data:${file.type};base64,${btoa(binary)}` })
}

// Ruta que se guarda en la papelera de imágenes, o null si la foto no la
// subimos nosotros (ej. un placeholder o una URL externa pegada a mano).
export function imagePathFromUrl(env: Env, url: string): string | null {
  if (url.startsWith(R2_URL_PREFIX)) return R2_PATH_PREFIX + url.slice(R2_URL_PREFIX.length)
  return pathFromDownloadUrl(env, url)
}

export async function deleteImage(env: Env, path: string): Promise<void> {
  if (path.startsWith(R2_PATH_PREFIX)) {
    if (!env.FOTOS) throw new Error('El almacén de fotos (R2) no está configurado.')
    await env.FOTOS.delete(path.slice(R2_PATH_PREFIX.length))
    return
  }
  await deleteFromGithub(env, path)
}
