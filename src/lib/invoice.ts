// ═══════════════════════════════════════════════════════════════════════
// Módulo de facturas y recibos — inspirado en el sistema de facturación
// de Alexander Perfiles (folio legible, badge de estado, descarga en PDF,
// compartir por WhatsApp/Web Share), adaptado a la paleta e identidad de
// ELA y a facturas que pueden originarse en un PEDIDO (productos) o una
// CITA (servicio), con soporte de abonos parciales (saldo pendiente).
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
const shortDate = (value: string | Date) => new Intl.DateTimeFormat('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))

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
        Gracias por confiar en ELA. Documento generado automáticamente y sin firma requerida.
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

async function htmlToPdf(html: string): Promise<jsPDF> {
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.top = '0'
  container.style.left = '0'
  container.style.zIndex = '-9999'
  container.style.opacity = '0.01'
  container.style.pointerEvents = 'none'
  container.innerHTML = html
  document.body.appendChild(container)
  return new Promise((resolve) => {
    const doc = new jsPDF('p', 'pt', 'letter')
    doc.html(container, {
      x: 0, y: 0, width: 612, windowWidth: 720, autoPaging: 'text',
      callback: (pdf) => { document.body.removeChild(container); resolve(pdf) },
    })
  })
}

function fileBase(name: string) {
  return String(name || 'documento').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()
}

export async function downloadInvoicePdf(invoice: InvoiceLike) {
  const pdf = await htmlToPdf(buildInvoiceHtml(invoice))
  pdf.save(`Factura-${fileBase(invoice.customerName)}-${invoice.folio}.pdf`)
}

export async function downloadReceiptPdf(invoice: InvoiceLike, payment: PaymentLike) {
  const pdf = await htmlToPdf(buildReceiptHtml(invoice, payment))
  pdf.save(`Recibo-${fileBase(invoice.customerName)}-${payment.folio}.pdf`)
}

function invoiceShareText(invoice: InvoiceLike) {
  const saldo = Math.max(invoice.total - invoice.paid, 0)
  return [
    `*Factura ${invoice.folio} — ELA*`,
    `Cliente: ${invoice.customerName}`,
    `Concepto: ${invoice.concept}`,
    `Fecha: ${shortDate(invoice.createdAt)}`,
    '',
    `Total: ${money(invoice.total)}`,
    invoice.paid > 0 ? `Abonado: ${money(invoice.paid)}` : '',
    saldo > 0 ? `Saldo pendiente: ${money(saldo)}` : 'Estado: Pagada',
    '',
    'ELA · La belleza de ser tú.',
  ].filter(Boolean).join('\n')
}

export async function shareInvoice(invoice: InvoiceLike, phone?: string) {
  const text = invoiceShareText(invoice)
  if (navigator.share) {
    try { await navigator.share({ title: `Factura ${invoice.folio}`, text }); return } catch { /* usuario canceló */ }
  }
  const target = phone ? phone.replace(/[^0-9]/g, '') : ''
  window.open(`https://wa.me/${target}?text=${encodeURIComponent(text)}`, '_blank')
}
