# sharepoint-write

Server-side Graph proxy for TopRentals (Fase 3): SharePoint write-back PLUS outbound
notification mail. Both go through Microsoft Graph with client-credentials auth — the
client secret can't live in the browser, so this runs as a Supabase Edge Function and the
app calls it via `supabase.functions.invoke('sharepoint-write', { body: { action, payload } })`.
Kept the function name `sharepoint-write` even though it now also sends mail, so the
existing deploy target doesn't change.

`verify_jwt` is left at its default (on) — only authenticated app users can invoke it.

## Deploy

```sh
supabase secrets set MS_TENANT_ID=... MS_CLIENT_ID=... MS_CLIENT_SECRET=... SP_SITE_URL=https://sumardigital.sharepoint.com/sites/TopRentals MAIL_SENDER=notificaciones@sumardigital.com.ar NOTIFICATIONS_BCC=a@x.com;b@y.com
supabase functions deploy sharepoint-write
```

`MAIL_SENDER` is required for `send-mail` (the mailbox Graph sends as — the app's
client-credentials grant needs `Mail.Send` on it). `NOTIFICATIONS_BCC` is optional,
`;` or `,` separated.

Same tenant/client/secret used by `scripts/migrate` — see `scripts/migrate/README.md` for
where to get them if they need rotating.

## Actions

- `articulo-upsert` — create or update a row in `99.ABM_Articulos`.
  `payload: { sp_id?: number, codigo, nombre, precio_unitario, corte, status, detalle }`.
  Omit `sp_id` to create; pass it to update. Returns `{ id }` (the SharePoint item id).
- `unidad-ventilacion` — patch the ventilación flags on a `99.ABM_TipoUnidades` row.
  `payload: { unidad_id, requiere_ventilacion, frecuencia_dias? }`. Returns `{ ok: true }`.
- `send-mail` — sends an HTML email via Graph `Mail.Send` from `MAIL_SENDER`, with
  `NOTIFICATIONS_BCC` (if set) bcc'd on every send.
  `payload: { to: string[], subject: string, html: string }`. Returns `{ ok: true }`.
  If `to` is empty and no `NOTIFICATIONS_BCC` is set, returns `{ ok: true }` without
  calling Graph.
