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
- **TopRentals**: los dashboards siguen el método de la skill `dataviz`. El **trabajo elige la forma**:
  - **Magnitud** (comparar valores, ej. días promedio de resolución) → **barra horizontal ordenada**,
    single hue navy. Nada de multi-tint `shade(i)` sobre categorías nominales (anti-patrón: double-encodea
    largo de barra como color).
  - **Part-to-whole** (share por edificio/torre/artículo) → **donut** (o barra apilada 100% en el hero)
    agrupado a **top-5 + "Otros"** (≤ 6 gajos), con una **paleta categórica jewel afinada al navy**
    — multi-hue *distinto* (ocean-blue / terracotta / emerald / amber / wine + slate "Otros"), que NO es
    el multi-tint `shade(i)` prohibido. Nota: los tonos "apagados" fallan el piso de chroma del validador
    (un daltónico no separa hues casi-grises), por eso son profundos-pero-ricos, no desaturados. Total al
    centro, % directos + leyenda (identidad nunca solo por color; releva el WARN de contraste),
    `paddingAngle` = gap de superficie. **Los promedios NO son part-to-whole** (no suman a un total) →
    barra, nunca torta. Cada gajo **desglosa al hover** (tooltip con sub-ítems, top 6 + "+N más…"); el gajo
    **"Otros"** revela los ítems que se plegaron (`foldTopN.members` → `DonutBase` en `DashboardView.tsx`),
    así el fold no esconde información.
  - **Cambio en el tiempo** → **línea** (una serie navy, crosshair al hover).
  - **Validar la paleta con `scripts/checks/validate_palette.js` antes de shipear** (vendoreado del skill
    `dataviz` para que el equipo pueda re-correrlo): `node scripts/checks/validate_palette.js "<hex,hex,…>" --mode light --surface "#ffffff"`.
    Los 5 hues del donut (`#215f9c,#cc5a2f,#12906c,#c78f1a,#9a487a`) pasan los gates duros en blanco
    (CVD adyacente ΔE 9.7, normal-vision 20.5; el amber queda en WARN de contraste, relevado por labels + leyenda).
- **Dónde vive el override**: `components/dashboard/DashboardView.tsx` — componentes `MagnitudeBar`
  (barras), `Donut` y `StackedShareBar` (part-to-whole), `TrendLine` + `Sparkline` (evolución) y `HeroCard`;
  más el delta mes-a-mes **neutro** (`deltaChip` en `utils/dashboardStats.ts`, flecha sin color). La regla está en
  `CLAUDE.md` (sección Diseño / UI).
- **Por qué**: convención de equipo — todos los dashboards se hacen con `dataviz`. El catálogo
  del kit precede a esa decisión; se mantiene el kit intacto y se pisa acá.

---

> Si aparece una divergencia nueva respecto del kit, se agrega como un bloque más en este
> archivo (misma estructura: kit → TopRentals → dónde → por qué), no editando `docs/DESIGN.md`.
