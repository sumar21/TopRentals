# TopRentals

Single React web app replacing two Power Apps (back-office desktop + mobile technicians). One login; routing by user profile: `Tecnico` → `/tecnico` (mobile-first module), everyone else → `/home` (back-office).

## Diseño / UI

Esta app usa el **Sumar UI Kit**, documentado en `docs/DESIGN.md`. Antes de crear o modificar
cualquier UI (componentes, modales, vistas, tablas, dashboards, emails):

- Leé `docs/DESIGN.md` y **reutilizá** los primitivos de `components/ui/` — no inventes variantes
  nuevas de Button/Card/Modal ni reimplementes dropdowns/selects.
- Respetá los tokens: `primary` (negro) y neutros son fijos; el color de marca vive en
  `--brand` (index.css). No hardcodees colores de marca fuera de ese token.
- Seguí las recetas de composición de `docs/DESIGN.md` (modal, página estándar, sidebar, dashboard).
- Cumplí las "Reglas de oro" (sección 15 de `docs/DESIGN.md`).

Brand color: navy `#23313E` (`--brand: 208 27% 19%`). Es el ÚNICO color de marca; se define solo en `index.css` (y en `BRAND.primary` de emails cuando exista envío real).

## Arquitectura

- **La UI habla SOLO con `services/`** (interfaces tipadas por dominio). El backend aún no está definido (SharePoint vs Supabase): el adapter se elige con `VITE_DATA_BACKEND` (`mock` | `supabase`). Nunca importes supabase-js ni fetch directo desde componentes.
- Permisos centralizados en `utils/permissions.ts` (matriz `canAccessModule`); items no permitidos NO se renderizan; ruta directa no permitida → redirect. El menú se alimenta de `perfiles_permisos`.
- Features construidas pero desactivadas (paridad con Power Apps) viven detrás de flags en `config/features.ts` — no borrar ni activar sin pedido explícito.
- Specs de cada pantalla original (layout, datos, reglas, bugs a NO portar): `docs/analysis/*.md`. El modelo de datos SP→PG columna a columna: `docs/analysis/data_model.md`.

## Reglas del dominio

- Toda mutación de stock escribe una fila de auditoría en `movimientos_stock` (append-only).
- Finalizar una ventilación auto-crea el registro del próximo ciclo (Pendiente, hoy + frecuencia de la unidad) — operación atómica.
- Estados de workflow: usar `StatusBadge` con el estado canónico del enum; prioridades con semántica corregida (Alta=rojo, Media=amber, Baja=slate) — NO portar la paleta invertida de Power Apps.
- Idioma de la UI: español (es-AR). Dinero con `MoneyInput`/`parseMoney` (máscara es-AR), fechas `dd/mm/yyyy`.

## Comandos

- `npm run dev` — dev server
- `npm run build` — typecheck + build (tiene que estar verde antes de dar algo por terminado)
