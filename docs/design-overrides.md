# TopRentals — Divergencias del Sumar UI Kit

`docs/DESIGN.md` es el **Sumar UI Kit canónico**, extraído de Kautapen Group y vendored
acá como **referencia read-only** (`docs/DESIGN.md:3`). No se edita: su valor es ser un
espejo exacto del kit del estudio, así una app nueva que lo siga se ve indistinguible.

Este archivo registra dónde **TopRentals se desvía a propósito** del kit. Regla general:
al crear o modificar UI, **DESIGN.md manda salvo lo listado acá**. Cada override abajo tiene
qué dice el kit, qué hace TopRentals, dónde vive el cambio real y por qué.

---

## 1. Color de marca — navy, no wine

- **Kit**: brand token = wine `#800020`; escala `WINE_SHADES` para series de charts
  (`docs/DESIGN.md:305`, `docs/DESIGN.md:310`).
- **TopRentals**: navy `#23313E` (`--brand: 208 27% 19%`). Es el ÚNICO color de marca.
- **Dónde vive el override**: `index.css` (token `--brand`) y `CLAUDE.md` (sección Diseño / UI).
  Sin sobrescritura del `.md` del kit — solo del token.
- **Por qué**: cada cliente cambia únicamente el color de marca; el kit lo prevé como el
  único parámetro por-cliente (`docs/DESIGN.md:305`).

## 2. Dashboards y charts — método `dataviz`, no el catálogo §10

- **Kit**: el catálogo de charts (§4.6 y §10 de `docs/DESIGN.md`) recomienda **donut/pie con
  label central** para proporciones (`docs/DESIGN.md:1771`) y colorear series con multi-tint
  `shade(i)` / `<Cell fill={shade(i)} />` (`docs/DESIGN.md:1768`).
- **TopRentals**: los dashboards siguen el método de la skill `dataviz`:
  - Barras horizontales **ordenadas de mayor a menor** para comparar magnitudes.
  - **Un solo hue de marca por serie** — nada de multi-tint `shade(i)` sobre categorías nominales
    (es un anti-patrón de dataviz: double-encodea largo de barra como color).
  - Labels de valor **directos**, grid hairline.
  - **Nunca pie/donut para comparar magnitudes** (usar barra); el pie queda solo para
    part-to-whole a golpe de vista, ≤ 6 segmentos.
  - Validar la paleta antes de shipear.
- **Dónde vive el override**: `components/dashboard/DashboardView.tsx` (componente `MagnitudeBar`)
  es el ejemplar; la regla está en `CLAUDE.md` (sección Diseño / UI).
- **Por qué**: convención de equipo — todos los dashboards se hacen con `dataviz`. El catálogo
  del kit precede a esa decisión; se mantiene el kit intacto y se pisa acá.

---

> Si aparece una divergencia nueva respecto del kit, se agrega como un bloque más en este
> archivo (misma estructura: kit → TopRentals → dónde → por qué), no editando `docs/DESIGN.md`.
