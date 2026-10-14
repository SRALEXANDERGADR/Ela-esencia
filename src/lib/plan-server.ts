import { env } from 'cloudflare:workers'
import { getCookie, getRequest } from '@tanstack/react-start/server'
import { COOKIE_PLAN, esPlan, puede, type Funcion, type Plan } from './plan'

// Solo para el servidor. Decide en qué plan está la web en ESTA petición:
//  - PLAN = "basico" | "profesional" | "completo" → web ya vendida: plan fijo,
//    no se puede cambiar desde la dirección ni con la cookie.
//  - PLAN = "demo" → web de muestra: manda ?plan=… de la dirección y, si no
//    viene, la cookie «gadr_plan». Sin ninguno de los dos = completo.
//  - PLAN no existe (o tiene otro valor) → completo, así nada de lo que ya
//    funcionaba se rompe.
export function currentPlan(): { plan: Plan; demo: boolean } {
  const modo = String(env.PLAN ?? '').trim().toLowerCase()
  if (esPlan(modo)) return { plan: modo, demo: false }
  if (modo === 'demo') {
    let desdeDireccion: string | null = null
    try { desdeDireccion = new URL(getRequest().url).searchParams.get('plan')?.toLowerCase() ?? null } catch { /* sin petición: se usa la cookie */ }
    let desdeCookie: string | undefined
    try { desdeCookie = getCookie(COOKIE_PLAN)?.toLowerCase() } catch { /* sin cookie */ }
    return { plan: [desdeDireccion, desdeCookie].find(esPlan) ?? 'completo', demo: true }
  }
  return { plan: 'completo', demo: false }
}

/** Corta la petición si el plan no trae la función (no basta con esconder el botón). */
export function requirePlan(funcion: Funcion) {
  if (!puede(currentPlan().plan, funcion)) throw new Error('Esta función no está incluida en tu plan')
}

export const planIncluye = (funcion: Funcion) => puede(currentPlan().plan, funcion)
