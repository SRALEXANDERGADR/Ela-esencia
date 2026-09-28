// Solo del servidor: lo usa la ruta /api/push-renew (ver
// src/routes/api/push-renew.ts). Está aparte de store.ts para que este
// código nunca llegue al navegador.
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { content, pushSubscriptions } from '../../db/schema'

/** Clave pública de los avisos (es pública: el service worker la usa para
 * volver a suscribirse solo). */
export async function getPushPublicKey(): Promise<string> {
  const [row] = await db.select().from(content).where(eq(content.key, 'vapidKeys')).limit(1)
  try { return row?.value ? String(JSON.parse(row.value).publicKey || '') : '' } catch { return '' }
}

/** El navegador a veces cambia la dirección de los avisos de un aparato
 * (evento pushsubscriptionchange). El service worker manda la vieja y la
 * nueva: solo se acepta si la vieja estaba guardada (nadie más la conoce),
 * así un extraño no puede agregarse para recibir los pedidos. */
export async function renewPushSubscription(data: { oldEndpoint: string; endpoint: string; p256dh: string; auth: string }): Promise<boolean> {
  const oldEndpoint = String(data.oldEndpoint || '')
  const endpoint = String(data.endpoint || '')
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !data.p256dh || !data.auth) return false
  const [old] = oldEndpoint ? await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, oldEndpoint)).limit(1) : []
  if (!old) return false
  const values = { endpoint, p256dh: String(data.p256dh).slice(0, 200), auth: String(data.auth).slice(0, 100), label: old.label }
  await db.insert(pushSubscriptions).values(values).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { p256dh: values.p256dh, auth: values.auth } })
  if (oldEndpoint !== endpoint) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, old.id))
  return true
}
