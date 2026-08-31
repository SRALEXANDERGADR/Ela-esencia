// ═══════════════════════════════════════════════════════════════════════
// Módulo de facturas y recibos — adopta el mismo método probado de
// Alexander Perfiles y Ritual Cobre: la factura se dibuja en un iframe
// aislado y se captura con html2canvas, así el PDF y la imagen que se
// comparte por WhatsApp salen IDÉNTICOS a la vista previa (sin recortes
// ni elementos mal centrados, que es lo que causaba jsPDF con su método
// .html()). Al compartir, se adjunta la imagen real del documento (no
// solo texto), con un texto corto de acompañamiento — igual que hace
// Alexander Perfiles — y si el dispositivo no soporta compartir archivos,
// en vez de mandar solo texto por WhatsApp se fuerza la descarga de la
// imagen para que el cliente igual se quede con su factura.
// ═══════════════════════════════════════════════════════════════════════
import { jsPDF } from 'jspdf'

export type InvoiceLike = {
  id: number
  folio: string
  sourceType: string
  customerName: string
  phone: string
  concept: string
  total: number
  paid: number
  status: string
  createdAt: string | Date
}

export type PaymentLike = {
  folio: string
  amount: number
  method: string
  note: string
  createdAt: string | Date
}

const money = (cents: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(cents / 100)

const longDate = (value: string | Date) => new Intl.DateTimeFormat('es-DO', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value))

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c] as string))
}

function badgeFor(invoice: InvoiceLike) {
  if (invoice.status === 'Cancelada') return { texto: 'CANCELADA', estilo: 'background:#e2e8f0;color:#475569;' }
  if (invoice.status === 'Pagada') return { texto: 'PAGADA', estilo: 'background:#dcfce7;color:#15803d;' }
  if (invoice.status === 'Abonado') return { texto: 'ABONO PARCIAL', estilo: 'background:#fef3c7;color:#b45309;' }
  return { texto: 'PENDIENTE', estilo: 'background:#fde2e2;color:#b91c1c;' }
}

function buildInvoiceHtml(invoice: InvoiceLike): string {
  const badge = badgeFor(invoice)
  const saldo = Math.max(invoice.total - invoice.paid, 0)
  const origen = invoice.sourceType === 'cita' ? 'Servicio agendado' : 'Pedido de productos'

  return `
    <div id="ela-doc" style="width:720px;background:#ffffff;color:#2b241c;font-family:Georgia,'Times New Roman',serif;padding:44px;box-sizing:border-box;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #c9a26a;padding-bottom:20px;margin-bottom:28px;">
        <div>
          <div style="font-size:24px;font-weight:bold;letter-spacing:.06em;color:#2b241c;">ELA</div>
          <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#b08c56;margin-top:2px;">La belleza de ser tú</div>
          <div style="font-size:12px;color:#7a6d5c;margin-top:6px;">Jarabacoa, República Dominicana</div>
          <div style="font-size:12px;color:#7a6d5c;">WhatsApp: +1 (829) 847-3618</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:20px;font-weight:bold;color:#8a5a35;letter-spacing:.05em;">FACTURA</div>
          <div style="font-size:12px;color:#7a6d5c;margin-top:4px;">Folio: <strong style="color:#2b241c;">${escapeHtml(invoice.folio)}</strong></div>
          <div style="font-size:12px;color:#7a6d5c;">Emitida: ${longDate(invoice.createdAt)}</div>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:28px;">
        <div>
          <div style="font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:.06em;color:#a99a84;margin-bottom:6px;">Facturado a</div>
          <div style="font-size:16px;font-weight:bold;">${escapeHtml(invoice.customerName)}</div>
          <div style="font-size:13px;color:#7a6d5c;margin-top:2px;">${escapeHtml(invoice.phone)}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:.06em;color:#a99a84;margin-bottom:6px;">Estado</div>
          <div style="display:inline-block;font-size:12px;font-weight:bold;padding:5px 14px;border-radius:999px;${badge.estilo}">${badge.texto}</div>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:22px;">
        <thead>
          <tr style="background:#faf4ea;">
            <th style="text-align:left;padding:10px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8a5a35;border-bottom:2px solid #e4d3b4;">Concepto</th>
            <th style="text-align:right;padding:10px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8a5a35;border-bottom:2px solid #e4d3b4;">Monto</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:14px 12px;border-bottom:1px solid #eee2cf;font-size:14px;">${escapeHtml(invoice.concept)}<br><span style="font-size:11px;color:#a99a84;">${origen}</span></td>
            <td style="padding:14px 12px;border-bottom:1px solid #eee2cf;font-size:14px;text-align:right;font-weight:bold;">${money(invoice.total)}</td>
          </tr>
          ${invoice.paid > 0 ? `
          <tr>
            <td style="padding:14px 12px;border-bottom:1px solid #eee2cf;font-size:14px;color:#15803d;">Abonos recibidos</td>
            <td style="padding:14px 12px;border-bottom:1px solid #eee2cf;font-size:14px;text-align:right;font-weight:bold;color:#15803d;">- ${money(invoice.paid)}</td>
          </tr>` : ''}
        </tbody>
        <tfoot>
          <tr>
            <td style="padding:14px 12px;text-align:right;font-size:13px;font-weight:bold;color:#7a6d5c;">${saldo > 0 ? 'Saldo pendiente' : 'Total pagado'}</td>
            <td style="padding:14px 12px;text-align:right;font-size:18px;font-weight:bold;color:#8a5a35;">${money(saldo > 0 ? saldo : invoice.total)}</td>
          </tr>
        </tfoot>
      </table>

      <div style="border-top:1px solid #eee2cf;padding-top:16px;font-size:11px;color:#a99a84;text-align:center;">
        Gracias por confiar en ELA. Documento generado automáticamente y sin firma requerida.<br>
        Este documento se conserva en nuestro sistema. Si necesitas una copia o información relacionada con esta factura, puedes contactarnos.
      </div>
    </div>`
}

