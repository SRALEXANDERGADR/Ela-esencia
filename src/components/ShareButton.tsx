import { useEffect, useRef, useState } from 'react'

/**
 * Botón de compartir para el navbar.
 * - Abre un popover tipo "speech bubble" (con caret apuntando al botón).
 * - Nace visualmente desde el botón (transform-origin) con fade-in + scale-up.
 * - Se cierra con fade-out + scale-down al hacer click afuera, presionar
 *   Escape, o elegir una opción — y recién después de la animación se
 *   desmonta del DOM (no hay "salto" abrupto). Abrir y cerrar comparten
 *   exactamente la misma transición CSS (misma duración y curva en
 *   ambos sentidos, igual que el menú lateral / carrito), así que el
 *   cierre se ve como el "reverso" exacto de la apertura, a la misma
 *   velocidad.
 *
 * Comportamiento de cada opción (todas comparten como MENSAJE, nunca
 * como publicación):
 * - WhatsApp: abre wa.me con el texto y el link ya armados para enviar.
 * - Messenger: intenta abrir la app de Messenger directo en modo
 *   "enviar" (fb-messenger://share), que manda el link como mensaje
 *   privado. Si la app no está instalada, cae de respaldo al share
 *   nativo del sistema (o al diálogo web de Facebook como último
 *   recurso).
 * - Instagram: Instagram no tiene ningún enlace/intent público para
 *   enviar texto directo a un chat (solo acepta imágenes/video por esa
 *   vía), así que — tanto en Android como en iOS — usamos el menú
 *   nativo de compartir del teléfono (navigator.share); desde ahí el
 *   usuario elige Instagram y el link llega a su bandeja de Direct.
 *   Antes se intentaba un Intent apuntado directo al paquete de
 *   Instagram, pero como ese Intent nunca resuelve para texto plano,
 *   Android caía en la Play Store — por eso se quitó.
 */

// La duración de la animación (.45s) vive en la transición CSS de
// .share-popover (styles.css) y es la misma que usa el menú lateral y
// el carrito. Esta constante solo controla cuándo se desmonta el
// popover del DOM una vez termina la animación de cierre, y debe
// coincidir con esa misma duración.
const CLOSE_ANIMATION_MS = 450
const DEEP_LINK_FALLBACK_MS = 1600

type PopoverState = 'closed' | 'open' | 'closing'
type Feedback = 'link' | 'instagram' | null

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
)

// Glifo oficial del logo de WhatsApp (globo de diálogo + auricular),
// dibujado en un viewBox cuadrado como el resto de los íconos del
// menú para que se vea proporcionado dentro de la insignia circular
// (el trazo anterior quedaba estirado/deformado en algunos tamaños).
const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.85.5 3.58 1.4 5.07L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm0 18.06a8.1 8.1 0 0 1-4.14-1.13l-.3-.18-3.12.82.83-3.04-.2-.31a8.1 8.1 0 0 1-1.25-4.31c0-4.5 3.66-8.16 8.18-8.16 4.5 0 8.16 3.66 8.16 8.16 0 4.51-3.66 8.15-8.16 8.15Zm4.48-6.13c-.24-.12-1.45-.72-1.68-.8-.22-.08-.39-.12-.56.12-.16.24-.63.8-.78.96-.14.16-.29.18-.53.06-.24-.12-1.03-.38-1.96-1.21-.72-.65-1.21-1.45-1.36-1.69-.14-.24-.02-.37.11-.49.11-.11.24-.29.36-.43.12-.14.16-.24.24-.4.08-.16.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.42h-.48c-.16 0-.42.06-.65.31-.22.24-.85.83-.85 2.03s.87 2.36 1 2.52c.12.16 1.71 2.62 4.15 3.67.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.45-.59 1.65-1.16.2-.57.2-1.05.14-1.15-.06-.1-.22-.16-.46-.29Z" />
  </svg>
)

const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
    <rect x="3" y="3" width="18" height="18" rx="5.5" />
    <circle cx="12" cy="12" r="4.2" />
    <circle cx="17" cy="7" r="1.1" fill="currentColor" stroke="none" />
  </svg>
)

// Ícono de Messenger (no de Facebook): la opción abre directo la app
// de Messenger en modo "enviar" (fb-messenger://share), así que el
// ícono y el texto deben corresponder a Messenger, no al logo de "f"
// de Facebook.
const MessengerIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.15 2 11.26c0 2.91 1.44 5.51 3.7 7.21V22l3.38-1.86c.9.25 1.87.38 2.92.38 5.52 0 10-4.15 10-9.26C22 6.15 17.52 2 12 2Zm1.02 12.47-2.55-2.72-4.98 2.72 5.48-5.82 2.61 2.72 4.92-2.72-5.48 5.82Z" />
  </svg>
)

const LinkIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
    <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.5-1.5" />
  </svg>
)

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

