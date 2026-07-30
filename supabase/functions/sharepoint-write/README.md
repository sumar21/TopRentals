# sharepoint-write

Server-side SharePoint write-back for TopRentals (Fase 3). Writes go through Microsoft
Graph with client-credentials auth — the client secret can't live in the browser, so
this runs as a Supabase Edge Function and the app calls it via
`supabase.functions.invoke('sharepoint-write', { body: { action, payload } })`.

`verify_jwt` is left at its default (on) — only authenticated app users can invoke it.

## Deploy

```sh
supabase secrets set MS_TENANT_ID=... MS_CLIENT_ID=... MS_CLIENT_SECRET=... SP_SITE_URL=https://sumardigital.sharepoint.com/sites/TopRentals
supabase functions deploy sharepoint-write
```

Same tenant/client/secret used by `scripts/migrate` — see `scripts/migrate/README.md` for
where to get them if they need rotating.

## Actions

- `articulo-upsert` — create or update a row in `99.ABM_Articulos`.
  `payload: { sp_id?: number, codigo, nombre, precio_unitario, corte, status, detalle }`.
  Omit `sp_id` to create; pass it to update. Returns `{ id }` (the SharePoint item id).
- `unidad-ventilacion` — patch the ventilación flags on a `99.ABM_TipoUnidades` row.
  `payload: { unidad_id, requiere_ventilacion, frecuencia_dias? }`. Returns `{ ok: true }`.
