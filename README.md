# TopRentals

Web app que reemplaza las dos Power Apps del negocio (back-office desktop + app mobile de técnicos) en una sola SPA React. Un solo login: el perfil `Tecnico` entra al módulo mobile-first (`/tecnico`), el resto al back-office (`/home`).

## Correr en desarrollo

```bash
npm install
npm run dev        # http://localhost:5173
```

No necesita backend: por defecto corre contra un adapter **mock** en memoria con datos de ejemplo realistas.

**Usuarios de prueba** (password `1234` para todos):

| Usuario | Perfil | Entra a |
|---|---|---|
| `admin` | Admin | Back-office completo (+ puede entrar a /tecnico) |
| `jperez` | Tecnico | Módulo técnico |

Otros perfiles en `services/mock/data.ts` (Operador, Recepcion, Compras, Gerencia, Supervisor Ventilaciones).

## Comandos

- `npm run dev` — dev server
- `npm run build` — typecheck + build de producción
- `npm run check` — checks ejecutables (asserts, sin framework)

## Backend

El backend **todavía no está definido** (SharePoint vs Supabase). La UI habla solo con `services/` y el adapter se elige con `VITE_DATA_BACKEND` (`mock` | `supabase`). Ver `env.example`.

- `supabase/` — schema Postgres relacional (21 tablas con FKs reales), seed y buckets, listos para cuando se cree el proyecto.
- `scripts/migrate/` — migración wipe-and-load SharePoint → Supabase vía Microsoft Graph (ver su README; correr `--dry-run` primero).

## Documentación

- `docs/DESIGN.md` — **Sumar UI Kit, regla máxima de la estética.** Leer antes de tocar UI.
- `docs/analysis/*.md` — spec funcional de cada pantalla original de Power Apps (layout, datos, reglas, bugs que NO se portaron).
- `docs/analysis/data_model.md` — mapeo columna a columna SharePoint → Postgres.
- `CLAUDE.md` — reglas del repo para agentes.

## Estructura

```
components/ui/        primitivos del kit (copiados literales de DESIGN.md)
components/<modulo>/  vistas por módulo (home, stock, ordenes, compras, …, tecnico)
services/             contrato DataApi + adapter mock (y supabase a futuro)
contexts/             AuthContext (sesión + permisos)
utils/                permissions, fechas es-AR, máscara de dinero, rate-limit
config/               feature flags (features muertas de PA) + íconos por módulo
emails/               templates transaccionales (envío stub hasta definir backend)
supabase/             schema.sql · seed.sql · storage-buckets.sql
scripts/migrate/      migración SharePoint → Supabase
```
