import { useEffect, useRef, useState } from 'react'

/**
 * Botón de compartir para el navbar.
 * - Abre un popover tipo "speech bubble" (con caret apuntando al botón).
 * - Nace visualmente desde el botón (transform-origin) con fade-in + scale-up,
 *   con una animación deliberadamente pausada (1.3s) para que se note.
 * - Se cierra con fade-out + scale-down al hacer click afuera, presionar
 *   Escape, o elegir una opción — y recién después de la animación se
 *   desmonta del DOM (no hay "salto" abrupto).
 *
 * Comportamiento de cada opción (todas comparten como MENSAJE, nunca
 * como publicación):
 * - WhatsApp: abre wa.me con el texto y el link ya armados para enviar.
 * - Facebook: intenta abrir la app de Facebook directo en modo "enviar"
 *   (fb-messenger://share), que manda el link como mensaje privado. Si
 *   la app no está instalada, cae de respaldo al share nativo del
 *   sistema (o al diálogo web de Facebook como último recurso).
 * - Instagram: abre el menú nativo de compartir del teléfono
 *   (navigator.share), que en Instagram entrega el link directo al
 *   chat, como mensaje. Si el navegador no soporta share nativo, copia
 *   el enlace como respaldo.
 */

// La duración de la animación (1.3s) vive en la transición CSS de
// .share-popover (styles.css). Esta constante solo controla cuándo se
// desmonta el popover del DOM una vez termina la animación de cierre,
// y debe coincidir con esa misma duración.
const CLOSE_ANIMATION_MS = 1300
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

const WhatsAppIcon = () => (
  <svg viewBox="0 0 32 32" width="17" height="17" fill="currentColor">
    <path d="M16.02 3C9.4 3 4 8.4 4 15.02c0 2.22.6 4.32 1.66 6.12L3 29l8.06-2.62a12.9 12.9 0 0 0 4.96.98h.01C22.65 27.36 28 21.97 28 15.34 28 8.72 22.65 3 16.02 3Zm0 22.5c-1.66 0-3.28-.44-4.69-1.28l-.34-.2-4.79 1.56 1.57-4.67-.22-.36a10.35 10.35 0 0 1-1.59-5.53c0-5.72 4.66-10.38 10.38-10.38S26.4 9.3 26.4 15.02 21.74 25.5 16.02 25.5Zm5.68-7.77c-.31-.16-1.84-.91-2.12-1.01-.29-.1-.5-.16-.7.15-.21.32-.8 1.01-.98 1.21-.18.21-.36.23-.67.08-.31-.16-1.3-.48-2.48-1.53-.92-.82-1.53-1.83-1.72-2.14-.18-.32-.02-.49.14-.65.14-.14.31-.36.47-.55.16-.18.21-.31.31-.52.1-.21.05-.39-.03-.55-.08-.16-.7-1.68-.96-2.3-.25-.6-.51-.52-.7-.53h-.6c-.21 0-.55.08-.83.39-.29.32-1.09 1.06-1.09 2.59s1.12 3 1.27 3.21c.16.21 2.2 3.35 5.33 4.7.75.32 1.33.51 1.78.66.75.24 1.43.2 1.97.12.6-.09 1.84-.75 2.1-1.48.26-.72.26-1.34.18-1.47-.08-.13-.28-.21-.59-.37Z" />
  </svg>
)

const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
    <rect x="3" y="3" width="18" height="18" rx="5.5" />
    <circle cx="12" cy="12" r="4.2" />
    <circle cx="17" cy="7" r="1.1" fill="currentColor" stroke="none" />
  </svg>
)

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
    <path d="M14.5 21.9v-7.86h2.64l.4-3.06H14.5V9c0-.89.25-1.49 1.52-1.49h1.62V4.77c-.28-.04-1.24-.12-2.36-.12-2.34 0-3.94 1.43-3.94 4.04v2.33H8.7v3.06h2.64v7.86h3.16Z" />
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

  // Facebook: el usuario ya tiene la app y su sesión iniciada, así que
  // abrimos directo el modo "enviar" de Facebook (Messenger), que manda
  // el link como mensaje privado — nunca como publicación en el muro.
  // Si el esquema no responde, probamos el share nativo del sistema y,
  // como último recurso, el diálogo web de Facebook.
  const shareFacebook = () => {
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

  // Instagram no tiene un intent web propio, así que usamos el menú
  // nativo de compartir del teléfono (el mismo de la galería): desde
  // ahí, al elegir Instagram, el link llega directo al chat, como
  // mensaje. Si el navegador no soporta compartir nativo, copiamos el
  // enlace como respaldo.
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
          <button type="button" className="share-item" role="menuitem" onClick={shareFacebook}>
            <span className="share-icon-badge facebook"><FacebookIcon /></span>
            Facebook
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
