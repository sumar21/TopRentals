// One function per transactional email. Replaces the hidden PowerApps template
// screens (desktop Screen_Mails / mobile Mails). Typed inputs, no ambient state.
// Compras usan el layout "Cable Sur" (secciones + tabla); Mantenimiento el "Wash Inn"
// (kicker + lista clave/valor + narrativa). IDs SIEMPRE numéricos (nunca el univoco).
import { renderBrandedEmail, renderEmailTable, renderSectionTitle, renderKeyValueList, formatMoney, escapeHtml } from './emailTemplate.ts';

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
export function compraEnviadaAprobacionEmail(nroCompra: number, lineas: CompraLineaEmail[], solicitante: string) {
  return {
    subject: `Compra - Pendiente de Aprobación - N° ${nroCompra}`,
    html: renderBrandedEmail({
      kicker: 'Compras',
      badge: 'Pendiente',
      title: `Orden de Compra N° ${nroCompra}`,
      intro: 'Se envió una orden de compra a aprobación.',
      contentHtml: renderSectionTitle('Artículos a comprar') + compraTable(lineas),
      footerNote: `Solicitada por ${solicitante}`,
    }),
  };
}

/** "Orden de Compra Aprobada" (was html_CompraAprobadaGerencia). */
export function compraAprobadaEmail(nroCompra: number, lineas: CompraLineaEmail[], aprobador: string) {
  return {
    subject: `Compra - Aprobada - N° ${nroCompra}`,
    html: renderBrandedEmail({
      kicker: 'Aprobaciones',
      badge: 'Aprobada',
      title: `Orden de Compra N° ${nroCompra} aprobada`,
      contentHtml: renderSectionTitle('Artículos aprobados') + compraTable(lineas),
      footerNote: `Aprobada por ${aprobador}`,
    }),
  };
}

export interface CompraRecibidaLinea extends CompraLineaEmail {
  recibido: number | null;
}

/** "Orden de Compra Recibida" (was html_CompraRecibida). */
export function compraRecibidaEmail(nroCompra: number, lineas: CompraRecibidaLinea[], obs: string | null, receptor: string) {
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
    subject: `Compra - Recibida - N° ${nroCompra}`,
    html: renderBrandedEmail({
      kicker: 'Compras',
      badge: 'Recibida',
      title: `Orden de Compra N° ${nroCompra} recibida`,
      contentHtml:
        renderSectionTitle('Recepción de artículos') +
        table +
        (obs ? renderSectionTitle('Notas de recepción') + `<p style="margin:0;font-size:13px;line-height:1.5;">${escapeHtml(obs)}</p>` : ''),
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

/** "Resolución - Orden de Trabajo" (was html_ordenResuelta / mobile HtmlText1). Layout "Wash Inn". */
export function otResueltaEmail(ot: OTResueltaInput) {
  const meta = renderKeyValueList([
    ['Activo', ot.activo],
    ['Tipo de trabajo', ot.tipoTrabajo ?? 'No asignado'],
    ['Tipo de tarea', ot.tipoTarea ?? 'No asignado'],
    ['Días estimados', ot.diasEstimados == null ? '-' : String(ot.diasEstimados)],
    ['Días utilizados', String(ot.diasUtilizados)],
  ]);
  const repuestos = ot.repuestos.length
    ? renderSectionTitle('Repuestos utilizados') +
      renderEmailTable(
        ['Repuesto', 'Cantidad'],
        ot.repuestos.map((r) => [r.repuesto, String(r.cantidad)]),
        undefined,
        ['left', 'right'],
      )
    : `<p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Sin repuestos utilizados.</p>`;
  return {
    subject: `Resolución - Orden de Trabajo N° ${ot.nroOT}`,
    html: renderBrandedEmail({
      kicker: 'Mantenimiento',
      badge: 'Resuelta',
      title: `Orden de Trabajo N° ${ot.nroOT} resuelta`,
      introHtml: `Se resolvió la orden de trabajo del activo <strong>${escapeHtml(ot.activo)}</strong>.`,
      contentHtml: meta + repuestos,
      footerNote: `Resuelta por ${ot.tecnico}`,
    }),
  };
}
