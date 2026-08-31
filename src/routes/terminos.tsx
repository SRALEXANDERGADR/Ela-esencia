import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

export const Route = createFileRoute('/terminos')({ component: Terms })

function Terms() {
  return (
    <main className="policies-page">
      <Link to="/" className="back-link"><ArrowLeft /> Volver a la tienda</Link>
      <div className="policies-title">
        <span>ELA · INFORMACIÓN LEGAL</span>
        <h1>Términos y<br />condiciones.</h1>
        <p>Última actualización: 31 de agosto de 2026</p>
      </div>
      <div className="policy-grid">
        <article>
          <span>01</span>
          <h2>Uso del sitio</h2>
          <p>Al usar esta web aceptas estos términos. La información de servicios, productos y precios puede actualizarse sin previo aviso, y procuramos que siempre refleje lo que realmente ofrecemos.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Pedidos y productos</h2>
          <p>Un pedido enviado desde el carrito no procesa ningún pago en línea: genera un número de pedido y una factura interna, y coordinamos contigo por WhatsApp el pago y la entrega. Los precios se muestran en pesos dominicanos (DOP).</p>
        </article>
        <article>
          <span>03</span>
          <h2>Citas y servicios</h2>
          <p>Agendar una cita reserva un horario de forma preliminar; la confirmamos por WhatsApp según disponibilidad real. Te pedimos avisar con al menos 24 horas de anticipación si necesitas cancelar o reprogramar.</p>
        </article>
        <article>
          <span>04</span>
          <h2>Pagos y abonos</h2>
          <p>Aceptamos pagos completos o abonos parciales sobre una factura. Cada abono queda registrado con su propio recibo y actualiza el saldo pendiente de la factura correspondiente; ese historial no se modifica retroactivamente.</p>
        </article>
        <article>
          <span>05</span>
          <h2>Facturación</h2>
          <p>Cada pedido y cada cita generan automáticamente una factura interna con folio propio. Las facturas emitidas se conservan siempre como registro, incluso si el pedido o la cita que las originó se cancela o se elimina.</p>
        </article>
        <article>
          <span>06</span>
          <h2>Cancelaciones</h2>
          <p>Un pedido o cita puede cancelarse antes de completarse. Si la factura relacionada no tiene abonos registrados, se cancela junto con el pedido/cita. Si ya tiene abonos, la factura se conserva activa (no se cancela automáticamente) hasta que se resuelva manualmente, para no perder el historial de pagos.</p>
        </article>
        <article>
          <span>07</span>
          <h2>Responsabilidades del cliente</h2>
          <p>Debes brindar datos de contacto correctos (nombre, teléfono y, si aplica, correo y dirección) para poder coordinar tu pedido o cita. Eres responsable de confirmar disponibilidad y detalles finales por WhatsApp antes de la fecha acordada.</p>
        </article>
        <article>
          <span>08</span>
          <h2>Gestión y conservación de registros</h2>
          <p>Productos, servicios, clientes, pedidos y citas que se eliminan desde el panel administrativo pasan primero a una papelera durante 30 días, con opción de restaurarse, antes de borrarse de forma definitiva. Las facturas y demás registros financieros (abonos, recibos) nunca se eliminan de esta forma: se archivan o anulan, pero se conservan por tiempo indefinido como comprobante de las operaciones realizadas.</p>
        </article>
        <article>
          <span>09</span>
          <h2>Cambios y devoluciones</h2>
          <p>Aceptamos solicitudes dentro de los 7 días posteriores a la entrega para productos sin abrir y en su empaque original. Si recibes un producto dañado, contáctanos con fotografías para evaluar el caso.</p>
        </article>
        <article>
          <span>10</span>
          <h2>Contacto</h2>
          <p>Para consultas sobre estos términos, tu factura, tus datos o cualquier otra duda, escríbenos por el botón de WhatsApp de la tienda. Respondemos de lunes a sábado, previa cita.</p>
        </article>
      </div>
    </main>
  )
}
