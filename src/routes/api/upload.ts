import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { verifySession } from '@/lib/auth'
import { uploadImage } from '@/lib/github'

export const Route = createFileRoute('/api/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authorized = await verifySession()
        if (!authorized) return Response.json({ error: 'No autorizado' }, { status: 401 })

        const form = await request.formData()
        const file = form.get('file')
        if (!(file instanceof File)) return Response.json({ error: 'Archivo inválido' }, { status: 400 })
        if (!file.type.startsWith('image/') || file.size > 8_000_000) {
          return Response.json({ error: 'Usa una imagen de hasta 8 MB' }, { status: 400 })
        }

        try {
          const buffer = await file.arrayBuffer()
          let binary = ''
          const bytes = new Uint8Array(buffer)
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
          const dataUrl = `data:${file.type};base64,${btoa(binary)}`
          const url = await uploadImage(env, { filename: file.name, dataUrl })
          return Response.json({ url })
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : 'No pudimos subir la imagen.'
          return Response.json({ error: message }, { status: 500 })
        }
      },
    },
  },
})
