// Sube imágenes (de producto o de contenido) al repositorio de GitHub
// configurado, usando la API de "Contents" (PUT /repos/{repo}/contents/{path}).
// GitHub sirve el archivo de inmediato desde raw.githubusercontent.com: no
// hace falta esperar ningún build ni deploy para que la imagen esté disponible.
//
// Requiere los secretos de Cloudflare GITHUB_TOKEN y GITHUB_REPO (ver
// README.md). Si no están configurados, se lanza un error explicativo.

const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // 8 MB

export async function uploadImage(
  env: Env,
  { filename, dataUrl }: { filename: string; dataUrl: string },
): Promise<string> {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    throw new Error('La carga de imágenes no está configurada. Define GITHUB_TOKEN y GITHUB_REPO en el servidor.')
  }

  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
  if (!match) throw new Error('El archivo recibido no es una imagen válida.')
  const [, contentType, base64] = match
  if (!contentType.startsWith('image/')) throw new Error('El archivo debe ser una imagen.')
  if (base64.length * 0.75 > MAX_IMAGE_BYTES) throw new Error('La imagen no puede superar 8 MB.')

  const extension = contentType.split('/')[1]?.split('+')[0]?.toLowerCase() || 'jpg'
  const safeBase = filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
  const path = `${env.GITHUB_UPLOAD_PATH || 'public/uploads'}/${Date.now()}-${safeBase || 'imagen'}.${extension}`
  const branch = env.GITHUB_BRANCH || 'main'

  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'User-Agent': 'ela-esencia-app',
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: `Sube imagen: ${path}`, content: base64, branch }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`No pudimos subir la imagen a GitHub (${response.status}). ${detail.slice(0, 200)}`)
  }

  const result = (await response.json()) as { content?: { download_url?: string } }
  const downloadUrl = result.content?.download_url
  if (!downloadUrl) throw new Error('GitHub no devolvió la URL pública de la imagen.')
  return downloadUrl
}
