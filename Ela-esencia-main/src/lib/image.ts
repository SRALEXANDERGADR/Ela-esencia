// Redimensiona y comprime una imagen en el navegador antes de subirla,
// usando <canvas>. Esto evita mandar fotos de cámara de varios MB al
// servidor (y a GitHub), que hacían que la tienda cargara muy lento.
//
// - Redimensiona para que el lado más largo no pase de MAX_DIMENSION.
// - Reexporta como JPEG con calidad JPEG_QUALITY (los PNG con
//   transparencia se preservan solo si el navegador no soporta bien
//   JPEG; en la práctica casi siempre da JPEG).
// - Si por algún motivo la compresión falla, se devuelve el archivo
//   original tal cual, para no bloquear la subida.

const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.8

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  // Los SVG no se rasterizan: no tiene sentido "comprimirlos" con canvas.
  if (file.type === 'image/svg+xml') return file

  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height))

    // Si la imagen ya es pequeña, no hace falta tocarla.
    if (scale >= 1 && file.size <= 600 * 1024) {
      bitmap.close()
      return file
    }

    const targetWidth = Math.round(width * scale)
    const targetHeight = Math.round(height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close(); return file }

    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    if (!blob) return file

    const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], newName, { type: 'image/jpeg' })
  } catch {
    // Si algo falla (navegador viejo, archivo raro, etc.), seguimos con el original.
    return file
  }
}