function buildReceiptHtml(invoice: InvoiceLike, payment: PaymentLike): string {
  const saldoTrasPago = Math.max(invoice.total - invoice.paid, 0)
  return `
    <div id="ela-doc" style="width:720px;background:#ffffff;color:#2b241c;font-family:Georgia,'Times New Roman',serif;padding:44px;box-sizing:border-box;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #c9a26a;padding-bottom:20px;margin-bottom:28px;">
        <div>
          <div style="font-size:24px;font-weight:bold;letter-spacing:.06em;color:#2b241c;">ELA</div>
          <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#b08c56;margin-top:2px;">La belleza de ser tú</div>
          <div style="font-size:12px;color:#7a6d5c;margin-top:6px;">WhatsApp: +1 (829) 847-3618</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:20px;font-weight:bold;color:#8a5a35;letter-spacing:.05em;">RECIBO DE PAGO</div>
          <div style="font-size:12px;color:#7a6d5c;margin-top:4px;">Folio: <strong style="color:#2b241c;">${escapeHtml(payment.folio)}</strong></div>
          <div style="font-size:12px;color:#7a6d5c;">Fecha de pago: ${longDate(payment.createdAt)}</div>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:28px;">
        <div>
          <div style="font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:.06em;color:#a99a84;margin-bottom:6px;">Pagado por</div>
          <div style="font-size:16px;font-weight:bold;">${escapeHtml(invoice.customerName)}</div>
          <div style="font-size:13px;color:#7a6d5c;margin-top:2px;">${escapeHtml(invoice.phone)}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:.06em;color:#a99a84;margin-bottom:6px;">Referencia</div>
          <div style="font-size:13px;color:#7a6d5c;">Factura ${escapeHtml(invoice.folio)}</div>
          <div style="font-size:13px;color:#7a6d5c;">Método: ${escapeHtml(payment.method)}</div>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:22px;">
        <thead>
          <tr style="background:#faf4ea;">
            <th style="text-align:left;padding:10px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8a5a35;border-bottom:2px solid #e4d3b4;">Concepto</th>
            <th style="text-align:right;padding:10px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8a5a35;border-bottom:2px solid #e4d3b4;">Monto</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:14px 12px;border-bottom:1px solid #eee2cf;font-size:14px;">${escapeHtml(invoice.concept)}${payment.note ? `<br><span style="font-size:11px;color:#a99a84;">${escapeHtml(payment.note)}</span>` : ''}</td>
            <td style="padding:14px 12px;border-bottom:1px solid #eee2cf;font-size:14px;text-align:right;font-weight:bold;">${money(payment.amount)}</td>
          </tr>
          ${saldoTrasPago > 0 ? `
          <tr>
            <td style="padding:14px 12px;border-bottom:1px solid #eee2cf;font-size:14px;color:#b45309;">Saldo pendiente tras este abono<br><span style="font-size:11px;color:#a99a84;">De un total de ${money(invoice.total)}</span></td>
            <td style="padding:14px 12px;border-bottom:1px solid #eee2cf;font-size:14px;text-align:right;font-weight:bold;color:#b45309;">${money(saldoTrasPago)}</td>
          </tr>` : ''}
        </tbody>
        <tfoot>
          <tr>
            <td style="padding:14px 12px;text-align:right;font-size:13px;font-weight:bold;color:#7a6d5c;">Total pagado (este abono)</td>
            <td style="padding:14px 12px;text-align:right;font-size:18px;font-weight:bold;color:#15803d;">${money(payment.amount)}</td>
          </tr>
        </tfoot>
      </table>

      <div style="border-top:1px solid #eee2cf;padding-top:16px;font-size:11px;color:#a99a84;text-align:center;">
        Este recibo confirma un pago ya recibido y no cambia aunque el estado de la factura cambie después. Gracias por confiar en ELA.
      </div>
    </div>`
}

