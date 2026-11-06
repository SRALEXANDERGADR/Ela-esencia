// MARCA DE LA TIENDA — un solo lugar con el nombre, el lema y la dirección de
// la web. Lo usan las etiquetas para compartir, el logo de las pantallas de
// error, el panel, las facturas y los correos cuando todavía no hay textos.
//
// Al vender esta web a otra clienta: cambia esto, el nombre de la marca en el
// panel (Textos de la web → «Nombre de la marca»), los dos manifest de public/
// (site.webmanifest y admin.webmanifest) y los íconos de public/.
export const BRAND = {
  name: 'Alma Esencial',
  tagline: 'Belleza que nace de ti.',
  description: 'Servicios de belleza (cejas, pestañas y faciales) y productos hechos a mano (jabones, mantequillas y aceites corporales) en República Dominicana.',
  shareDescription: 'Belleza, cuidado y bienestar: cejas, pestañas y faciales, y productos naturales hechos a mano.',
  // Cambia cuando la web tenga su dominio propio (sin «/» al final).
  site: 'https://almaesencial.gadrnet.workers.dev',
}

export const BRAND_TITLE = `${BRAND.name} — ${BRAND.tagline}`

/** Logo de letras: la primera palabra va en letra cursiva y el resto debajo,
 * en versalitas («Alma Esencial» → «Alma» + «Esencial»). */
export function splitBrand(name: string) {
  const words = String(name || BRAND.name).trim().split(/\s+/).filter(Boolean)
  return { main: words[0] || BRAND.name, sub: words.slice(1).join(' ') }
}
