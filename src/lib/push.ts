// ───────────────────────────────────────────────────────────────────────
// NOTIFICACIONES PUSH (Web Push) — sin librerías, solo con WebCrypto, que
// ya viene en Cloudflare Workers.
//
// Cómo funciona:
//  1. El teléfono (la app del panel admin) le pide permiso al usuario y se
//     "suscribe": el navegador entrega una dirección única (endpoint, de
//     Google en Android) + 2 claves para cifrar lo que se le mande.
//  2. Esa suscripción se guarda en la base de datos (push_subscriptions).
//  3. Cuando entra un pedido, el servidor cifra el aviso (RFC 8291) y lo
//     manda a cada endpoint, firmado con las claves VAPID de la tienda
//     (RFC 8292). Google lo entrega al teléfono aunque la app esté cerrada.
// ───────────────────────────────────────────────────────────────────────

export type PushSubscriptionRow = { endpoint: string; p256dh: string; auth: string }
export type VapidKeys = { publicKey: string; privateJwk: JsonWebKey }
export type PushMessage = { title: string; body: string; url?: string; tag?: string }

const encoder = new TextEncoder()

export function toBase64Url(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) { out.set(part, offset); offset += part.length }
  return out
}

/** Claves VAPID nuevas (se crean una sola vez y se guardan en la base). */
export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
  const publicRaw = await crypto.subtle.exportKey('raw', pair.publicKey) as ArrayBuffer
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey) as JsonWebKey
  return { publicKey: toBase64Url(publicRaw), privateJwk }
}

/** Firma VAPID (JWT ES256) para el servicio de push de ese endpoint. */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): Promise<string> {
  const audience = new URL(endpoint).origin
  const header = toBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = toBase64Url(encoder.encode(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 60 * 60, sub: subject })))
  const key = await crypto.subtle.importKey('jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(`${header}.${claims}`))
  return `vapid t=${header}.${claims}.${toBase64Url(signature)}, k=${keys.publicKey}`
}

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8)
  return new Uint8Array(bits)
}

/** Cifra el aviso para UN teléfono (RFC 8291, "aes128gcm"). `testing`
 * solo se usa para comprobar el cifrado contra el ejemplo oficial del RFC. */
export async function encryptPayload(
  payload: Uint8Array,
  subscription: { p256dh: string; auth: string },
  testing?: { serverKeys: CryptoKeyPair; salt: Uint8Array<ArrayBuffer> },
): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = fromBase64Url(subscription.p256dh)
  const authSecret = fromBase64Url(subscription.auth)
  const serverKeys = testing?.serverKeys ?? await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const serverPublic = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey) as ArrayBuffer)
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as EcdhKeyDeriveParams, serverKeys.privateKey, 256))

  const keyInfo = concat(encoder.encode('WebPush: info\0'), uaPublic, serverPublic)
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32)
  const salt = testing?.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12)

  // Un solo registro: el texto + el delimitador 0x02 ("último registro").
  const record = concat(payload, new Uint8Array([2]))
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, record))

  const recordSize = new Uint8Array(4)
  new DataView(recordSize.buffer).setUint32(0, 4096)
  return concat(salt, recordSize, new Uint8Array([serverPublic.length]), serverPublic, cipher)
}

/** Manda un aviso a un teléfono. `result` es 'gone' si esa suscripción ya
 * no existe (app desinstalada o permiso quitado) para borrarla de la base;
 * `status`/`detail` dicen qué respondió el servicio de push (para avisar
 * en el panel si algo falla). */
export type PushResult = { result: 'ok' | 'gone' | 'error'; status: number; detail: string }

export async function sendPush(subscription: PushSubscriptionRow, message: PushMessage, keys: VapidKeys, subject: string): Promise<PushResult> {
  try {
    const body = await encryptPayload(encoder.encode(JSON.stringify(message)), subscription)
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidAuthorization(subscription.endpoint, keys, subject),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(24 * 60 * 60), // si el teléfono está apagado, se entrega al prenderlo (hasta 1 día)
        Urgency: 'high',
      },
      body,
    })
    const detail = response.ok ? '' : (await response.text().catch(() => '')).slice(0, 160)
    if (response.status === 404 || response.status === 410) return { result: 'gone', status: response.status, detail }
    return { result: response.ok ? 'ok' : 'error', status: response.status, detail }
  } catch (error) {
    return { result: 'error', status: 0, detail: error instanceof Error ? error.message.slice(0, 160) : 'sin conexión' }
  }
}