// Renderiza el HTML de la factura/recibo en un iframe aislado (sin las
// hojas de estilo del sitio, para que html2canvas capture únicamente los
// estilos inline de arriba) y devuelve el canvas resultante a 720px de
// ancho. El iframe se retira siempre, incluso si algo falla.
async function renderDocCanvas(html: string) {
  const { default: html2canvas } = await import('html2canvas')
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.top = '0'
  iframe.style.left = '-99999px'
  iframe.style.width = '720px'
  iframe.style.height = '10px'
  iframe.style.border = '0'
  document.body.appendChild(iframe)
  try {
    const idoc = iframe.contentDocument
    if (!idoc) throw new Error('No se pudo preparar el documento.')
    idoc.open()
    idoc.write('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0"></body></html>')
    idoc.close()
    idoc.body.innerHTML = html
    if (idoc.fonts?.ready) await Promise.race([idoc.fonts.ready, new Promise((r) => setTimeout(r, 300))])
    return await html2canvas(idoc.body.firstElementChild as HTMLElement, { scale: 2, backgroundColor: '#ffffff', windowWidth: 720 })
  } finally {
    document.body.removeChild(iframe)
  }
}

function fileBase(name: string) {
  return String(name || 'documento').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()
}

// Convierte el canvas capturado en un PDF de una sola imagen (igual que
// Alexander Perfiles y Ritual Cobre): esto es lo que evita el recorte y
// el mal centrado que causaba el método .html() de jsPDF, porque el PDF
// simplemente embebe la misma imagen que ya se ve bien en la vista previa.
function canvasToPdf(canvas: HTMLCanvasElement) {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const imgWidth = pageWidth - 40
  const imgHeight = imgWidth * (canvas.height / canvas.width)
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 20, 20, imgWidth, imgHeight)
  return pdf
}

export async function downloadInvoicePdf(invoice: InvoiceLike) {
  const canvas = await renderDocCanvas(buildInvoiceHtml(invoice))
  canvasToPdf(canvas).save(`Factura-${fileBase(invoice.customerName)}-${invoice.folio}.pdf`)
}

export async function downloadReceiptPdf(invoice: InvoiceLike, payment: PaymentLike) {
  const canvas = await renderDocCanvas(buildReceiptHtml(invoice, payment))
  canvasToPdf(canvas).save(`Recibo-${fileBase(invoice.customerName)}-${payment.folio}.pdf`)
}

// Renderiza el documento, lo convierte en imagen y lo comparte con un
// texto corto de acompañamiento (solo lo necesario para identificarlo en
// el chat — los detalles ya están en la imagen). Si el dispositivo no
// puede compartir archivos, en vez de mandar un mensaje de WhatsApp con
// solo texto se fuerza la descarga de la imagen.
async function shareDoc(html: string, fileNamePrefix: string, folio: string, shareTitle: string, shareText: string) {
  const canvas = await renderDocCanvas(html)
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  const nombreArchivo = `${fileNamePrefix}-${folio}.png`

  if (blob) {
    const file = new File([blob], nombreArchivo, { type: 'image/png' })
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: shareTitle, text: shareText })
        return
      }
      if (navigator.share) {
        await navigator.share({ title: shareTitle, text: shareText })
        return
      }
    } catch (caught) {
      if (caught instanceof Error && caught.name === 'AbortError') return // el usuario canceló
      // si compartir falla por cualquier otro motivo, seguimos abajo y forzamos la descarga
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = nombreArchivo; a.click()
    URL.revokeObjectURL(url)
    return
  }
  // Último respaldo si ni siquiera se pudo generar la imagen.
  window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank')
}

export async function shareInvoice(invoice: InvoiceLike) {
  const text = `Factura ${invoice.folio} de ${invoice.customerName} — ELA`
  await shareDoc(buildInvoiceHtml(invoice), 'Factura', invoice.folio, `Factura ${invoice.folio}`, text)
}

export async function shareReceipt(invoice: InvoiceLike, payment: PaymentLike) {
  const text = `Recibo ${payment.folio} de ${invoice.customerName} — ELA`
  await shareDoc(buildReceiptHtml(invoice, payment), 'Recibo', payment.folio, `Recibo ${payment.folio}`, text)
}
