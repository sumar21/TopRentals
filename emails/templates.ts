// One function per transactional email. Replaces the hidden PowerApps template
// screens (desktop Screen_Mails / mobile Mails). Typed inputs, no ambient state.
import { renderBrandedEmail, renderEmailTable, formatMoney, escapeHtml } from './emailTemplate';

export interface CompraLineaEmail {
  edificio: string;
  articulo: string;
  cantidad: number;
  costo_unitario: number;
  costo_total: number;
}

const compraTable = (lineas: CompraLineaEmail[]) =>
  renderEmailTable(
    ['Edificio', 'Artículo', 'Cantidad', 'Precio Unit.', 'Total'],
    lineas.map((l) => [l.edificio, l.articulo, String(l.cantidad), formatMoney(l.costo_unitario), formatMoney(l.costo_total)]),
    { label: 'Total', value: formatMoney(lineas.reduce((a, l) => a + l.costo_total, 0)) },
    ['left', 'left', 'right', 'right', 'right'],
  );

/** "Orden de Compra Enviada a Aprobación" (was HtmlTEnviarAprobacion). */
export function compraEnviadaAprobacionEmail(nroCompra: string | number, lineas: CompraLineaEmail[], solicitante: string) {
  return {
    subject: `Compra - Pendiente de Aprobación - Nro ${nroCompra}`,
    html: renderBrandedEmail({
      title: `Orden de Compra Nro ${nroCompra}`,
      intro: 'Se envió una orden de compra a aprobación.',
      badge: 'Compras',
      contentHtml: compraTable(lineas),
      footerNote: `Solicitada por ${solicitante}`,
    }),
  };
}

/** "Orden de Compra Aprobada" (was html_CompraAprobadaGerencia). */
export function compraAprobadaEmail(nroCompra: string | number, lineas: CompraLineaEmail[], aprobador: string) {
  return {
    subject: `Compra - Aprobada - Nro ${nroCompra}`,
    html: renderBrandedEmail({
      title: `Orden de Compra Nro ${nroCompra} aprobada`,
      badge: 'Aprobaciones',
      contentHtml: compraTable(lineas),
      footerNote: `Aprobada por ${aprobador}`,
    }),
  };
}

export interface CompraRecibidaLinea extends CompraLineaEmail {
  recibido: number | null;
}

/** "Orden de Compra Recibida" (was html_CompraRecibida). */
export function compraRecibidaEmail(nroCompra: string | number, lineas: CompraRecibidaLinea[], obs: string | null, receptor: string) {
  const table = renderEmailTable(
    ['Edificio', 'Artículo', 'Pedido', 'Recibido', 'Precio Unit.', 'Total Pedido', 'Total Recibido'],
    lineas.map((l) => [
      l.edificio,
      l.articulo,
      String(l.cantidad),
      l.recibido == null ? '-' : String(l.recibido),
      formatMoney(l.costo_unitario),
      formatMoney(l.costo_total),
      l.recibido == null ? '-' : formatMoney(l.costo_unitario * l.recibido),
    ]),
    { label: 'Total recibido', value: formatMoney(lineas.reduce((a, l) => a + l.costo_unitario * (l.recibido ?? 0), 0)) },
    ['left', 'left', 'right', 'right', 'right', 'right', 'right'],
  );
  return {
    subject: `Compra - Recibida - Nro ${nroCompra}`,
    html: renderBrandedEmail({
      title: `Orden de Compra Nro ${nroCompra} recibida`,
      badge: 'Compras',
      contentHtml: table + (obs ? `<p style="margin:16px 0 0;font-size:13px;"><strong>Notas de recepción:</strong> ${escapeHtml(obs)}</p>` : ''),
      footerNote: `Recibida por ${receptor}`,
    }),
  };
}

export interface OTResueltaInput {
  nroOT: number;
  activo: string;
  tipoTrabajo: string | null;
  tipoTarea: string | null;
  diasEstimados: number | null;
  diasUtilizados: number;
  repuestos: Array<{ repuesto: string; cantidad: number }>;
  tecnico: string;
}

/** "Resolución - Orden de Trabajo" (was html_ordenResuelta / mobile HtmlText1). */
export function otResueltaEmail(ot: OTResueltaInput) {
  const repuestosHtml = ot.repuestos.length
    ? `<h3 style="margin:20px 0 8px;font-size:13px;font-weight:700;">Repuestos utilizados</h3>` +
      renderEmailTable(
        ['Repuesto', 'Cantidad'],
        ot.repuestos.map((r) => [r.repuesto, String(r.cantidad)]),
        undefined,
        ['left', 'right'],
      )
    : `<p style="margin:16px 0 0;font-size:13px;">Sin repuestos utilizados.</p>`;
  const meta = renderEmailTable(
    ['Tipo de trabajo', 'Tipo de tarea', 'Días estimados', 'Días utilizados'],
    [[ot.tipoTrabajo ?? 'No asignado', ot.tipoTarea ?? 'No asignado', ot.diasEstimados == null ? '-' : String(ot.diasEstimados), String(ot.diasUtilizados)]],
  );
  return {
    subject: `Resolución - Orden de Trabajo Nro ${ot.nroOT}`,
    html: renderBrandedEmail({
      title: `Orden de Trabajo Nro ${ot.nroOT} resuelta`,
      intro: `Se resolvió la orden de trabajo del activo ${ot.activo}.`,
      badge: 'Mantenimiento',
      contentHtml: meta + repuestosHtml,
      footerNote: `Resuelta por ${ot.tecnico}`,
    }),
  };
}
