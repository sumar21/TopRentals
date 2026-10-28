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

## 3. Modo oscuro — implementado (el kit lo dejaba a medias)

- **Kit**: `darkMode: 'class'` está seteado pero **el dark mode nunca se activa** (no hay toggle ni
  bloque `.dark {}`); DESIGN.md §1.4 explícitamente dice "no lo dejes a medias — implementalo de verdad
  con un `.dark {}` en `index.css` + un toggle que haga `classList.toggle('dark')`".
- **TopRentals**: implementado tal cual lo pide el kit.
  - **Tokens**: `tailwind.config.js` pasó TODOS los semánticos (`card/popover/primary/secondary/muted/
    accent/destructive` + `-foreground`) a `hsl(var(--…))` — antes estaban hardcodeados en hex y no
    invertían. `index.css` define el set completo en `:root` (claro) y lo invierte en `.dark`;
    `primary` se vuelve blanco, `card/popover` quedan elevados sobre el fondo, y el navy de marca `--brand`
    se **aclara** — el `#23313E` se pierde sobre fondo oscuro.
  - **Paleta oscura por ELEVACIÓN (no zinc plano)**: la primera versión usaba zinc con `background` L=5%
    (casi negro puro) y `card` L=10% — solo 5 puntos de diferencia en la zona más oscura, donde el ojo casi
    no la percibe → las tarjetas se fundían con el fondo (feedback de producto: "no da el contraste"). Se
    reescribió a un **navy-charcoal escalonado** (hue ~216): `background` L=8%, `card` L=14% (+6 pts, se
    despega), `popover` L=16% (flota más alto), `border` L=24% (rim sutil). El tinte navy da cohesión con la
    marca y "más impacto", inspirado en dashboards dark modernos. Es UN cambio de tokens → se propaga a toda
    la app (mobile + desktop, back-office + técnico) sin tocar componentes.
  - **Mecanismo**: `contexts/ThemeContext.tsx` (persist en `localStorage['toprentals-theme']`, aplica la clase
    `dark` en `<html>`); un script anti-flash en `index.html` la aplica ANTES del primer paint (sin destello).
  - **Toggle**: ícono luna/sol arriba de "Cerrar sesión" en la sidebar (back-office `Layout.tsx` desktop +
    drawer mobile, y `LayoutTecnico.tsx`).
  - **Charts** (`DashboardView.tsx`): recharts pinta `fill`/`stroke` como ATRIBUTOS SVG donde `var(--x)` NO
    resuelve → los colores van por el hook `useChartColors()` (navy aclarado, grid/labels invertidos,
    superficie de card oscura para gaps del pie / anillo de dots / fondo de tooltip). Los `DONUT_HUES` jewel
    se mantienen (categóricos, funcionan en ambos temas).
  - **Decisión**: los pills de estado de color (`bg-emerald-100 text-emerald-700`, etc. en `StatusBadge`/
    `CategoriaBadge`) se dejan como chips claros sobre fondo oscuro — son legibles y conservan identidad de
    color; sólo los chips NEUTROS pasaron a `bg-muted text-muted-foreground`. Las superficies tintadas de
    alertas/toasts/hover llevan variante `dark:` explícita.
- **Dónde vive**: `tailwind.config.js`, `index.css` (`:root` + `.dark`), `index.html` (anti-flash),
  `contexts/ThemeContext.tsx`, `components/Layout.tsx` + `components/LayoutTecnico.tsx` (toggle),
  `components/dashboard/DashboardView.tsx` (`useChartColors`).
- **Por qué**: pedido de producto (paridad con apps modernas); el kit ya bendecía el approach (§1.4).

## 4. Rampa roja→verde por valor en "Tiempo de resolución General por torre" (2026-08)

- **Kit / regla de equipo**: `dataviz` (y la sección 2 de este archivo) manda **un solo hue de
  marca por serie** en las barras de magnitud — nada de multi-tint `shade(i)` sobre categorías
  nominales, porque eso double-encodea el largo de la barra como color sin agregar información.
- **TopRentals**: el chart "Tiempo de resolución General por torre" (`components/dashboard/DashboardView.tsx`,
  `MagnitudeBar` con la prop opcional `barColor`) pinta cada barra con una rampa roja→verde por
  VALOR (no por categoría): rojo = peor (más días), verde = mejor (menos días), interpolando
  hue HSL 0→140 según `(row.b - min) / (max - min)`. Esto no es el multi-tint prohibido — no hay
  una barra por serie con un hue fijo arbitrario; es una rampa continua que codifica la magnitud
  misma, redundante con el orden (el chart ya está ordenado desc por `b`) y con los labels de
  valor directos (`<LabelList>`) que quedan intactos. La identidad de cada torre nunca depende
  del color solo — está en el eje Y y en el label numérico, así que el mapeo es
  CVD-mitigado por diseño (doble codificación: posición + valor explícito, no solo hue).
- **Dónde vive el override**: `resolucionRampFill` + la prop `barColor` de `MagnitudeBar` en
  `components/dashboard/DashboardView.tsx`; usado solo en ese chart (el resto de `MagnitudeBar`
  sigue con el hue único de marca).
- **Por qué**: decisión de producto (2026-08) — "Tiempo de resolución" es una métrica de
  performance (bueno/malo), y el semáforo rojo/verde comunica eso de un vistazo mejor que el
  navy plano, sin perder la barra ordenada ni los labels que ya evitaban la torta.

---

> Si aparece una divergencia nueva respecto del kit, se agrega como un bloque más en este
> archivo (misma estructura: kit → TopRentals → dónde → por qué), no editando `docs/DESIGN.md`.