export function ShareButton({ title }: { title: string }) {
  const [state, setState] = useState<PopoverState>('closed')
  const [feedback, setFeedback] = useState<Feedback>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Cierra en dos tiempos: primero dispara la animación (closing),
  // y solo cuando termina, se desmonta del DOM (closed).
  const requestClose = () => setState((current) => (current === 'open' ? 'closing' : current))

  const toggle = () => setState((current) => (current === 'closed' ? 'open' : current === 'open' ? 'closing' : current))

  useEffect(() => {
    if (state !== 'closing') return
    const timer = setTimeout(() => setState('closed'), CLOSE_ANIMATION_MS)
    return () => clearTimeout(timer)
  }, [state])

  useEffect(() => {
    if (state !== 'open') return
    const onPointerDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) requestClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [state])

  const shareUrl = typeof window !== 'undefined' ? window.location.href : ''
  const shareText = `${title} ${shareUrl}`

  const openWindow = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer,width=600,height=640')
  }

  // Intenta abrir un esquema de app nativa (deep link). Si la pestaña
  // pierde el foco antes del tiempo límite, asumimos que la app abrió y
  // cancelamos el respaldo. Si no, ejecutamos el respaldo (la app no
  // está instalada o el dispositivo no soporta el esquema).
  const tryDeepLink = (deepLink: string, fallback: () => void) => {
    let handled = false
    const onBlur = () => {
      handled = true
      window.removeEventListener('blur', onBlur)
    }
    window.addEventListener('blur', onBlur)
    window.location.href = deepLink
    setTimeout(() => {
      window.removeEventListener('blur', onBlur)
      if (!handled && !document.hidden) fallback()
    }, DEEP_LINK_FALLBACK_MS)
  }

  // WhatsApp: comparte directo como mensaje (ya funciona perfecto así).
  const shareWhatsApp = () => {
    openWindow(`https://wa.me/?text=${encodeURIComponent(shareText)}`)
    requestClose()
  }

  // Messenger: el usuario ya tiene la app y su sesión iniciada, así
  // que abrimos directo el modo "enviar" de Messenger, que manda el
  // link como mensaje privado — nunca como publicación en el muro de
  // Facebook. Si el esquema no responde, probamos el share nativo del
  // sistema y, como último recurso, el diálogo web de Facebook.
  const shareMessenger = () => {
    const deepLink = `fb-messenger://share?link=${encodeURIComponent(shareUrl)}&app_id=0`
    tryDeepLink(deepLink, () => {
      if (navigator.share) {
        navigator.share({ title, text: title, url: shareUrl }).catch(() => {})
      } else {
        openWindow(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`)
      }
    })
    requestClose()
  }

  // Instagram: no existe ningún esquema/Intent público de Instagram
  // que acepte texto plano (solo admite compartirle imagen/video por
  // esa vía), así que apuntar un Intent de ACTION_SEND de texto contra
  // com.instagram.android nunca resolvía — y por eso Android terminaba
  // cayendo a la Play Store en vez de abrir la app. La forma confiable
  // de "enviar como mensaje de Instagram", tanto en Android como en
  // iOS, es el selector nativo de compartir del teléfono: ahí
  // Instagram aparece como una opción y el link llega directo al chat
  // elegido, como mensaje.
  const shareInstagram = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, text: title, url: shareUrl })
      } catch {
        // el usuario canceló el menú nativo, no hacemos nada más
      }
      requestClose()
      return
    }
    try {
      await navigator.clipboard.writeText(shareUrl)
      setFeedback('instagram')
      setTimeout(() => setFeedback(null), 1700)
    } catch {
      requestClose()
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setFeedback('link')
      setTimeout(() => {
        setFeedback(null)
        requestClose()
      }, 1000)
    } catch {
      requestClose()
    }
  }

  return (
    <div className="share-wrap" ref={wrapRef}>
      <button
        type="button"
        className="icon-button icon-button-sm share-trigger"
        onClick={toggle}
        aria-haspopup="true"
        aria-expanded={state === 'open'}
        aria-label="Compartir"
      >
        <ShareIcon />
      </button>

      {state !== 'closed' && (
        <div className={`share-popover ${state}`} role="menu">
          <button type="button" className="share-item" role="menuitem" onClick={shareWhatsApp}>
            <span className="share-icon-badge whatsapp"><WhatsAppIcon /></span>
            WhatsApp
          </button>
          <button type="button" className="share-item" role="menuitem" onClick={shareInstagram}>
            <span className="share-icon-badge instagram"><InstagramIcon /></span>
            {feedback === 'instagram' ? 'Enlace copiado' : 'Instagram'}
          </button>
          <button type="button" className="share-item" role="menuitem" onClick={shareMessenger}>
            <span className="share-icon-badge messenger"><MessengerIcon /></span>
            Messenger
          </button>
          <button type="button" className={`share-item${feedback === 'link' ? ' copied' : ''}`} role="menuitem" onClick={copyLink}>
            <span className="share-icon-badge copy">{feedback === 'link' ? <CheckIcon /> : <LinkIcon />}</span>
            {feedback === 'link' ? '¡Copiado!' : 'Copiar enlace'}
          </button>
        </div>
      )}
    </div>
  )
}
