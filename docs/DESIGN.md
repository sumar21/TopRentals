# Sumar UI Kit

Kit de interfaz canónico del estudio, extraído de **Kautapen Group**. Este documento es **prescriptivo**: contiene el código listo para pegar de cada componente, los tokens exactos y las recetas de composición. Una app nueva que siga este archivo debe verse indistinguible de Kautapen, cambiando únicamente el color de marca del cliente.

> **Para agentes / devs**: cuando trabajes en un repo que referencie este archivo desde su `CLAUDE.md`, usá **estos** componentes y **estas** clases Tailwind literales. No inventes variantes nuevas de Button/Card/Modal ni reimplementes dropdowns: copiá el primitivo de acá. Si algo no está cubierto, componelo con los primitivos existentes respetando los tokens (colores, radios, spacing) de la sección 1.

Este documento es **autocontenido**: todo el código necesario está pegado acá, no depende de tener el repo de Kautapen a mano.

---

## 0. Arranque de un repo nuevo

Pasos para levantar un repo desde cero con este kit. Al terminar, cualquier vista que desarrolles hereda la estética.

### 0.1 Checklist

1. **Crear el proyecto** (Vite + React + TS): `npm create vite@latest mi-app -- --template react-ts`
2. **Instalar dependencias** (sección 1.1): `npm i lucide-react clsx tailwind-merge react-router-dom` + `npm i -D tailwindcss@3 tailwindcss-animate postcss autoprefixer` (agregá `recharts` y `xlsx` solo si vas a tener dashboards / export).
3. **Copiar los 3 archivos de config**: `tailwind.config.js` (1.2), `postcss.config.js` (0.2), `index.html` (0.3).
4. **Copiar `index.css`** (1.3) — trae los tokens de color y las animaciones.
5. **Copiar `components/ui/`** completo (todos los primitivos de la sección 3) y `utils/formatMoneyInput.ts`.
6. **Cablear los providers** en `App.tsx` / `index.tsx` (0.4) y montar `<TooltipHost />` en tu layout.
7. **Definir el color de marca** del cliente: editar `--brand` en `index.css` (1.5). Listo.
8. **Referenciar este doc** desde el `CLAUDE.md` del repo (0.5).

### 0.2 `postcss.config.js`

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

### 0.3 `index.html`

La fuente del kit es **Inter** (Google Fonts) — no la del sistema. El scrollbar es fino y custom.

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Mi App</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    body { font-family: 'Inter', sans-serif; background-color: hsl(var(--background)); color: hsl(var(--foreground)); }
    /* Scrollbar fino */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #e4e4e7; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #a1a1aa; }
  </style>
</head>
<body class="bg-background text-foreground antialiased overflow-hidden selection:bg-stone-200 selection:text-stone-900">
  <div id="root"></div>
  <script type="module" src="/index.tsx"></script>
</body>
</html>
```

### 0.4 Cableado de arranque

`index.tsx` (entry point):

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
```

`App.tsx` — el orden importa: router afuera, `ToastProvider` envolviendo las rutas, `TooltipHost` dentro del layout (una sola vez). Los providers de dominio (auth, datos) son propios de cada app; acá va el mínimo del kit:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/ui/Toast';
import Layout from './components/Layout';        // monta <TooltipHost /> adentro

const App = () => (
  <BrowserRouter>
    {/* ...tus providers de dominio (UserProvider, DataProvider, etc.) por afuera de ToastProvider... */}
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Layout />}>
          <Route path="/home" element={<HomeView />} />
          {/* ...resto de rutas... */}
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>
      </Routes>
    </ToastProvider>
  </BrowserRouter>
);
export default App;
```

Gating de rutas por rol: envolver el `element` en un wrapper que consulta `canAccessModule` (sección 14) y hace `<Navigate to="/home" replace />` si no tiene acceso.

### 0.5 Estructura de carpetas

```
mi-app/
├─ index.html            # 0.3 (con Inter)
├─ index.tsx             # entry point (0.4)
├─ App.tsx               # router + providers (0.4)
├─ index.css             # tokens + animaciones (1.3)
├─ tailwind.config.js    # 1.2
├─ postcss.config.js     # 0.2
├─ components/
│  ├─ ui/                # TODOS los primitivos de la sección 3 (copiar entero)
│  │  ├─ UIComponents.tsx        # cn, useModalAnimation, Card, Button, Input, Badge, Table, Avatar, Tabs, StatCard, Combobox, MultiCombobox
│  │  ├─ backdropClose.ts · Select.tsx · MoneyInput.tsx · StatusBadge.tsx
│  │  ├─ Loader.tsx · Toast.tsx · Tooltip.tsx · SuccessCard.tsx · CategoryMultiSelect.tsx
│  ├─ dashboard/         # solo si hay analítica: shared.tsx (KpiCard, paleta, helpers)
│  ├─ Layout.tsx · ConfirmModal.tsx · HomeDetailDrawer.tsx · [tus vistas y modales]
├─ contexts/             # providers de dominio (propios de la app)
├─ services/             # llamadas a API/backend (propios de la app)
├─ utils/                # formatMoneyInput.ts, permissions.ts, ...
└─ server/utils/         # solo si envía emails: emailTemplate.ts, logoAttachment.ts (sección 13)
```

### 0.6 Snippet para el `CLAUDE.md` del repo nuevo

Pegá esto en el `CLAUDE.md` para que los agentes sigan el kit:

```md
## Diseño / UI

Esta app usa el **Sumar UI Kit**, documentado en `./DESIGN.md`. Antes de crear o modificar
cualquier UI (componentes, modales, vistas, tablas, dashboards, emails):

- Leé `DESIGN.md` y **reutilizá** los primitivos de `components/ui/` — no inventes variantes
  nuevas de Button/Card/Modal ni reimplementes dropdowns/selects.
- Respetá los tokens: `primary` (negro) y neutros son fijos; el color de marca vive en
  `--brand` (index.css). No hardcodees colores de marca fuera de ese token.
- Seguí las recetas de composición de `DESIGN.md` (modal, página estándar, sidebar, dashboard).
- Cumplí las "Reglas de oro" (sección 15 de `DESIGN.md`).
```

---

## Índice

0. [Arranque de un repo nuevo (bootstrap)](#0-arranque-de-un-repo-nuevo)
1. [Fundaciones (setup, tokens, color de marca)](#1-fundaciones)
2. [Utilidades base (`cn`, `useModalAnimation`, `backdropClose`)](#2-utilidades-base)
3. [Primitivos](#3-primitivos) — Button, Card, Input, Badge, Table, Avatar, Tabs, StatCard, Select, MoneyInput, StatusBadge, Loader, Toast, Tooltip, SuccessCard, Combobox, MultiCombobox, CategoryMultiSelect
4. [Recetas de composición](#4-recetas-de-composición) — Modal, Confirmación, Drawer, Página, Sidebar, Dashboard, Filtros
5. [Mobile / Responsive](#5-mobile--responsive) — breakpoints, toolbar, grids, tabla→cards, modales, bottom-sheet, action bar, drawer mobile, touch/safe-areas
6. [Formularios y edición](#6-formularios-y-edición) — labels, validación, textarea, checkbox, stepper, password, upload, line-items, inline edit
7. [Datos, tablas y listas](#7-datos-tablas-y-listas) — celdas, totales, paginación, sort, row actions, selección masiva, grid views + XLSX, KPIs
8. [Overlays, capas (z-index) y navegación](#8-overlays-capas-z-index-y-navegación) — familias, escala z, variantes de modal, popover, sidebar, tabs, nav guard
9. [Feedback, estados y motion](#9-feedback-estados-y-motion) — loading, progreso, empty, banners, disabled, animaciones, keyframes
10. [Dashboard — catálogo de charts](#10-dashboard--catálogo-de-charts) — stacked-sign, composed, line, radar, leyendas, gradientes
11. [Widgets de dominio](#11-widgets-de-dominio) — tipo de cambio, reconciliación, carrito/checkout
12. [Auth (login / reset)](#12-auth-login--reset-de-contraseña)
13. [Emails transaccionales](#13-emails-transaccionales)
14. [Control de acceso por rol](#14-control-de-acceso-por-rol)
15. [Reglas de oro](#15-reglas-de-oro)

---

## 1. Fundaciones

### 1.1 Stack y dependencias

```jsonc
// package.json — dependencias del kit
{
  "dependencies": {
    "react": "^19",
    "react-dom": "^19",
    "react-router-dom": "^7",
    "lucide-react": "^0.5",      // set de íconos ÚNICO del kit — no mezclar otros
    "clsx": "^2",
    "tailwind-merge": "^2",
    "recharts": "^3",            // solo si la app tiene dashboards/charts
    "xlsx": "^0.18"              // solo si la app exporta a Excel
  },
  "devDependencies": {
    "tailwindcss": "^3.4",
    "tailwindcss-animate": "^1",  // REQUERIDO: habilita animate-in / fade-in / zoom-in / slide-in
    "autoprefixer": "^10",
    "postcss": "^8"
  }
}
```

### 1.2 `tailwind.config.js`

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html', './index.tsx', './App.tsx',
    './components/**/*.{ts,tsx}', './contexts/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}', './config/**/*.{ts,tsx}', './utils/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        // Neutros — driven por CSS vars (definidas en index.css). NO cambian por cliente.
        // El sufijo `/ <alpha-value>` es OBLIGATORIO para que funcionen los modificadores
        // de opacidad (bg-background/50, border-border/50, ring-ring/20, etc.).
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        // primary = negro casi puro. Botones, nav activo, focus, controles. Fijo (parte del "blanco y negro por defecto").
        primary: { DEFAULT: "#1a1a1a", foreground: "#fafafa" },
        // brand = EL COLOR DEL CLIENTE. Único token que se reemplaza por empresa (ver 1.4).
        // Con `/ <alpha-value>` funcionan bg-brand/10, border-brand/20, bg-brand/[0.03], etc.
        brand: { DEFAULT: "hsl(var(--brand) / <alpha-value>)", foreground: "hsl(var(--brand-foreground) / <alpha-value>)" },
        // Neutros y semánticos fijos:
        secondary: { DEFAULT: "#f4f4f5", foreground: "#18181b" },
        destructive: { DEFAULT: "#ef4444", foreground: "#fafafa" },
        muted: { DEFAULT: "#f4f4f5", foreground: "#71717a" },
        accent: { DEFAULT: "#f4f4f5", foreground: "#18181b" },
        popover: { DEFAULT: "#ffffff", foreground: "#09090b" },
        card: { DEFAULT: "#ffffff", foreground: "#09090b" },
      },
      borderRadius: { lg: "0.5rem", md: "calc(0.5rem - 2px)", sm: "calc(0.5rem - 4px)" },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
```

> **Diferencia importante vs. el Kautapen actual** (que este kit corrige): en Kautapen `plugins: []` está vacío, así que las clases `animate-in`/`fade-in`/`zoom-in-95`/`slide-in-from-*` que usan casi todos los componentes **no producen ningún efecto**. El kit **exige** `tailwindcss-animate` para que esas animaciones funcionen de verdad. Además, Kautapen usa `hsl(var(--border))` etc. pero nunca define esas variables — el kit **exige** definirlas en `index.css` (abajo).

### 1.3 `index.css` (completo — copiar tal cual)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  /* Neutros (fijos) */
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --border: 240 6% 90%;
  --input: 240 6% 90%;
  --ring: 240 5% 65%;

  /* ── COLOR DE MARCA DEL CLIENTE ──────────────────────────────────
     Único bloque a reemplazar por empresa. Kautapen = bordó #800020.
     Usá EL MISMO valor acá y en el backend de emails (sección 13). */
  --brand: 345 100% 25%;          /* #800020 */
  --brand-foreground: 0 0% 100%;
}

/* Clamp del documento al ancho del viewport: sin esto, un elemento que
   desborda horizontal en mobile hace que un backdrop `fixed inset-0` no
   cubra todo el ancho (queda una franja blanca a la derecha). */
html { overflow-x: hidden; }
/* Reservar el gutter del scrollbar SOLO en desktop, para que alternar entre
   una vista corta y una alta no desplace el layout. En mobile el scrollbar es
   overlay y `scrollbar-gutter: stable` dejaría una franja fantasma que el
   backdrop no puede cubrir. */
@media (min-width: 768px) { html { scrollbar-gutter: stable; } }
body { margin: 0; padding: 0; overflow-x: hidden; max-width: 100vw; }

/* ── Animaciones de modal/overlay (las usa useModalAnimation) ── */
@keyframes detail-panel-in  { from { transform: translateX(24px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes detail-panel-out { from { transform: translateX(0); opacity: 1; } to { transform: translateX(24px); opacity: 0; } }
@keyframes overlay-fade-in  { from { opacity: 0; } to { opacity: 1; } }
@keyframes overlay-fade-out { from { opacity: 1; } to { opacity: 0; } }
.modal-enter   { animation: detail-panel-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.modal-exit    { animation: detail-panel-out 180ms ease-in forwards; pointer-events: none; }
.overlay-enter { animation: overlay-fade-in 200ms ease-out both; }
.overlay-exit  { animation: overlay-fade-out 200ms ease-in forwards; pointer-events: none; }

/* ── Drawer lateral derecho (paneles de detalle) ── */
@keyframes drawer-in-right  { from { transform: translateX(100%); } to { transform: translateX(0); } }
@keyframes drawer-out-right { from { transform: translateX(0); } to { transform: translateX(100%); } }
.drawer-enter-right { animation: drawer-in-right 260ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.drawer-exit-right  { animation: drawer-out-right 200ms ease-in forwards; pointer-events: none; }

/* ── Drawer lateral izquierdo (navegación mobile) ── */
@keyframes drawer-in-left  { from { transform: translateX(-100%); } to { transform: translateX(0); } }
@keyframes drawer-out-left { from { transform: translateX(0); } to { transform: translateX(-100%); } }
.drawer-enter-left { animation: drawer-in-left 260ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.drawer-exit-left  { animation: drawer-out-left 200ms ease-in forwards; pointer-events: none; }

/* ── Tooltip global (data-tooltip) — ver Tooltip.tsx ── */
@keyframes tooltip-in { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: translateY(0); } }
.kaut-tooltip { animation: tooltip-in 120ms ease-out both; }
```

### 1.4 Tokens de diseño

#### Color — marca, primary y semánticos

| Token | Valor | Uso |
|---|---|---|
| `primary` | `#1a1a1a` / fg `#fafafa` | Botones default, nav activo, focus rings, controles. **Fijo** (el "negro por defecto"). |
| `brand` | `hsl(var(--brand))` = `#800020` | Logo, acentos de dashboard, KPI destacado, filtros/tabs activos, charts, línea/badge/total de emails. **Único token que cambia por cliente.** |
| `destructive` | `#ef4444` | Borrar, logout, valores negativos fuertes. |
| `secondary`/`muted`/`accent` | `#f4f4f5` (fg `#71717a` en muted) | Superficies sutiles, hovers, chips. |
| `card`/`popover` | `#ffffff` | Tarjetas, dropdowns. |

**Escala de tints de marca** (para charts — `WINE_SHADES`): `#800020 · #9b2740 · #b34a5e · #c66e7f · #d8939f · #e8b9c0 · #f0d2d7`. Usar `shade(i)` para colorear series. `#d8939f` es el "segundo color" recurrente (donuts, ratios).

**Paleta semántica completa** (patrón badge = `bg-{c}-50/100` + `text-{c}-600/700/800`; banner = `bg-{c}-50 border-{c}-200 text-{c}-700`):

| Rol | Color | Shades usadas |
|---|---|---|
| **success / positivo** | `emerald` (evitar `green`, es duplicado) | 50/100/200/500/600/700 |
| **warning / pendiente** | `amber` | 50/100/200/400/500/600/700 |
| **error / negativo** | `red` (+ `destructive`) | 50/100/200/500/600/700 |
| **info** | `blue` | 50/100/200/600/700/800 |
| **info secundario** ("off season") | `sky` | 50/100/600/700 |
| **en proceso** | `indigo` | 100/700 |
| **despachado** | `violet` | 100/700 |
| **neutro / cerrado** | `slate` | 100/200/600 |
| superficies de modal legacy | `zinc` | 50/200/800/900 |

> El mapa canónico estado→color está en `StatusBadge` (3.11). Recharts tiene su **propia** paleta de hex (`#52525b` tick X, `#94a3b8` tick Y, `#eef0f2` grid, `#cbd5e1` referencia) — son "data-viz tokens", no mezclar con la UI.

#### Superficies (jerarquía de fondos)

`bg-background` (lienzo base) → área de contenido `bg-secondary/30` → `bg-card` (tarjetas, blanco) → `bg-muted/20` (superficie sutil, la más usada) / `bg-muted/50` (hover, zebra) → `bg-popover` (dropdowns) → `bg-primary/5` (tinte enfático sutil). Backdrop de modal: **`bg-black/60`**. Evitá `bg-white`/`bg-zinc-*` crudos (legacy) — usá los tokens.

#### Tipografía (Inter)

| Token | Uso |
|---|---|
| `text-2xl font-bold tracking-tight` | Título de página, métricas grandes / KPI |
| `text-lg`/`text-xl font-bold` | Título de modal / sección |
| `text-base` | Énfasis de cuerpo |
| `text-sm` | **Cuerpo base de la app** |
| `text-[13px]` | Tabla (intermedio sm/base) |
| `text-xs` | Cuerpo secundario, labels |
| `text-[11px]` / `text-[10px]` | **Micro-tipografía** (headers de tabla, badges, captions) — parte del sistema, no evitar |
| `text-[9px]` / `text-[8px]` | Micro-badges puntuales |

Pesos: `font-medium` (default énfasis), `font-semibold` (labels/headers), `font-bold` (valores). Sin light/thin. **Números**: `tabular-nums` (dinero/cantidades alineadas) y `font-mono` (montos en grids/totales). **Micro-labels**: `text-[10px]/[11px] uppercase tracking-wider text-muted-foreground`. `tracking-tight` en métricas grandes.

#### Íconos (lucide) — tamaños por contexto

| Tamaño | Contexto |
|---|---|
| `h-4 w-4` | **Default** — botones, inputs, inline con `text-sm` |
| `h-3.5 w-3.5` | En `text-xs`, badges, chips, toolbars |
| `h-3 w-3` | Micro (con `text-[10px]/[11px]`), indicadores |
| `h-5 w-5` | Títulos de sección, headers |
| `h-8/9/10 w-*` | Contenedor `rounded-lg bg-{color}/10` de un ícono (tile) |
| `h-2/2.5 w-*` | Dots / puntos de leyenda |

Convención de "tile de ícono": `h-8 w-8` (o `h-9`/`h-10`) `rounded-lg` con `bg-brand/10` + ícono `text-brand`, o `bg-{semantic}-100` + `text-{semantic}-600`.

#### Spacing (escala implícita: 1 · 1.5 · 2 · 3 · 4 · 6)

Más usados: `gap-2` (default), `gap-3`, `gap-1.5`; `p-4` (cards), `p-3` (compacto), `p-6` (headers de modal/card); `px-3 py-2` (par canónico de controles); `px-2 py-0.5` (badges/pills); `space-y-2`/`space-y-4` (stacks). Preferir `gap` sobre `space-x`.

#### Radios

`rounded-md` (default de controles: botones, inputs, selects) · `rounded-lg` (cards, tiles) · `rounded-xl` (cards grandes, modales) · `rounded-2xl` (SuccessCard, bottom-sheet `rounded-t-2xl`) · `rounded-full` (pills, badges, avatares, dots) · `rounded-sm` (tabs, items de dropdown). Evitá `rounded` pelado (legacy, no deriva de `--radius`).

#### Sombras

| Token | Uso |
|---|---|
| `shadow-sm` | Cards de contenido, inputs, elevación base |
| `shadow-md` | Hover de cards, dropdowns/popovers |
| `shadow-lg` | Toasts, tooltips |
| `shadow-2xl` | Modales, drawers (elevación máxima) |
| `shadow-[0_-8px_30px_rgba(0,0,0,0.12)]` | **Barra de acción fija inferior** (sombra hacia arriba) |
| `shadow-[0_0_15px_rgba(0,0,0,0.05)]` | Glow suave (panel de resumen de checkout) |

#### Bordes y opacidades

- Bordes: `border` (1px default), `border-input` (inputs), `border-border` (divisores), `border-2 border-dashed` (dropzones/empty), `border-l-4` (acento de alerta), `border-t-2` (total de tabla). `divide-x`/`divide-y` casi no se usan (preferir bordes explícitos).
- Opacidades canónicas sobre color: `/5` `/10` (tiles, tintes sutiles), `/20` `/30` (bordes, superficies), `/40` `/50` (hovers, muted), `/60` (backdrop `bg-black/60`), `/90` (hover de sólidos). Focus rings de marca: `ring-primary/40`, `ring-primary/20`.

#### Focus states

Convención shadcn (heredada por Button/Input/Badge/Tabs): `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` (+ `ring-offset-background`). Controles custom (Select/Combobox): `focus:ring-2 focus:ring-primary/40`, estado abierto `border-primary/50 ring-2 ring-primary/20`.

#### z-index

Ver la escala saneada en **8.2**. Regla corta: nav `z-20` → drawers/overlays `z-50` → modal `z-[60]` → confirm/toasts/tooltip por encima. No inventar valores; no usar los `z-[9999]`/`999999` del código legacy.

#### Dark mode

El config trae `darkMode: 'class'` pero **el dark mode nunca se activa** en el código (no hay toggle ni `.dark {}`). Hay ~22 clases `dark:` sueltas que no hacen nada. **Decisión para tu repo**: (a) implementarlo de verdad — agregá un bloque `.dark { --background: …; --foreground: …; --brand: …; }` en `index.css` y un toggle que ponga `document.documentElement.classList.toggle('dark')` — o (b) borrá las clases `dark:` sueltas para no dejar código muerto. No lo dejes a medias como está en Kautapen.

### 1.5 Cómo cambiar el color de marca por cliente

Reemplazá **un solo lugar** en `index.css`:

```css
:root {
  --brand: 210 90% 45%;          /* ej. azul del cliente X */
  --brand-foreground: 0 0% 100%;
}
```

Y en los dashboards, reemplazá la constante `WINE` de `components/dashboard/shared.tsx` (ver sección 10) por el mismo color, y en el backend de emails la constante `BRAND.primary` (sección 13). Esos son los **tres únicos lugares** con el color de marca. Los neutros (blanco/negro/grises) y `primary` no se tocan.

---

## 2. Utilidades base

Todo vive en `components/ui/UIComponents.tsx`.

```tsx
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useState, useEffect } from 'react';

/** Combina clases Tailwind resolviendo conflictos. Usar en TODO componente. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const MODAL_DURATION = 200;

/**
 * Mantiene un modal montado durante su animación de salida. Devuelve:
 *   visible      → si renderizar el modal (sigue true durante la salida)
 *   overlayClass → 'overlay-enter' | 'overlay-exit'
 *   modalClass   → 'modal-enter'   | 'modal-exit'
 * Emparejar con las reglas CSS de index.css.
 */
export function useModalAnimation(isOpen: boolean) {
  const [visible, setVisible] = useState(isOpen);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (isOpen) { setVisible(true); setClosing(false); }
    else if (visible) {
      setClosing(true);
      const t = setTimeout(() => { setVisible(false); setClosing(false); }, MODAL_DURATION);
      return () => clearTimeout(t);
    }
  }, [isOpen]);
  return {
    visible,
    overlayClass: closing ? 'overlay-exit' : 'overlay-enter',
    modalClass:   closing ? 'modal-exit'   : 'modal-enter',
  };
}
```

`components/ui/backdropClose.ts` — cierre de modal a prueba de arrastre (usar en el `<div>` overlay de todo modal):

```ts
import type { MouseEvent } from 'react';

/**
 * Cierra SOLO si el mousedown Y el click caen sobre el overlay mismo, para que
 * una selección de texto que arranca dentro del modal y suelta sobre el fondo
 * no lo cierre. Es una FUNCIÓN, no un hook, así se puede usar dentro de JSX
 * condicional sin violar las reglas de hooks.
 * Uso: <div className="fixed inset-0 …" {...backdropClose(onClose)}> … </div>
 */
export function backdropClose(onClose: () => void) {
  let pressedOnBackdrop = false;
  return {
    onMouseDown: (e: MouseEvent) => { pressedOnBackdrop = e.target === e.currentTarget; },
    onClick: (e: MouseEvent) => {
      if (pressedOnBackdrop && e.target === e.currentTarget) onClose();
      pressedOnBackdrop = false;
    },
  };
}
```

---

## 3. Primitivos

> Todos en `components/ui/UIComponents.tsx` salvo los que indican su propio archivo. Código literal — copiar tal cual.

### 3.1 Card

```tsx
export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} {...props} />
));
export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
));
export const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
));
export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
));
```

### 3.2 Button

Variants: `default | destructive | outline | secondary | ghost | link`. Sizes: `default | sm | lg | icon`.

```tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = "default", size = "default", ...props }, ref) => {
  const variants = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    link: "text-primary underline-offset-4 hover:underline",
  };
  const sizes = { default: "h-10 px-4 py-2", sm: "h-9 rounded-md px-3", lg: "h-11 rounded-md px-8", icon: "h-10 w-10" };
  return (
    <button ref={ref}
      className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        variants[variant], sizes[size], className)}
      {...props} />
  );
});
```

Uso con loading: `<Button disabled={saving} className="gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}Guardar</Button>`

### 3.3 Input

```tsx
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type, ...props }, ref) => (
  <input type={type} ref={ref}
    className={cn("flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50", className)}
    {...props} />
));
```

**Input con ícono** (patrón estándar de búsqueda):
```tsx
<div className="relative flex-1 sm:w-56 sm:flex-none min-w-[7rem]">
  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
  <Input placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} className="pl-8 h-9 text-sm" />
</div>
```

**Label de campo** (siempre así arriba del control): `<label className="text-xs font-medium text-muted-foreground mb-1 block">Nombre</label>`

### 3.4 Badge

```tsx
export const Badge = ({ className, variant = "default", ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "secondary" | "destructive" | "outline" | "success" }) => {
  const variants = {
    default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
    secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
    destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
    outline: "text-foreground",
    success: "border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-200",
  };
  return <div className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2", variants[variant], className)} {...props} />;
};
```

### 3.5 Table

```tsx
export const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto"><table ref={ref} className={cn("w-full caption-bottom text-[13px]", className)} {...props} /></div>
));
export const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
));
export const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
));
export const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(({ className, ...props }, ref) => (
  <tr ref={ref} className={cn("border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted", className)} {...props} />
));
export const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(({ className, ...props }, ref) => (
  <th ref={ref} className={cn("h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0", className)} {...props} />
));
export const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)} {...props} />
));
```
Envolver siempre en un contenedor: `<Card className="hidden md:block border shadow-sm"><Table>…</Table></Card>` (ver receta de página, 4.4). Sin zebra striping. Para ocultar columnas secundarias en mobile: `<TableHead className="hidden lg:table-cell">`.

### 3.6 Avatar

```tsx
export const Avatar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)} {...props} />
));
export const AvatarFallback = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex h-full w-full items-center justify-center rounded-full bg-muted", className)} {...props} />
));
// Uso: <Avatar><AvatarFallback className="bg-brand/10 text-brand">{inicial}</AvatarFallback></Avatar>
```

### 3.7 Tabs

Implementación con Context (sin Radix). API: `<Tabs value|defaultValue onValueChange><TabsList><TabsTrigger value><TabsContent value>`.

```tsx
const TabsContext = React.createContext<{ activeTab: string; setActiveTab: (v: string) => void } | null>(null);

export const Tabs = ({ className, children, defaultValue, value, onValueChange }: any) => {
  const [internalTab, setInternalTab] = React.useState(defaultValue);
  const activeTab = value !== undefined ? value : internalTab;
  const handleTabChange = (v: string) => { if (value === undefined) setInternalTab(v); onValueChange?.(v); };
  return <TabsContext.Provider value={{ activeTab, setActiveTab: handleTabChange }}><div className={cn("", className)}>{children}</div></TabsContext.Provider>;
};
export const TabsList = ({ className, children }: any) => (
  <div className={cn("inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground", className)}>{children}</div>
);
export const TabsTrigger = ({ className, value, children }: any) => {
  const ctx = React.useContext(TabsContext); if (!ctx) return null;
  return (
    <button data-state={ctx.activeTab === value ? "active" : "inactive"} onClick={() => ctx.setActiveTab(value)}
      className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        ctx.activeTab === value ? "bg-background text-foreground shadow-sm" : "hover:bg-background/50 hover:text-foreground", className)}>
      {children}
    </button>
  );
};
export const TabsContent = ({ className, value, children }: any) => {
  const ctx = React.useContext(TabsContext); if (!ctx || value !== ctx.activeTab) return null;
  return <div className={cn("mt-2 ring-offset-background animate-in fade-in slide-in-from-bottom-2", className)}>{children}</div>;
};
```

### 3.8 StatCard

```tsx
export const StatCard: React.FC<{ title: string; value: string; icon: LucideIcon; subtext?: string; trend?: 'up' | 'down' }> = ({ title, value, icon: Icon, subtext, trend }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
      {subtext && <p className={cn("text-xs mt-1", trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-500' : 'text-muted-foreground')}>{subtext}</p>}
    </CardContent>
  </Card>
);
```
> Para dashboards preferir `KpiCard` (sección 4.6), más completa. `StatCard` es la versión mínima.

### 3.9 Select — `components/ui/Select.tsx`

Reemplazo de `<select>` nativo: dropdown portaled, con flip vertical si no entra abajo, y check en la opción activa.

```tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from './UIComponents';

interface SelectOption { value: string; label: string; }
interface SelectProps {
  value: string; onChange: (value: string) => void; options: SelectOption[];
  placeholder?: string; className?: string; disabled?: boolean;
}

export const Select: React.FC<SelectProps> = ({ value, onChange, options, placeholder = 'Select...', className, disabled = false }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

  const getCoords = useCallback(() => {
    if (!triggerRef.current) return { top: 0, left: 0, width: 0 };
    const rect = triggerRef.current.getBoundingClientRect();
    const dropdownHeight = Math.min(options.length * 36 + 8, 240);
    let top = rect.bottom + window.scrollY + 4;
    if (rect.bottom + dropdownHeight > window.innerHeight && rect.top - dropdownHeight > 0) {
      top = rect.top + window.scrollY - dropdownHeight - 4;
    }
    return { top, left: rect.left + window.scrollX, width: rect.width };
  }, [options.length]);

  const updatePosition = useCallback(() => setCoords(getCoords()), [getCoords]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => { window.removeEventListener('scroll', updatePosition, true); window.removeEventListener('resize', updatePosition); };
  }, [open, updatePosition]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current && !containerRef.current.contains(t) && popupRef.current && !popupRef.current.contains(t)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const selectedLabel = options.find(o => o.value === value)?.label;

  const dropdown = open ? createPortal(
    <div ref={popupRef} style={{ position: 'absolute', top: coords.top, left: coords.left, width: coords.width, zIndex: 999999 }}
      className="bg-popover text-popover-foreground border rounded-md shadow-md overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="p-1 max-h-60 overflow-y-auto">
        {options.map(option => (
          <button key={option.value} type="button" onClick={() => { onChange(option.value); setOpen(false); }}
            className={cn('w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-sm transition-colors cursor-default',
              option.value === value ? 'bg-accent text-accent-foreground font-medium' : 'hover:bg-accent hover:text-accent-foreground')}>
            <span>{option.label}</span>
            {option.value === value && <Check className="h-4 w-4 shrink-0" />}
          </button>
        ))}
      </div>
    </div>, document.body) : null;

  return (
    <div className="relative w-full" ref={containerRef}>
      <button ref={triggerRef} type="button" disabled={disabled}
        onClick={() => { if (!open) { setCoords(getCoords()); setOpen(true); } else setOpen(false); }}
        className={cn('flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          !value && 'text-muted-foreground', open && 'ring-2 ring-ring ring-offset-2', className)}>
        <span className="truncate">{selectedLabel ?? placeholder}</span>
        <ChevronDown className={cn('h-4 w-4 opacity-50 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {dropdown}
    </div>
  );
};
```

### 3.10 MoneyInput — `components/ui/MoneyInput.tsx` + `utils/formatMoneyInput.ts`

Input de dinero con máscara es-AR (`23.423.424,56`). **Nunca uses `type="number"`.**

```tsx
// components/ui/MoneyInput.tsx
import React from 'react';
import { Input } from './UIComponents';
import { maskMoney } from '../../utils/formatMoneyInput';

export interface MoneyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string;                        // string enmascarado (seed con maskFromNumber al editar)
  onChange: (value: string) => void;    // recibe el string enmascarado; parsear con parseMoney() al submit
}
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, placeholder = '0,00', ...props }, ref) => (
    <Input ref={ref} type="text" inputMode="decimal" value={value}
      onChange={(e) => onChange(maskMoney(e.target.value))} placeholder={placeholder} {...props} />
  )
);
MoneyInput.displayName = 'MoneyInput';
```

```ts
// utils/formatMoneyInput.ts — máscara/parseo es-AR. `.` = miles, `,` = decimales.
export function maskMoney(raw: string | number | null | undefined): string {
  if (raw == null) return '';
  const s = String(raw).replace(/[^0-9.,]/g, '');
  if (s === '') return '';
  let intRaw: string, decRaw: string, hasDecimal: boolean;
  const hasDot = s.includes('.'), hasComma = s.includes(',');
  if (hasDot && hasComma) {
    const decSep = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    const cut = s.lastIndexOf(decSep);
    intRaw = s.slice(0, cut).replace(/\D/g, ''); decRaw = s.slice(cut + 1).replace(/\D/g, ''); hasDecimal = true;
  } else if (hasComma) {
    const cut = s.indexOf(',');
    intRaw = s.slice(0, cut).replace(/\D/g, ''); decRaw = s.slice(cut + 1).replace(/\D/g, ''); hasDecimal = true;
  } else { intRaw = s.replace(/\D/g, ''); decRaw = ''; hasDecimal = false; }
  intRaw = intRaw.replace(/^0+(?=\d)/, '');
  let grouped = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (!hasDecimal) return grouped;
  if (grouped === '') grouped = '0';
  return grouped + ',' + decRaw.slice(0, 2);
}
export function maskFromNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
export function parseMoney(masked: string | number | null | undefined): number {
  if (masked == null) return 0;
  const s = String(masked).trim(); if (!s) return 0;
  const negative = s.startsWith('-');
  const cleaned = s.replace(/[^0-9.,]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return negative ? -Math.abs(n) : n;
}
```

**Uso con signo `$`** (overlay estándar):
```tsx
<div className="relative">
  <span className="absolute left-3 top-2.5 text-muted-foreground text-sm z-10 pointer-events-none">$</span>
  <MoneyInput className="pl-7" value={cost} onChange={setCost} />
</div>
```

### 3.11 StatusBadge — `components/ui/StatusBadge.tsx`

Pill de estado cuyo **color deriva del estado canónico** (no de la traducción). Pasás `status` (define color) y `label` (texto ya traducido).

```tsx
import React from 'react';
import { cn } from './UIComponents';
const STATUS_COLORS: Record<string, string> = {
  'pendiente': 'bg-amber-100 text-amber-700',
  'en proceso': 'bg-indigo-100 text-indigo-700',
  'off season': 'bg-sky-100 text-sky-700',
  'pospuesto': 'bg-sky-100 text-sky-700',
  'listo para enviar': 'bg-emerald-100 text-emerald-700',
  'resuelto': 'bg-emerald-100 text-emerald-700',
  'despachado': 'bg-violet-100 text-violet-700',
  'anulado': 'bg-slate-100 text-slate-600',
  'cerrada': 'bg-slate-100 text-slate-600',
  'cerrado': 'bg-slate-100 text-slate-600',
};
export const statusColor = (status: string): string =>
  STATUS_COLORS[String(status || '').trim().toLowerCase()] || 'bg-slate-100 text-slate-600';
export const StatusBadge: React.FC<{ status: string; label?: string; className?: string }> = ({ status, label, className }) => (
  <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap', statusColor(status), className)}>
    {label ?? status}
  </span>
);
export default StatusBadge;
```

### 3.12 Loader — `components/ui/Loader.tsx`

El spinner de marca (montaña + halo + anillo). Es el loading state canónico de fetch de página/lista.

```tsx
import React from 'react';
import { Mountain } from 'lucide-react';   // ← reemplazar por el ícono/isotipo del cliente

interface LoaderProps { text?: string; subtext?: string; size?: 'sm' | 'md' | 'lg'; className?: string; }
const SIZES = {
  sm: { ring: 'h-14 w-14', bubble: 'h-10 w-10', icon: 'h-4 w-4', text: 'text-xs' },
  md: { ring: 'h-[4.5rem] w-[4.5rem]', bubble: 'h-14 w-14', icon: 'h-6 w-6', text: 'text-sm' },
  lg: { ring: 'h-24 w-24', bubble: 'h-[4.5rem] w-[4.5rem]', icon: 'h-9 w-9', text: 'text-base' },
} as const;
export const Loader: React.FC<LoaderProps> = ({ text, subtext, size = 'md', className = '' }) => {
  const s = SIZES[size];
  return (
    <div className={`flex flex-col items-center justify-center text-center animate-in fade-in duration-500 ${className}`}>
      <div className={`relative ${s.ring}`}>
        <span className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
        <span className="absolute inset-0 rounded-full border-2 border-primary/15 border-t-primary animate-spin" />
        <div className={`absolute inset-0 m-auto ${s.bubble} rounded-full bg-background border border-primary/10 shadow-sm flex items-center justify-center`}>
          <Mountain className={`${s.icon} text-primary animate-pulse`} />
        </div>
      </div>
      {text && <p className={`mt-4 font-medium text-muted-foreground ${s.text}`}>{text}</p>}
      {subtext && <p className="mt-1 text-xs text-muted-foreground/70">{subtext}</p>}
    </div>
  );
};
export default Loader;
```
Uso: `<div className="flex items-center justify-center py-20"><Loader size="lg" text="Cargando…" subtext={contexto} /></div>`

### 3.13 Toast — `components/ui/Toast.tsx`

Provider + `useToast().showToast(mensaje, tipo, duración)`. Portal fijo arriba-derecha, auto-dismiss default 4000ms. Montar `<ToastProvider>` en la raíz (ver 0.4).

```tsx
import React, { useState, useCallback, useRef, useEffect, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertCircle, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';
interface Toast { id: string; message: string; type: ToastType; duration: number; }
interface ToastContextType { showToast: (message: string, type?: ToastType, duration?: number) => void; }

const ToastContext = createContext<ToastContextType | undefined>(undefined);
export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

const ICONS: Record<ToastType, React.ElementType> = { success: CheckCircle2, error: AlertCircle, warning: AlertTriangle, info: Info };
const STYLES: Record<ToastType, string> = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  error:   'bg-red-50 border-red-200 text-red-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  info:    'bg-blue-50 border-blue-200 text-blue-800',
};
const ICON_COLORS: Record<ToastType, string> = { success: 'text-emerald-500', error: 'text-red-500', warning: 'text-amber-500', info: 'text-blue-500' };

const ToastItem: React.FC<{ toast: Toast; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
  const Icon = ICONS[toast.type];
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    timerRef.current = setTimeout(() => onRemove(toast.id), toast.duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [toast.id, toast.duration, onRemove]);
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg max-w-md animate-in slide-in-from-top-2 fade-in duration-200 ${STYLES[toast.type]}`}>
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${ICON_COLORS[toast.type]}`} />
      <p className="text-sm font-medium flex-1">{toast.message}</p>
      <button onClick={() => onRemove(toast.id)} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"><X className="w-4 h-4" /></button>
    </div>
  );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts(prev => [...prev, { id, message, type, duration }]);
  }, []);
  const removeToast = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), []);
  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.length > 0 && createPortal(
        <div className="fixed top-4 right-4 z-[99999] flex flex-col gap-2">
          {toasts.map(t => <ToastItem key={t.id} toast={t} onRemove={removeToast} />)}
        </div>, document.body)}
    </ToastContext.Provider>
  );
};
```

### 3.14 Tooltip global — `components/ui/Tooltip.tsx`

**Un solo** `<TooltipHost />` montado cerca de la raíz (en `Layout`). Convierte todo `title=` del DOM en un pill oscuro propio (mata el tooltip nativo de ~1.5s). Para tooltip en cualquier elemento: poné `title="…"` o `data-tooltip="…"` — no hace falta importar nada. Delay 100ms, clamp a los 4 bordes del viewport.

```tsx
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type TipState = { text: string; x: number; y: number; placement: 'top' | 'bottom' } | null;
const OPEN_DELAY = 100; // ms
const PAD = 8;          // padding de borde del viewport

// Mueve un `title` nativo a `data-tooltip` y lo saca para que el browser nunca muestre el suyo.
const convert = (el: Element) => {
  const title = el.getAttribute('title');
  if (title == null) return;
  if (!el.getAttribute('data-tooltip')) el.setAttribute('data-tooltip', title);
  if (!el.getAttribute('aria-label') && !(el.textContent || '').trim()) el.setAttribute('aria-label', title);
  el.removeAttribute('title');
};

export const TooltipHost: React.FC = () => {
  const [tip, setTip] = useState<TipState>(null);
  const timer = useRef<number | null>(null);
  const activeEl = useRef<HTMLElement | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  // 1) Sacar todo `title` nativo (presente + futuro) vía MutationObserver.
  useEffect(() => {
    const sweep = (root: ParentNode) => {
      if (root instanceof Element && root.hasAttribute('title')) convert(root);
      (root as Element).querySelectorAll?.('[title]').forEach(convert);
    };
    sweep(document.body);
    const observer = new MutationObserver(muts => {
      for (const mu of muts) {
        if (mu.type === 'attributes' && mu.target instanceof Element) convert(mu.target);
        else if (mu.type === 'childList') mu.addedNodes.forEach(n => { if (n instanceof Element) sweep(n); });
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
    return () => observer.disconnect();
  }, []);

  // 2) Hover / focus → mostrar el pill.
  useEffect(() => {
    const clearTimer = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } };
    const hide = () => { clearTimer(); activeEl.current = null; setTip(null); };
    const resolve = (target: HTMLElement | null) => {
      const el = target?.closest('[data-tooltip]') as HTMLElement | null;
      const text = el?.getAttribute('data-tooltip');
      return el && text ? { el, text } : null;
    };
    const show = (el: HTMLElement, text: string) => {
      activeEl.current = el; clearTimer();
      timer.current = window.setTimeout(() => {
        if (activeEl.current !== el || !el.isConnected) return;
        const r = el.getBoundingClientRect();
        const above = r.top > 44;
        setTip({ text, x: r.left + r.width / 2, y: above ? r.top - PAD : r.bottom + PAD, placement: above ? 'top' : 'bottom' });
      }, OPEN_DELAY);
    };
    const onOver = (e: MouseEvent) => {
      const hit = resolve(e.target as HTMLElement | null);
      if (!hit) { if (activeEl.current) hide(); return; }
      if (hit.el === activeEl.current) return;
      show(hit.el, hit.text);
    };
    const onFocusIn = (e: FocusEvent) => {
      const hit = resolve(e.target as HTMLElement | null);
      if (hit) show(hit.el, hit.text); else if (activeEl.current) hide();
    };
    document.addEventListener('mouseover', onOver);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', hide);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('wheel', hide, { passive: true });
    window.addEventListener('blur', hide);
    document.addEventListener('keydown', hide, true);
    return () => {
      clearTimer();
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', hide);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('wheel', hide);
      window.removeEventListener('blur', hide);
      document.removeEventListener('keydown', hide, true);
    };
  }, []);

  // Clampear el pill dentro del viewport (antes del paint).
  useLayoutEffect(() => {
    const el = tipRef.current;
    if (!el || !tip) return;
    const base = tip.placement === 'top' ? 'translate(-50%, -100%)' : 'translateX(-50%)';
    el.style.transform = base;
    const r = el.getBoundingClientRect();
    let dx = 0, dy = 0;
    if (r.left < PAD) dx = PAD - r.left;
    else if (r.right > window.innerWidth - PAD) dx = (window.innerWidth - PAD) - r.right;
    if (r.top < PAD) dy = PAD - r.top;
    else if (r.bottom > window.innerHeight - PAD) dy = (window.innerHeight - PAD) - r.bottom;
    if (dx || dy) el.style.transform = `${base} translate(${dx}px, ${dy}px)`;
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div ref={tipRef} role="tooltip"
      className="kaut-tooltip pointer-events-none fixed z-[100000] max-w-xs rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium leading-snug text-white shadow-lg"
      style={{ left: tip.x, top: tip.y, transform: tip.placement === 'top' ? 'translate(-50%, -100%)' : 'translateX(-50%)' }}>
      {tip.text}
    </div>, document.body);
};
```

### 3.15 SuccessCard — `components/ui/SuccessCard.tsx`

Confirmación transaccional con barra de tiempo que se vacía y auto-dismiss. **No navega** (dejás la pantalla para operar de nuevo). Dos variantes: `overlay` (fullscreen portaled) y `contained` (llena el panel `relative` padre, ej. el carrito).

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, CheckCircle2 } from 'lucide-react';

interface SuccessCardProps {
  open: boolean; title: string; subtitle?: string; actionLabel: string; onDismiss: () => void;
  durationMs?: number;                    // la barra se vacía en este tiempo, luego auto-dismiss (default 5s)
  variant?: 'overlay' | 'contained';
}

export const SuccessCard: React.FC<SuccessCardProps> = ({ open, title, subtitle, actionLabel, onDismiss, durationMs = 5000, variant = 'overlay' }) => {
  const [runId, setRunId] = useState(0);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  useEffect(() => {
    if (!open) return;
    setRunId(r => r + 1);
    const timer = setTimeout(() => onDismissRef.current(), durationMs);
    return () => clearTimeout(timer);
  }, [open, durationMs]);
  if (!open) return null;

  if (variant === 'contained') {
    return (
      <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-emerald-50/95 backdrop-blur-[2px] px-6 text-center animate-in fade-in duration-200" onClick={onDismiss}>
        <style>{`@keyframes scz-shrink{from{transform:scaleX(1)}to{transform:scaleX(0)}}`}</style>
        <div className="flex flex-col items-center" onClick={e => e.stopPropagation()}>
          <div className="relative mb-5">
            <span className="absolute inset-0 rounded-full bg-emerald-500/15 animate-ping" />
            <div className="relative h-16 w-16 rounded-full border-[3px] border-emerald-500 flex items-center justify-center">
              <Check className="h-9 w-9 text-emerald-600" strokeWidth={2.6} />
            </div>
          </div>
          <h3 className="text-xl font-bold text-emerald-900">{title}</h3>
          {subtitle && <p className="text-sm text-emerald-700/80 mt-1.5">{subtitle}</p>}
          <button onClick={onDismiss} className="mt-6 px-5 h-10 rounded-lg border border-emerald-600 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition-colors">{actionLabel}</button>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-emerald-100 overflow-hidden">
          <div key={runId} className="h-full w-full bg-emerald-500 origin-left" style={{ animation: `scz-shrink ${durationMs}ms linear forwards` }} />
        </div>
      </div>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onDismiss}>
      <style>{`@keyframes scz-shrink{from{transform:scaleX(1)}to{transform:scaleX(0)}}`}</style>
      <div className="bg-background w-full max-w-sm rounded-2xl shadow-2xl border overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-8 flex flex-col items-center text-center">
          <div className="relative mb-5">
            <span className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
            <div className="relative h-16 w-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="h-9 w-9" strokeWidth={2.2} />
            </div>
          </div>
          <h3 className="text-xl font-bold text-foreground">{title}</h3>
          {subtitle && <p className="text-sm text-muted-foreground mt-1.5">{subtitle}</p>}
          <button onClick={onDismiss} className="mt-6 w-full h-11 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors">{actionLabel}</button>
        </div>
        <div className="h-1.5 bg-muted overflow-hidden">
          <div key={runId} className="h-full w-full bg-emerald-500 origin-left" style={{ animation: `scz-shrink ${durationMs}ms linear forwards` }} />
        </div>
      </div>
    </div>, document.body);
};
export default SuccessCard;
```
Uso: `<SuccessCard open={done} title="Orden confirmada" subtitle="N° 1234" actionLabel="Nueva orden" onDismiss={() => setDone(false)} variant="contained" />`

### 3.16 Combobox / MultiCombobox — en `UIComponents.tsx`

Selects con buscador, portaled (`zIndex 999999`). `Combobox` = single-select (selector de tenant/cliente/artículo); `MultiCombobox` = multi-select con checkboxes + "Clear all" (filtros de dashboard). Ambos comparten el mismo patrón de posicionamiento.

```tsx
export interface ComboboxOption { label: string; value: string; icon?: React.ReactNode; }
export interface ComboboxProps {
  options: ComboboxOption[]; value: string; onChange: (value: string) => void;
  placeholder?: string; searchPlaceholder?: string; icon?: React.ReactNode;
  className?: string; disabled?: boolean; emptyText?: string;
}

export const Combobox: React.FC<ComboboxProps> = ({ options, value, onChange, placeholder = "Select...", searchPlaceholder = "Search...", icon, className, disabled, emptyText = "No results" }) => {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const containerRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const popupRef = React.useRef<HTMLDivElement>(null);
  const [coords, setCoords] = React.useState<{ top: number; left: number; width: number } | null>(null);

  const updatePosition = React.useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX, width: rect.width });
    }
  }, []);
  React.useEffect(() => {
    if (open) { updatePosition(); window.addEventListener('scroll', updatePosition, true); window.addEventListener('resize', updatePosition); }
    return () => { window.removeEventListener('scroll', updatePosition, true); window.removeEventListener('resize', updatePosition); };
  }, [open, updatePosition]);
  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current && !containerRef.current.contains(t) && popupRef.current && !popupRef.current.contains(t)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const selectedOption = options.find(o => o.value === value);
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

  const dropdown = open && coords ? createPortal(
    <div ref={popupRef} style={{ position: 'absolute', top: coords.top, left: coords.left, width: coords.width, zIndex: 999999 }}
      className="bg-popover text-popover-foreground border rounded-md shadow-lg overflow-hidden">
      <div className="p-2 border-b bg-muted/20">
        <div className="flex items-center px-2 py-1.5 bg-background rounded border group focus-within:ring-1 focus-within:ring-primary/40 focus-within:border-primary/50 transition-all">
          <Search className="h-3.5 w-3.5 text-muted-foreground mr-2 shrink-0 group-focus-within:text-primary transition-colors" />
          <input autoFocus className="bg-transparent border-none text-xs w-full outline-none focus:outline-none placeholder:text-muted-foreground" placeholder={searchPlaceholder} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="max-h-[200px] overflow-y-auto p-1 bg-popover">
        {filtered.length === 0 ? <div className="px-2 py-3 text-xs text-muted-foreground text-center">{emptyText}</div>
          : filtered.map(opt => (
            <button key={opt.value} type="button" onClick={e => { e.stopPropagation(); onChange(opt.value); setOpen(false); setSearch(''); }}
              className={cn("w-full text-left px-2 py-1.5 text-xs rounded-sm hover:bg-accent hover:text-accent-foreground flex items-center justify-between outline-none transition-colors", value === opt.value && "bg-accent/60 text-accent-foreground font-medium")}>
              <div className="flex items-center gap-2 truncate pr-2">{opt.icon && <span className="shrink-0">{opt.icon}</span>}<span className="truncate">{opt.label}</span></div>
              {value === opt.value && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
            </button>
          ))}
      </div>
    </div>, document.body) : null;

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <button ref={buttonRef} type="button" disabled={disabled} onClick={() => setOpen(!open)}
        className={cn("w-full flex items-center justify-between border bg-background px-3 h-10 text-sm rounded-md focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
          open ? "border-primary/50 ring-2 ring-primary/20" : "border-input hover:border-primary/50")}>
        <div className="flex items-center gap-2 overflow-hidden w-[calc(100%-20px)]">
          {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
          {selectedOption?.icon && !icon && <span className="text-muted-foreground shrink-0">{selectedOption.icon}</span>}
          <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        </div>
        <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 opacity-50" />
      </button>
      {dropdown}
    </div>
  );
};
```

**MultiCombobox** — mismo esqueleto que `Combobox`, con estas diferencias: `value: string[]` / `onChange: (string[]) => void`; cada opción es un botón con un checkbox cuadrado (`checked ? "bg-primary border-primary"` con `<Check className="h-2.5 w-2.5 text-primary-foreground" />`); el trigger muestra `"N selected"` cuando hay más de uno; y al pie del dropdown hay un botón `Clear all` (`onClick={() => onChange([])}`) cuando `value.length > 0`. Reutilizá el `updatePosition` / click-outside / portal idénticos.

### 3.17 CategoryMultiSelect — `components/ui/CategoryMultiSelect.tsx`

Filtro compacto tipo botón-pill con badge de conteo + checklist portaled. Distinto de `MultiCombobox`: es un **botón de filtro** (ícono `ListFilter`, contador arriba a la derecha, ring de marca cuando hay selección), pensado para barras de herramientas de tablas.

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ListFilter, Check } from 'lucide-react';

export const CategoryMultiSelect: React.FC<{
  categories: string[]; selected: string[]; onChange: (next: string[]) => void;
  label: string; clearLabel: string; className?: string;
}> = ({ categories, selected, onChange, label, clearLabel, className }) => {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node;
      if (btnRef.current?.contains(n) || panelRef.current?.contains(n)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggleOpen = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const width = Math.max(r.width, 220);
      let left = r.left;
      if (left + width > window.innerWidth - 8) left = Math.max(8, r.right - width); // right-align si desborda
      setRect({ top: r.bottom + 4, left, width });
    }
    setOpen(o => !o);
  };
  const toggle = (cat: string) => onChange(selected.includes(cat) ? selected.filter(c => c !== cat) : [...selected, cat]);
  const count = selected.length;

  return (
    <>
      <button ref={btnRef} onClick={toggleOpen}
        className={`relative flex items-center gap-2 h-9 px-3 rounded-md border text-sm transition-colors shrink-0 ${count > 0 ? 'border-primary text-primary bg-primary/5 ring-1 ring-primary/30' : 'border-input bg-background text-foreground hover:bg-accent'} ${className || ''}`}>
        <ListFilter className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60 ml-auto shrink-0" />
        {count > 0 && <span className="absolute -top-1.5 -right-1.5 h-4 min-w-[1rem] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">{count}</span>}
      </button>
      {open && rect && createPortal(
        <div ref={panelRef} style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width }}
          className="bg-popover border rounded-md shadow-md z-[90] animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
          <div className="max-h-[260px] overflow-y-auto py-1">
            {categories.length === 0 ? <div className="px-3 py-2 text-xs text-muted-foreground text-center">—</div>
              : categories.map(cat => {
                const sel = selected.includes(cat);
                return (
                  <button key={cat} onClick={() => toggle(cat)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2.5 ${sel ? 'font-medium' : ''}`}>
                    <span className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors ${sel ? 'bg-primary border-primary text-primary-foreground' : 'border-input bg-background'}`}>
                      {sel && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate flex-1">{cat}</span>
                  </button>
                );
              })}
          </div>
          {count > 0 && <button onClick={() => onChange([])} className="w-full border-t px-3 py-2 text-xs text-muted-foreground hover:bg-accent text-left">{clearLabel}</button>}
        </div>, document.body)}
    </>
  );
};
export default CategoryMultiSelect;
```
Uso: `<CategoryMultiSelect categories={cats} selected={sel} onChange={setSel} label="Categoría" clearLabel="Limpiar" />`

---

## 4. Recetas de composición

### 4.1 Modal de formulario (patrón canónico)

Combina `useModalAnimation` (entrada/salida) + `backdropClose` (cierre a prueba de arrastre) + portal. **Todos los modales de formulario siguen esta estructura.**

```tsx
import { createPortal } from 'react-dom';
import { Save, X } from 'lucide-react';
import { Button, Input, useModalAnimation } from './ui/UIComponents';
import { backdropClose } from './ui/backdropClose';

const MyFormModal: React.FC<{ isOpen: boolean; onClose: () => void; onSave: () => void }> = ({ isOpen, onClose, onSave }) => {
  const { visible, overlayClass, modalClass } = useModalAnimation(isOpen);
  if (!visible) return null;

  return createPortal(
    <div className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 ${overlayClass}`} {...backdropClose(onClose)}>
      <div className={`${modalClass} bg-background w-full max-w-2xl rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]`}>

        {/* Header */}
        <div className="px-6 py-4 border-b flex justify-between items-center bg-secondary/20">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Título</h2>
            <p className="text-xs text-muted-foreground">Subtítulo <span className="font-medium text-foreground">contexto</span></p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-full transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Nombre</label>
              <Input autoFocus />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-muted/20 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={onSave} className="min-w-[140px] w-full sm:w-auto">
            <Save className="h-4 w-4 mr-2" /> Guardar
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
};
```

**Reglas fijas del modal:**
- Overlay: `fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4`.
- Card: `bg-background rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]`.
- Tamaños (`max-w-*`): `md` confirmación · `lg` formulario simple · `2xl` formulario extenso · `3xl/4xl` split-view · `5xl/7xl` paneles densos.
- Header `bg-secondary/20` (o `bg-zinc-50 dark:bg-zinc-900`), footer `bg-muted/20`.
- Loading: deshabilitar submit + `<Loader2 className="animate-spin" />` inline.
- Banner de error inline: `<div className="p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 text-sm"><AlertCircle className="h-4 w-4" /> {msg}</div>`.

**Toggle switch** (patrón usado en formularios):
```tsx
<button onClick={() => setOn(!on)} className={`w-10 h-5 rounded-full transition-colors relative ${on ? 'bg-primary' : 'bg-muted'}`}>
  <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${on ? 'translate-x-5' : ''}`} />
</button>
```

### 4.2 Modal de confirmación — `components/ConfirmModal.tsx`

Alert dialog centrado (ícono circular + título + descripción + 2 botones). `variant: 'danger' | 'default'`.

```tsx
const ConfirmModal: React.FC<ConfirmModalProps> = ({ isOpen, onClose, onConfirm, title, description, confirmText = "Confirm", cancelText = "Cancel", variant = 'default', icon }) => {
  const [isProcessing, setIsProcessing] = React.useState(false);
  if (!isOpen) return null;
  const handleConfirm = async () => { setIsProcessing(true); try { await onConfirm(); } finally { setIsProcessing(false); onClose(); } };
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" {...backdropClose(() => { if (!isProcessing) onClose(); })}>
      <div className="bg-background w-full max-w-md rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        <div className="p-8 flex flex-col items-center text-center">
          <div className={`h-12 w-12 rounded-full flex items-center justify-center mb-4 ${variant === 'danger' ? 'bg-red-100 text-red-600' : 'bg-primary/10 text-primary'}`}>
            {icon ?? <AlertTriangle className="h-6 w-6" />}
          </div>
          <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{description}</p>
          <div className="flex gap-3 w-full">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={isProcessing}>{cancelText}</Button>
            <Button variant={variant === 'danger' ? 'destructive' : 'default'} className="flex-1 gap-2" disabled={isProcessing} onClick={handleConfirm}>
              {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}{confirmText}
            </Button>
          </div>
        </div>
      </div>
    </div>, document.body);
};
```

### 4.3 Drawer lateral genérico — `components/HomeDetailDrawer.tsx`

Panel deslizante desde la derecha, **data-driven por config de columnas**, que renderiza tabla en desktop y cards en mobile automáticamente y carga sus filas lazy al abrir. Reutilizable para cualquier drill-down de KPI/fila.

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useModalAnimation, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/UIComponents';
import { Loader } from './ui/Loader';

export interface DrawerColumn<T> {
  key: string; label: string; align?: 'left' | 'right' | 'center'; className?: string;
  render?: (row: T) => React.ReactNode;
}
interface Props<T> {
  open: boolean; onClose: () => void; icon?: React.ElementType; title: string; subtitle?: string;
  columns: DrawerColumn<T>[]; loadRows: () => Promise<T[]>; emptyText: string; errorText: string;
  moduleTo?: string; moduleLabel?: string; onNavigate?: (to: string) => void;
  note?: string; groupBy?: (row: T) => string;
}
const alignCls = (a?: string) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');
function groupRows<T>(rows: T[], by: (r: T) => string) {
  const groups: { key: string; rows: T[] }[] = []; const idx = new Map<string, number>();
  for (const r of rows) { const k = by(r); let i = idx.get(k); if (i === undefined) { i = groups.length; idx.set(k, i); groups.push({ key: k, rows: [] }); } groups[i].rows.push(r); }
  return groups;
}

function HomeDetailDrawer<T>({ open, onClose, icon: Icon, title, subtitle, columns, loadRows, emptyText, errorText, moduleTo, moduleLabel, onNavigate, note, groupBy }: Props<T>) {
  const { visible, overlayClass, modalClass } = useModalAnimation(open);
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const overlayMouseDown = useRef<EventTarget | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setError(false); setRows([]);
    loadRows().then(r => { if (!cancelled) setRows(r); }).catch(() => { if (!cancelled) setError(true); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  if (!visible) return null;
  const drawerClass = modalClass === 'modal-exit' ? 'drawer-exit-right' : 'drawer-enter-right';
  const renderCells = (row: T) => columns.map(c => (
    <TableCell key={c.key} className={`text-xs ${alignCls(c.align)} ${c.className || ''}`}>{c.render ? c.render(row) : String((row as any)[c.key] ?? '')}</TableCell>
  ));
  const renderCard = (row: T, key: React.Key) => (
    <div key={key} className="space-y-1.5 rounded-lg border bg-card p-3 shadow-sm">
      {columns.map(c => (
        <div key={c.key} className="flex items-start justify-between gap-3">
          <span className="shrink-0 pt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{c.label}</span>
          <span className={`min-w-0 text-right text-sm ${c.className || ''}`}>{c.render ? c.render(row) : String((row as any)[c.key] ?? '')}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className={`fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm ${overlayClass}`}
      onMouseDown={e => { overlayMouseDown.current = e.target; }}
      onClick={e => { if (overlayMouseDown.current === e.currentTarget) onClose(); }}>
      <div className={`${drawerClass} relative flex h-full w-full max-w-2xl flex-col border-l bg-background shadow-2xl`} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b p-4">
          <div className="flex items-center gap-3">
            {Icon && <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10"><Icon className="h-4 w-4 text-brand" /></div>}
            <div><h2 className="text-base font-bold tracking-tight">{title}</h2>{subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {loading ? <div className="flex items-center justify-center py-20"><Loader size="md" /></div>
            : error ? <p className="py-16 text-center text-sm text-muted-foreground">{errorText}</p>
            : rows.length === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">{emptyText}</p>
            : <>
                <div className="hidden overflow-hidden rounded-md border md:block">
                  <Table>
                    <TableHeader><TableRow>{columns.map(c => <TableHead key={c.key} className={`text-[11px] uppercase ${alignCls(c.align)}`}>{c.label}</TableHead>)}</TableRow></TableHeader>
                    <TableBody>
                      {groupBy
                        ? groupRows(rows, groupBy).map((g, gi) => (
                          <React.Fragment key={gi}>
                            <TableRow><TableCell colSpan={columns.length} className="bg-muted/50 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.key}</TableCell></TableRow>
                            {g.rows.map((row, i) => <TableRow key={i}>{renderCells(row)}</TableRow>)}
                          </React.Fragment>))
                        : rows.map((row, i) => <TableRow key={i}>{renderCells(row)}</TableRow>)}
                    </TableBody>
                  </Table>
                </div>
                <div className="space-y-2 md:hidden">
                  {groupBy
                    ? groupRows(rows, groupBy).map((g, gi) => (
                      <div key={gi} className="space-y-2">
                        <div className="px-0.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.key}</div>
                        {g.rows.map((row, i) => renderCard(row, i))}
                      </div>))
                    : rows.map((row, i) => renderCard(row, i))}
                </div>
              </>}
          {note && <p className="mt-3 text-[11px] text-muted-foreground/80">{note}</p>}
        </div>
        {moduleTo && onNavigate && (
          <div className="border-t p-3">
            <button type="button" onClick={() => { onClose(); onNavigate(moduleTo); }} className="w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand/90">{moduleLabel} →</button>
          </div>
        )}
      </div>
    </div>
  );
}
export default HomeDetailDrawer;
```

### 4.4 Página estándar (header + toolbar + tabla + cards mobile)

**Toda vista de listado** sigue este esqueleto:

```tsx
<div className="flex flex-col gap-4 w-full">
  {/* HEADER — título oculto en mobile (el nombre del módulo vive en el header mobile del Layout) */}
  <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3 shrink-0">
    <div className="shrink-0 hidden md:block">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
    </div>
    {/* TOOLBAR: búsqueda + filtros + acciones */}
    <div className="flex items-center gap-2 flex-wrap lg:justify-end">
      <div className="relative flex-1 sm:w-56 sm:flex-none min-w-[7rem]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} className="pl-8 h-9 text-sm" />
      </div>
      <div className="sm:w-40"><Select value={filter} onChange={setFilter} options={opts} /></div>
      <Button variant="outline" className="h-9 px-3 text-sm gap-1.5 shrink-0"><Plus className="h-3.5 w-3.5" /><span className="hidden sm:inline">Nuevo</span></Button>
    </div>
  </div>

  {/* ESTADO DE CARGA */}
  {loading ? (
    <div className="flex items-center justify-center py-20"><Loader size="lg" text="Cargando…" subtext={contexto} /></div>
  ) : (
    <>
      {/* MOBILE: una card por fila */}
      <div className="md:hidden space-y-2">
        {rows.map(r => (
          <div key={r.id} className="rounded-lg border bg-card p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">…</div>
          </div>
        ))}
      </div>
      {/* DESKTOP: tabla */}
      <Card className="hidden md:block border shadow-sm">
        <Table>
          <TableHeader><TableRow><TableHead>…</TableHead></TableRow></TableHeader>
          <TableBody>{rows.map(r => <TableRow key={r.id}><TableCell>…</TableCell></TableRow>)}</TableBody>
        </Table>
      </Card>
    </>
  )}
</div>
```

**Empty state**: ícono lucide grande `opacity-20` + texto `text-muted-foreground`, opcionalmente en `border-2 border-dashed rounded-lg`.

**Regla mobile→desktop**: se renderizan **dos bloques** (`md:hidden` cards + `hidden md:block` tabla) sobre el mismo array. Cualquier cambio de fila va en los dos.

### 4.5 Sidebar / Layout — `components/Layout.tsx`

Shell de la app. Aside colapsable en desktop, drawer en mobile, `<TooltipHost/>` montado acá.

```tsx
// Contenedor raíz
<div className="flex h-screen bg-background text-foreground">
  {/* Aside desktop */}
  <aside className={cn("hidden md:flex flex-col border-r bg-card transition-all duration-300 ease-in-out z-20", isCollapsed ? "w-16" : "w-64")}>
    {/* Logo (h-16) + flecha de colapso + selector de tenant/lodge (Combobox si el rol puede cambiar) */}
    {/* nav: NavItem[] con secciones separadas por divisores */}
    {/* footer: botón logout variant=ghost text-destructive → abre ConfirmModal */}
  </aside>
  {/* Header mobile fijo (hamburguesa + nombre de módulo + avatar) + drawer izquierdo (drawer-enter-left) */}
  {/* Main: área de contenido bg-secondary/30, p-3 md:p-8, mt-16 md:mt-0 */}
</div>
```

**NavItem** — estados: activo `bg-primary text-primary-foreground shadow-sm`; hover `hover:bg-accent hover:text-accent-foreground`; base `text-muted-foreground`; disabled `opacity-50 cursor-not-allowed`; colapsado `justify-center` (solo ícono, con `title` para tooltip). Base: `group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-all w-full`. Soporta `badge` (contador en pill rojo).

### 4.6 Dashboard — `components/dashboard/shared.tsx`

Charts con **Recharts** (única librería). Paleta y helpers reutilizables:

```tsx
// ── Paleta de marca (reemplazar WINE por el color del cliente) ──
export const WINE = '#800020';
export const WINE_SHADES = ['#800020', '#9b2740', '#b34a5e', '#c66e7f', '#d8939f', '#e8b9c0', '#f0d2d7'];
export const shade = (i: number) => WINE_SHADES[i % WINE_SHADES.length];

// ── Estilo de ejes/grid: spread en <CartesianGrid>/<XAxis>/<YAxis> ──
export const CHART_GRID = { strokeDasharray: '3 3', stroke: '#eef0f2' } as const;
export const X_TICK = { fontSize: 11, fill: '#52525b' } as const;
export const Y_TICK = { fontSize: 10, fill: '#94a3b8' } as const;
export const AXIS_LINE = { axisLine: false as const, tickLine: false as const };
```

**KpiCard** — la tarjeta de métrica canónica del dashboard (preferir sobre StatCard). Icon+label arriba, valor grande, footer opcional (prioridad budget → delta → sub). `accent` pinta el wash de marca:

```tsx
export const KpiCard: React.FC<{ icon: React.ElementType; label: string; value: React.ReactNode; accent?: boolean; badge?: string; delta?: number; deltaLabel?: string; budget?: string; attainment?: number; sub?: React.ReactNode; }> = ({ icon: Icon, label, value, accent, badge, delta, deltaLabel, budget, attainment, sub }) => {
  const over = (attainment ?? 0) >= 100;
  const hasFooter = budget != null || delta != null || sub != null;
  return (
    <Card className={accent ? 'border-[#800020]/20 bg-[#800020]/[0.03]' : ''}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className={`h-4 w-4 shrink-0 ${accent ? 'text-[#800020]' : ''}`} />
          <span className="truncate text-[11px] font-semibold uppercase tracking-wider">{label}</span>
        </div>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className={`text-2xl font-bold tabular-nums ${accent ? 'text-[#800020]' : ''}`}>{value}</span>
          {badge && <span className="shrink-0 rounded-md bg-[#800020] px-1.5 py-0.5 text-xs font-bold text-white">{badge}</span>}
        </div>
        {hasFooter && (
          <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2.5 text-xs text-muted-foreground">
            {budget != null ? (<>
              <span className="truncate">Budget <b className="text-foreground">{budget}</b></span>
              {attainment != null && <span className={`shrink-0 rounded-md px-2 py-0.5 font-semibold text-white ${over ? 'bg-emerald-600' : 'bg-[#800020]'}`}>{pct(attainment)}</span>}
            </>) : delta != null ? <DeltaChip value={delta} label={deltaLabel || ''} /> : sub}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
```

Otros helpers de `shared.tsx`:

```tsx
import { TrendingUp, TrendingDown } from 'lucide-react';

// Formatters
const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
export const money = (n: number) => `$${nf0.format(Math.round(n || 0))}`;
export const intFmt = (n: number) => nf0.format(Math.round(n || 0));
export const pct = (n: number) => `${(n || 0).toFixed(1)}%`;

// Encabezado de sección (ícono de marca + texto uppercase)
export const SectionTitle: React.FC<{ icon: React.ElementType; children: React.ReactNode; right?: React.ReactNode }> = ({ icon: Icon, children, right }) => (
  <div className="mb-4 flex items-center justify-between">
    <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-brand" /><h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{children}</h3></div>
    {right}
  </div>
);

// Pill de tendencia verde/rojo
export const DeltaChip: React.FC<{ value: number; label: string }> = ({ value, label }) => {
  const up = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
      {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {up ? '+' : ''}{value.toFixed(1)}%
      <span className="ml-0.5 font-normal text-muted-foreground/70">{label}</span>
    </span>
  );
};

// Shell de tooltip custom para Recharts (pasar como content={<TooltipShell>…} )
export const TooltipShell: React.FC<{ title?: React.ReactNode; children: React.ReactNode }> = ({ title, children }) => (
  <div className="min-w-[150px] rounded-lg border bg-background px-3 py-2 text-xs shadow-lg">
    {title && <p className="mb-1.5 font-semibold text-foreground">{title}</p>}
    <div className="space-y-1">{children}</div>
  </div>
);
export const TipRow: React.FC<{ label: React.ReactNode; value: React.ReactNode; color?: string }> = ({ label, value, color }) => (
  <div className="flex items-center gap-3">
    {color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />}
    <span className="text-muted-foreground">{label}</span>
    <span className="ml-auto font-semibold tabular-nums text-foreground">{value}</span>
  </div>
);

// Altura de una tabla scrolleable hasta el fondo del viewport (sin doble scroll).
export function useFillHeight(reserve = 90) {
  const [el, setEl] = React.useState<HTMLElement | null>(null);
  const ref = React.useCallback((node: HTMLElement | null) => setEl(node), []);
  const [height, setHeight] = React.useState<number>();
  React.useLayoutEffect(() => {
    if (!el || typeof window === 'undefined') return;
    const recompute = () => {
      const top = el.getBoundingClientRect().top;
      const next = Math.max(220, Math.floor(window.innerHeight - top - reserve));
      setHeight(prev => (prev === next ? prev : next));
    };
    recompute();
    window.addEventListener('resize', recompute);
    const ro = new ResizeObserver(recompute); ro.observe(document.body);
    return () => { window.removeEventListener('resize', recompute); ro.disconnect(); };
  }, [el, reserve]);
  return { ref, height };
}
```

`HBarList` (ranking de barras horizontales con tooltip enriquecido) es un helper más largo y opcional — componelo con `ResponsiveContainer`+`BarChart layout="vertical"` de Recharts usando `shade(i)` para el color de cada barra y `TooltipShell`/`TipRow` para el tooltip.

#### Chart dentro de una Card (la receta que importa)

**Todo gráfico va envuelto así** — `Card` → `CardContent className="p-5"` → `SectionTitle` (ícono de marca + título) → gráfico en `ResponsiveContainer`. Nunca un chart suelto sin card.

```tsx
<Card>
  <CardContent className="p-5">
    <SectionTitle icon={TrendingUp}>Ingresos por mes</SectionTitle>
    {data.length ? (
      <ResponsiveContainer width="100%" height={250}>
        {/* …el gráfico… */}
      </ResponsiveContainer>
    ) : (
      <p className="py-8 text-center text-sm text-muted-foreground">Sin datos</p>
    )}
  </CardContent>
</Card>
```

**Reglas fijas del chart-en-card:**
- Card con `CardContent className="p-5"` (padding estándar de charts; los KPI usan `p-4`).
- Título con `SectionTitle` (nunca un `<h3>` suelto).
- Gráfico siempre en `<ResponsiveContainer width="100%" height={250}>` (alto fijo, ancho fluido).
- Estado vacío: `<p className="py-8 text-center text-sm text-muted-foreground">Sin datos</p>` dentro de la card.
- Colores del gráfico: `WINE` / `shade(i)` / hex (Recharts usa strings de color, no clases Tailwind). Los adornos alrededor (badges, texto) sí usan clases `brand`.

**Ejemplo completo — Area chart con gradiente + tooltip custom** (el patrón más usado):

```tsx
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Card, CardContent } from '../ui/UIComponents';
import { WINE, money, intFmt, SectionTitle, CHART_GRID, X_TICK, Y_TICK, AXIS_LINE, TooltipShell, TipRow } from './shared';
import { TrendingUp } from 'lucide-react';

const moneyK = (v: number) => (v === 0 ? '0' : `$${Math.round(v / 1000)}k`);

// Tooltip custom: SIEMPRE con TooltipShell + TipRow (no el tooltip default de Recharts).
const MonthTip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TooltipShell title={label}>
      <TipRow label="Ingresos" value={money(d.revenue)} color={WINE} />
      <TipRow label="Costo" value={money(d.cost)} />
      <TipRow label="Neto" value={money(d.net)} />
      <TipRow label="BN" value={intFmt(d.bn)} />
    </TooltipShell>
  );
};

<Card className="lg:col-span-2">
  <CardContent className="p-5">
    <SectionTitle icon={TrendingUp}>Ingresos por mes</SectionTitle>
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart data={data.byMonth} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        {/* Gradiente de relleno de marca — el detalle que da el look "prolijo" */}
        <defs>
          <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={WINE} stopOpacity={0.35} />
            <stop offset="100%" stopColor={WINE} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...CHART_GRID} vertical={false} />
        <XAxis dataKey="label" tick={X_TICK} {...AXIS_LINE} interval="preserveStartEnd" minTickGap={12} />
        <YAxis tick={Y_TICK} {...AXIS_LINE} width={42} tickFormatter={moneyK} />
        <Tooltip content={<MonthTip />} />
        <Area type="monotone" dataKey="revenue" stroke={WINE} strokeWidth={2.5} fill="url(#revFill)" />
      </AreaChart>
    </ResponsiveContainer>
  </CardContent>
</Card>
```

**Convenciones de Recharts del kit** (repetir en todo chart):
- Grid: `<CartesianGrid {...CHART_GRID} vertical={false} />` (solo líneas horizontales).
- Ejes: `{...AXIS_LINE}` (sin línea de eje ni ticks), `tick={X_TICK}` / `tick={Y_TICK}`. `YAxis width={42}` + `tickFormatter` (ej. `moneyK` → `$12k`).
- Área/línea: `type="monotone" strokeWidth={2.5}`, relleno con gradiente `url(#id)`.
- Barras: `radius={[0,6,6,0]}` (horizontales) o `[6,6,0,0]` (verticales), color por `<Cell fill={shade(i)} />`.
- Tooltip: `<Tooltip content={<MiTooltip />} />` con `TooltipShell`+`TipRow`. Para el cursor de barras: `cursor={{ fill: 'rgba(128,0,32,0.05)' }}`.

**Donut / Pie con label central** (para mix/proporciones):

```tsx
<div className="relative">
  <ResponsiveContainer width={150} height={150}>
    <PieChart>
      <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={70} paddingAngle={2} stroke="none">
        {data.map((_, i) => <Cell key={i} fill={i === 0 ? '#d8939f' : WINE} />)}
      </Pie>
      <Tooltip content={/* TooltipShell + TipRow */} />
    </PieChart>
  </ResponsiveContainer>
  {/* Total superpuesto en el centro del donut */}
  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
    <span className="text-lg font-bold tabular-nums">{money(total)}</span>
  </div>
</div>
```
Debajo del donut, una leyenda propia (no la de Recharts): filas `flex items-center gap-2` con punto de color (`h-2.5 w-2.5 rounded-full`), nombre, valor `tabular-nums` y `%`.

#### Layout de un tab de dashboard completo

El orden y los grids se repiten en todos los tabs: **header → grid de KPIs → grids de charts → meta**.

```tsx
<div className={`space-y-4 pb-8 transition-opacity duration-300 ${isRefreshing ? 'opacity-60' : ''}`}>
  {/* Header: título + badge de temporada + botón refresh */}
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <div className="flex items-center gap-2.5">
        <h2 className="text-2xl font-bold tracking-tight">Ingresos</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/[0.08] px-2.5 py-0.5 text-[11px] font-semibold text-brand">
          <CalendarRange className="h-3.5 w-3.5" />{data.season.label}
        </span>
      </div>
      <p className="mt-0.5 text-sm text-muted-foreground">Deep-dive de ingresos</p>
    </div>
    <button onClick={() => load(true)} className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-colors hover:text-foreground">
      <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
    </button>
  </div>

  {/* KPIs: grid 2 → 3 → 5 columnas */}
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
    <KpiCard icon={DollarSign} label="Ingreso total" value={money(k.revenue)} accent delta={k.revenueDeltaPct} deltaLabel="vs prev." />
    {/* … */}
  </div>

  {/* Charts anchos: uno grande (lg:col-span-2) + uno chico */}
  <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
    <Card className="lg:col-span-2"><CardContent className="p-5">{/* AreaChart */}</CardContent></Card>
    <Card><CardContent className="p-5">{/* Donut */}</CardContent></Card>
  </div>

  {/* Rankings: 2 columnas iguales */}
  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
    <Card><CardContent className="p-5"><SectionTitle icon={ShoppingBag}>Por categoría</SectionTitle><HBarList data={categoryBars} isMoney /></CardContent></Card>
    <Card><CardContent className="p-5"><SectionTitle icon={MapPin}>Por lodge</SectionTitle><HBarList data={lodgeBars} isMoney /></CardContent></Card>
  </div>

  {/* Meta al pie */}
  <div className="text-xs text-muted-foreground/70">{data.season.start} → {data.season.end} · {data.meta.ordersScanned} órdenes</div>
</div>
```

**Grids canónicos de dashboard:**
- KPIs: `grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5`.
- Chart grande + chico: `grid grid-cols-1 gap-4 lg:grid-cols-3` con `lg:col-span-2` en el grande.
- Dos rankings/charts iguales: `grid grid-cols-1 gap-4 lg:grid-cols-2`.
- Contenedor del tab: `space-y-4 pb-8`.

**Estados del tab** (los tres, siempre):
- **Loading**: `<div className="flex items-center justify-center py-24"><Loader size="lg" text="Ingresos" /></div>`.
- **Error**: bloque centrado con círculo `bg-red-50` + `<AlertCircle className="text-red-500" />` + botón "Reintentar" (`bg-brand text-white`).
- **Refreshing** (recarga silenciosa por cambio de filtro): atenuar todo con `opacity-60` en el contenedor (`transition-opacity`), y `animate-spin` en el ícono de refresh — sin desmontar los charts.

**Detail modal de drill-down**: overlay `z-[1000]` + modal `max-w-[1200px] max-h-[90vh]`, header con filtros + búsqueda + botón export XLS, tabla con `<th>` sticky (`sticky top-0 z-10 bg-muted/60 backdrop-blur`), footer con paginación (`ChevronLeft/Right`).

**Mapas**: para datasets geográficos chicos y conocidos, SVG custom con GeoJSON simplificado + burbujas proporcionales (ver `CountryBubbleMap.tsx`), NO una librería de mapas.

---

### 4.7 Filtros

> **Lo primero y más importante**: en este kit un filtro **NO es un modal/overlay**. El patrón canónico es una **barra colapsable** (`FilterBar`) que se muestra/oculta con un botón toggle (`FilterToggle`), respaldada por un contexto (`FilterProvider`). Intentar armarlo como modal centrado con backdrop es el error típico — no lo hagas.

Hay **3 patrones de filtro** según el caso. Elegí el correcto:

| Patrón | Cuándo | Componente |
|---|---|---|
| **A. Filtro simple de una dimensión** | 1 sola categoría a filtrar, dentro de la toolbar de una tabla | `CategoryMultiSelect` (3.17) — botón pill + checklist portaled |
| **B. Selección única con muchas opciones** | elegir 1 valor de una lista larga (tenant, cliente) | `Select` (3.9) o `Combobox` (3.16) |
| **C. Barra multi-dimensión** | varios filtros a la vez (lodge + empresa + país + fecha), típico de dashboards/vistas ricas | `FilterProvider` + `FilterToggle` + `FilterBar` (abajo) |

#### Patrón C — barra de filtros colapsable

Tres piezas: (1) `FilterProvider` mantiene el estado y expone `activeCount`; (2) `FilterToggle` es el botón (con badge de conteo) que abre/cierra la barra; (3) `FilterBar` es el panel con los campos. **La barra no se auto-oculta**: el que decide si se renderiza es la vista, con un `useState(showFilters)`.

**Estado + wiring (en la vista):**
```tsx
import { FilterProvider, FilterBar, FilterToggle, useFilters } from './dashboard/filters';

const MiVista = () => (
  <FilterProvider>
    <Contenido />
  </FilterProvider>
);

const Contenido = () => {
  const [showFilters, setShowFilters] = useState(true);
  const { filters } = useFilters();           // leer filters.lodges, filters.countries, filters.seasonStart, etc.
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Título</h1>
        <FilterToggle open={showFilters} onToggle={() => setShowFilters(v => !v)} />
      </div>
      {showFilters && <FilterBar dateMode="season" />}   {/* dateMode="none" para ocultar el picker de fecha */}
      {/* … usar `filters` para filtrar tu data … */}
    </div>
  );
};
```

**El módulo de filtros** (`components/dashboard/filters.tsx`) — provider, campo, barra y toggle:

```tsx
import React, { createContext, useContext, useMemo, useState } from 'react';
import { MapPin, Building2, Globe2, CalendarRange, X, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';
import { MultiCombobox } from '../ui/UIComponents';

// ── Estado ──
export interface DashboardFilters {
  lodges: string[]; enterprises: string[]; countries: string[];
  seasonStart?: string; seasonEnd?: string; seasonLabel?: string;
}
const EMPTY: DashboardFilters = { lodges: [], enterprises: [], countries: [] };

interface FilterCtx { filters: DashboardFilters; setFilters: React.Dispatch<React.SetStateAction<DashboardFilters>>; filterKey: string; activeCount: number; }
const Ctx = createContext<FilterCtx | null>(null);
export const useFilters = (): FilterCtx => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useFilters must be used within FilterProvider');
  return c;
};
export const FilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [filters, setFilters] = useState<DashboardFilters>(EMPTY);
  const filterKey = JSON.stringify(filters);   // útil como key/dep para re-fetch cuando cambian filtros
  const activeCount = filters.lodges.length + filters.enterprises.length + filters.countries.length + (filters.seasonStart ? 1 : 0);
  return <Ctx.Provider value={{ filters, setFilters, filterKey, activeCount }}>{children}</Ctx.Provider>;
};

// ── Campo (label con ícono de marca + control) ──
const uniq = (arr: (string | undefined)[]) => [...new Set(arr.map(s => (s || '').trim()).filter(Boolean))].sort();
const Field: React.FC<{ icon: React.ElementType; label: string; className?: string; children: React.ReactNode }> = ({ icon: Icon, label, className, children }) => (
  <div className={className}>
    <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3.5 w-3.5 text-brand" />{label}
    </label>
    {children}
  </div>
);

// ── La barra ── (panel bordeado, NO overlay: rounded-xl border bg-muted/20 p-3)
export const FilterBar: React.FC<{ dateMode?: 'none' | 'season'; lodges: {name:string; Tipo_L:string; Pais:string}[] }> = ({ dateMode = 'none', lodges }) => {
  const { filters, setFilters, activeCount } = useFilters();
  const lodgeOpts   = useMemo(() => uniq(lodges.map(l => l.name)).map(v => ({ label: v, value: v })), [lodges]);
  const entOpts     = useMemo(() => uniq(lodges.map(l => l.Tipo_L)).map(v => ({ label: v, value: v })), [lodges]);
  const countryOpts = useMemo(() => uniq(lodges.map(l => l.Pais)).map(v => ({ label: v, value: v })), [lodges]);
  const set = (patch: Partial<DashboardFilters>) => setFilters(prev => ({ ...prev, ...patch }));
  return (
    <div className="mb-5 rounded-xl border bg-muted/20 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field icon={MapPin} label="Lodge" className="w-full sm:w-48">
          <MultiCombobox options={lodgeOpts} value={filters.lodges} onChange={v => set({ lodges: v })} placeholder="Todos" searchPlaceholder="Buscar lodge…" />
        </Field>
        <Field icon={Building2} label="Empresa" className="w-full sm:w-44">
          <MultiCombobox options={entOpts} value={filters.enterprises} onChange={v => set({ enterprises: v })} placeholder="Todas" searchPlaceholder="Buscar empresa…" />
        </Field>
        <Field icon={Globe2} label="País" className="w-full sm:w-40">
          <MultiCombobox options={countryOpts} value={filters.countries} onChange={v => set({ countries: v })} placeholder="Todos" searchPlaceholder="Buscar país…" />
        </Field>
        {dateMode === 'season' && (
          <Field icon={CalendarRange} label="Temporada / Mes" className="w-full sm:w-44">
            <SeasonPicker />   {/* ver abajo — opcional/dominio-específico */}
          </Field>
        )}
        {activeCount > 0 && (
          <button onClick={() => setFilters(EMPTY)} className="flex h-10 items-center gap-1 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
            <X className="h-3.5 w-3.5" /> Limpiar
          </button>
        )}
      </div>
    </div>
  );
};

// ── El botón toggle ── (vive a la derecha del header/tab bar)
export const FilterToggle: React.FC<{ open: boolean; onToggle: () => void }> = ({ open, onToggle }) => {
  const { activeCount } = useFilters();
  return (
    <button onClick={onToggle}
      className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${open ? 'border-brand/30 bg-brand/[0.06] text-brand' : 'bg-background text-muted-foreground hover:text-foreground'}`}>
      <SlidersHorizontal className="h-4 w-4 text-brand" /> Filtros
      {activeCount > 0 && <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">{activeCount}</span>}
      {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
    </button>
  );
};
```

**Anatomía visual (memorizá estas 4 clases, son las que dan el "look"):**
- Barra contenedora: `mb-5 rounded-xl border bg-muted/20 p-3` + fila `flex flex-wrap items-end gap-3`.
- Cada campo: label `text-[11px] font-semibold uppercase tracking-wider text-muted-foreground` con ícono `text-brand h-3.5 w-3.5`, ancho `w-full sm:w-{40..48}` (full en mobile, fijo en desktop → los campos se apilan solos en mobile).
- Control: `MultiCombobox` (multi-dimensión) — NO un `<select>` nativo.
- Toggle activo: `border-brand/30 bg-brand/[0.06] text-brand` + badge de conteo `rounded-full bg-brand text-white`.

**Reglas del patrón de filtros:**
1. **No es modal.** Es una barra inline que se colapsa. En mobile los campos se apilan (`w-full`), no se abre un overlay.
2. El **conteo de filtros activos** (`activeCount`) va en el badge del toggle Y habilita el botón "Limpiar" dentro de la barra.
3. El estado vive en `FilterProvider`; las vistas leen `filters` y filtran su data. `filterKey` (string) sirve como dependencia para re-fetch/`useMemo`.
4. "Limpiar" resetea a `EMPTY` (no borra campo por campo).
5. Si de verdad necesitás el filtro como panel emergente en mobile (pantallas muy chicas), usá el **drawer** de 4.3 — no un modal centrado. Pero por defecto, barra colapsable.

**`SeasonPicker`** (opcional, dominio-específico de temporadas Sep→Ago): dropdown propio (no `Select`) anclado al campo, con botones de temporada arriba (`bg-brand text-white` el activo), separador, opción "Toda la temporada", y una grilla `grid-cols-4` de meses agrupados por año. Trigger: `flex h-10 w-full items-center justify-between rounded-md border bg-background px-3 text-sm hover:border-brand/50`. Panel: `absolute z-50 mt-1 w-64 rounded-lg border bg-popover p-2 shadow-lg`. Si tu app no maneja temporadas, reemplazalo por un `DatePicker` (3.x) o dos inputs de rango.

---

## 5. Mobile / Responsive

Todo el responsive es **CSS/Tailwind puro** — no hay `useMediaQuery`/`matchMedia`. El único estado JS "mobile" es el del drawer de navegación. Esta sección es el manual completo de adaptación a pantalla chica.

### 5.1 Breakpoints — los tres dialectos

Tailwind default: `sm` 640px · `md` 768px · `lg` 1024px · `xl` 1280px. En este kit cada zona corta en un breakpoint distinto — **elegí el correcto según el tipo de pantalla**:

| Zona | Corta en | Por qué |
|---|---|---|
| **Vistas de negocio** (listas, tablas, toolbars, formularios) | `md` (768px) | Tabla↔cards, título de página, reflow de toolbar |
| **Dashboards** (charts, KPIs, filtros) | `sm` (640px) | Reflow `flex-col gap-3 sm:flex-row`, grids `grid-cols-2 sm:grid-cols-4` |
| **Carrito / catálogo POS / bottom-sheets** | `lg` (1024px) | El sheet sigue siendo sheet en tablet; panel lateral solo en desktop grande |
| Columnas terciarias de tabla | `sm`/`md`/`lg` escalonado | Disclosure progresivo de columnas |

`xl:` casi no se usa (solo 4ª columna de catálogos). `2xl:` no se usa. Regla mental: **`sm:` reordena flex (col→row) y botones (full→auto); `md:` muestra/oculta bloques (tabla vs card); `lg:` controla columnas terciarias y la transformación sheet→panel.**

### 5.2 Toolbar responsive (el patrón que se repite en cada vista)

```tsx
<div className="flex items-center gap-2 flex-wrap lg:justify-end">
  {/* Search: llena la fila en mobile, ancho fijo en desktop */}
  <div className="relative flex-1 sm:w-56 sm:flex-none min-w-[7rem]">
    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
    <Input placeholder="Buscar…" className="pl-8 h-9 text-sm" />
  </div>
  {/* Filtro: idem, mitad de ancho en desktop */}
  <div className="flex-1 sm:flex-none sm:w-40"><Select … /></div>
  {/* Botón que colapsa a solo-ícono en mobile */}
  <Button variant="outline" className="h-9 px-3 gap-1.5 shrink-0">
    <Plus className="h-3.5 w-3.5" /><span className="hidden sm:inline">Nuevo</span>
  </Button>
</div>
```

**Reglas:**
- Contenedor `flex items-center gap-2 flex-wrap lg:justify-end` (wrap en mobile, alineado a la derecha en desktop).
- Search: `relative flex-1 sm:w-56 sm:flex-none min-w-[7rem]`.
- **Botón → ícono**: envolver el label en `<span className="hidden sm:inline">`. El botón queda `h-9 px-3 gap-1.5`.
- Header de página: `flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3`, y el título va en `<div className="hidden md:block">` (el nombre del módulo ya vive en el header mobile).

### 5.3 Grids responsive canónicos

| Uso | Clase |
|---|---|
| **Fila de KPIs** | `grid grid-cols-2 sm:grid-cols-4 gap-3` (dashboard) / `grid-cols-2 md:grid-cols-3 lg:grid-cols-5` |
| **Campos de formulario** | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| **Secciones de form anchas** | `grid grid-cols-1 md:grid-cols-2 gap-8` |
| **Catálogo de productos (POS)** | `grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3` |
| **Charts: uno grande + uno chico** | `grid grid-cols-1 lg:grid-cols-3` + `lg:col-span-2` en el grande |
| **Dos charts/rankings iguales** | `grid grid-cols-1 lg:grid-cols-2 gap-4` |
| **Master-detail (sidebar fija + contenido)** | `grid grid-cols-1 lg:grid-cols-[340px_1fr]` |

### 5.4 Tablas → cards en mobile

Se renderizan **dos bloques paralelos** sobre el mismo array (no hay transform CSS). Ver receta en 7.1. Dos técnicas complementarias:

**a) Disclosure progresivo de columnas** (para no duplicar todo): ocultá columnas secundarias por viewport y mostrá el dato como subtítulo en mobile.
```tsx
{/* Columna que aparece recién en pantallas grandes */}
<TableHead className="hidden lg:table-cell">Color</TableHead>
…
<TableCell className="hidden sm:table-cell">{marca}</TableCell>
{/* Mismo dato plegado como subtítulo SOLO en mobile, dentro de la celda primaria */}
<TableCell>
  {nombre}
  <div className="sm:hidden text-[10px] text-muted-foreground">{marca}</div>
</TableCell>
```
Escala: `hidden sm:table-cell` (aparece ≥640) → `hidden md:table-cell` (≥768) → `hidden lg:table-cell` (≥1024). Cuanto menos importante la columna, más tarde aparece.

**b) Card mobile de fila** (contraparte completa de la tabla):
```tsx
<div className="rounded-lg border bg-card p-3 shadow-sm active:scale-[0.99] transition-all">
  <div className="flex items-start justify-between gap-2">{/* código + total + chevron */}</div>
  {/* filas semánticas: avatar+nombre, luego métricas con íconos + fecha muted */}
</div>
```

### 5.5 Modales en mobile — NO son full-screen

Los modales **siguen siendo cards centradas** en mobile (no hay `rounded-none` en el kit). Lo que los adapta:
- Overlay con `p-4` → gutter de 16px para que la card no toque los bordes.
- Panel `w-full max-w-* max-h-[90vh] flex flex-col overflow-hidden` → ocupa el ancho disponible, el body scrollea.
- **Footer de botones**: `flex flex-col sm:flex-row` con cada botón `w-full sm:w-auto` (apilados full-width en mobile → en línea en desktop). El submit suele llevar `min-w-[140px]`.

### 5.6 Bottom-sheet (carrito / selección acumulable)

Un **único elemento** que es sheet en mobile y panel lateral en desktop. Se repite idéntico en POS, In/Out y Reposición.

```tsx
<div className={cn(
  'flex flex-col bg-card border overflow-hidden transition-transform duration-300 ease-out',
  'fixed inset-x-0 bottom-0 z-50 max-h-[85vh] rounded-t-2xl shadow-2xl',
  'lg:relative lg:inset-auto lg:z-auto lg:w-96 lg:max-h-none lg:h-auto lg:shrink-0 lg:rounded-lg lg:shadow-xl lg:translate-y-0',
  cartOpen ? 'translate-y-0' : 'translate-y-[calc(100%_-_3.5rem)]'  // peek 56px vs expandido
)}>
  {/* Grab-handle / peek bar — solo mobile */}
  <button className="lg:hidden shrink-0 w-full h-14 flex items-center gap-2.5 px-4 border-b bg-card">
    {/* colapsado: ícono carrito + (count) + total + ChevronUp; expandido: <span className="mx-auto h-1.5 w-12 rounded-full bg-muted-foreground/25"/> */}
  </button>
  {/* … contenido del carrito … */}
</div>
{/* Backdrop mobile-only cuando está expandido */}
{cartOpen && <div className="lg:hidden fixed inset-0 z-40 bg-black/40 animate-in fade-in duration-200" onClick={close} />}
```

**Gotcha crítico** (comentado en el código fuente): usá **solo `fixed` + `lg:relative`**, nunca una clase `relative` suelta junto a `fixed` — Tailwind emite `.relative` después de `.fixed` y ambas juntas resuelven a `relative`, rompiendo el sheet mobile. El catálogo detrás reserva espacio para la peek bar con `pb-20 lg:pb-2` (o `pb-24`).

### 5.7 Floating action bar (barra de acción fija, siempre visible)

Para formularios largos / selección masiva: barra fija al pie de un contenedor `relative`.
```tsx
<div className="absolute bottom-0 left-0 right-0 p-3 md:p-4 bg-background/95 backdrop-blur-xl border-t z-20 shadow-[0_-8px_30px_rgba(0,0,0,0.12)]">
  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">{/* resumen + botones */}</div>
</div>
```
El contenido scrolleable reserva espacio con `pb-28 md:pb-24` (o `pb-32`/`pb-36` según el alto de la barra).

### 5.8 Vista full-height (100dvh)

Para vistas que ocupan toda la pantalla sin doble scroll, usar **`dvh`** (dynamic viewport height, maneja la barra dinámica del browser mobile):
```
h-[calc(100dvh-96px)] md:h-[calc(100vh-140px)]
```
En mobile `dvh` menos 96px (header fijo 64px + gutters); en desktop `vh` menos 140px.

### 5.9 `md:contents` — reestructurar toolbars

Truco para que un subgrupo de controles sea **grid 2-columnas en mobile** y **fila inline en desktop** con el mismo markup: envolvelo en un contenedor y disolvé el wrapper en desktop con `md:contents`.
```tsx
<div className="grid grid-cols-2 gap-2 md:contents">
  <Select … /><Select … />  {/* en mobile: 2 columnas; en desktop: participan directo en el flex padre */}
</div>
```

### 5.10 Navegación mobile (drawer izquierdo)

En mobile el sidebar desaparece (`hidden md:flex`) y se reemplaza por:
- **Header fijo**: `md:hidden fixed top-0 left-0 right-0 h-16 bg-background border-b z-30 flex items-center justify-between px-4` — hamburguesa (`Menu h-6 w-6`) + nombre del módulo (`truncate text-lg font-bold`) a la izquierda; username (`max-w-[45vw] truncate`) + Avatar a la derecha.
- **Drawer izquierdo** (vía `useModalAnimation`): contenedor `md:hidden fixed inset-0 z-40`; backdrop `absolute inset-0 bg-black/60 backdrop-blur-sm`; panel `absolute left-0 top-0 flex h-full w-[280px] max-w-[85vw] flex-col border-r bg-card shadow-2xl` + clase `drawer-enter-left`/`drawer-exit-left`. Adentro: logo + X, selector de tenant, nav, footer con language switcher + logout.
- **Contenido**: `flex-1 overflow-auto p-3 md:p-8 mt-16 md:mt-0` (el `mt-16` despeja el header fijo).

No hay bottom-nav bar — la navegación mobile es hamburguesa + drawer.

### 5.11 Catálogo de show/hide por viewport

| Clase | Efecto |
|---|---|
| `hidden md:block` / `hidden md:flex` / `hidden md:table` | Oculto en mobile, visible ≥md (bloque desktop, tabla) |
| `md:hidden` | Visible en mobile, oculto ≥md (cards, peek bar) |
| `hidden sm:inline` | Label de botón: solo-ícono en mobile |
| `hidden sm/md/lg:table-cell` | Disclosure progresivo de columnas |
| `sm:hidden` | Subtítulo mobile-only (fold-into-subtitle) |
| `lg:hidden` | Backdrop / peek bar del bottom-sheet |
| `hidden lg:block` | Bloque usuario en header desktop (solo pantallas grandes) |

### 5.12 Texto y spacing responsive

- **Gutters**: `p-3 md:p-8` (contenido), `p-3 sm:p-4`, `px-4 sm:px-6`. Regla: apretado en mobile → holgado en desktop.
- **Gaps**: `gap-2 md:gap-4`, `gap-3 sm:gap-4`.
- **Texto**: `text-sm sm:text-base` (cuerpo), `text-sm sm:text-2xl` (números grandes que crecen), `text-lg sm:text-xl` (títulos). Los `CardTitle` son fijos.
- **Bottom-padding para barras fijas**: `pb-28/32/36 md:pb-24` (action bar) o `pb-20/24 lg:pb-2` (bottom-sheet).

### 5.13 Touch targets y safe areas — deuda a cubrir

- **Tap targets**: el kit usa `h-9` (36px) e íconos-botón `h-8` (32px) en toolbars, **por debajo del mínimo táctil recomendado (44px)**. Feedback táctil solo con `active:scale-[0.99]` en cards. Para una app nueva táctil-first, considerá subir controles primarios a `h-11` (44px).
- **Safe areas / notch**: el kit **no** usa `env(safe-area-inset-*)` ni `viewport-fit=cover`. En iOS con notch/home-indicator puede haber corte. Si la app es PWA/mobile-heavy, agregá `viewport-fit=cover` al meta y `pb-[env(safe-area-inset-bottom)]` a las barras fijas inferiores.

---

## 6. Formularios y edición

Patrones de formulario más allá de los primitivos. El kit los prescribe canónicos (el código real tiene drift entre archivos).

### 6.1 Labels, secciones y cajas de agrupación

```tsx
{/* Label de campo (canónico) */}
<label className="text-xs font-medium text-muted-foreground mb-1 block">Nombre</label>
{/* Variante uppercase (dashboards / cash modals) */}
<label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Monto</label>

{/* Heading de sección con ícono */}
<h3 className="text-sm font-semibold flex items-center gap-2 text-foreground"><Tag className="h-4 w-4" /> Datos básicos</h3>

{/* Caja de agrupación (fieldset destacado) */}
<div className="space-y-3 p-4 bg-secondary/20 rounded-lg border border-border/50">…</div>
{/* Variante dashed */}
<div className="space-y-2 p-3 bg-muted/20 rounded-md border border-dashed">…</div>
```
Layout: `grid grid-cols-1 sm:grid-cols-2 gap-4`, campo full-width con `col-span-1 sm:col-span-2`. Header de modal `px-6 py-4 border-b bg-secondary/20`, footer `p-4 border-t bg-muted/20 flex flex-wrap justify-end gap-2`.

### 6.2 Marca de requerido, error de campo, banner y borde inválido

```tsx
{/* Asterisco de requerido */}
<label>Categoría<span className="text-destructive ml-0.5">*</span></label>

{/* Error por campo */}
{err && <p className="text-[10px] text-destructive flex items-center gap-1 mt-1"><AlertCircle className="h-3 w-3 shrink-0" /> {err}</p>}

{/* Borde rojo en inválido (concatenar condicionalmente en el Input) */}
<Input className={cn(invalid && "border-destructive focus:border-destructive focus:ring-destructive/30")} />

{/* Banner de error de formulario (arriba del form o en footer) */}
<div className="p-3 bg-destructive/10 border-l-4 border-destructive text-destructive text-sm font-medium rounded-r-md flex items-center gap-2">
  <AlertCircle className="h-4 w-4 shrink-0" /> {mensaje}
</div>
```
La "validación" del kit es negar el submit: `disabled={!name || !price || saving}`. Prescripción para apps nuevas: usar estos átomos + agregar `aria-invalid` y `role="alert"` (el código actual no los tiene — deuda de accesibilidad).

### 6.3 Textarea

No hay primitivo; usá esta clase (base del kit):
```tsx
<textarea rows={3} maxLength={1000}
  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none" />
```
Siempre `resize-none`. Convención de `maxLength`: 500 (notas cortas) / 1000 (observaciones).

### 6.4 Checkbox (custom) y checkbox nativo

```tsx
{/* Checkbox custom (canónico — el de MultiCombobox) */}
<span className={cn("h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
  checked ? "bg-primary border-primary text-primary-foreground" : "border-input bg-background")}>
  {checked && <Check className="h-3 w-3" />}
</span>

{/* Checkbox nativo (cuando alcanza) — usar el token de marca */}
<input type="checkbox" className="h-4 w-4 rounded border-input accent-brand cursor-pointer" />
```
> No existen radios en el código — el rol de "selección única" se implementa como **card/pill seleccionable** (6.5). Usá `accent-brand`, no `accent-[#800020]`.

### 6.5 Card/pill seleccionable (radio-like)

```tsx
{/* Card seleccionable (selección única, ej. método de pago) */}
<button className={cn("rounded-lg border p-3 transition-colors text-left",
  selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-input hover:bg-muted/30")}>…</button>

{/* Pill seleccionable (chips de tipo/categoría) */}
<button className={cn("flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium border transition-colors",
  active ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-input hover:bg-accent hover:text-accent-foreground")}>…</button>
```

### 6.6 Segmented control (toggle de modos)

El `Tabs`/`TabsList` (3.7) es la versión formal. La versión inline recurrente:
```tsx
<div className="inline-flex items-center rounded-lg bg-muted p-1">
  {modes.map(m => (
    <button key={m.v} onClick={() => setMode(m.v)}
      className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-all",
        mode === m.v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
      {m.label}
    </button>
  ))}
</div>
```
Variante semántica (rojo/verde para gasto/ingreso): activo `bg-red-50 text-red-600 shadow-sm` / `bg-emerald-50 text-emerald-600 shadow-sm`.

### 6.7 Quantity stepper (+/-)

```tsx
{/* Compacto (carrito) */}
<div className="flex items-center gap-1 bg-secondary rounded-md p-0.5">
  <button className="p-1 hover:bg-background rounded shadow-sm disabled:opacity-50" onClick={dec}><Minus className="h-3 w-3" /></button>
  <Input type="number" inputMode="numeric" className="w-12 h-7 text-center text-xs px-1" value={qty} onChange={…} />
  <button className="p-1 hover:bg-background rounded shadow-sm disabled:opacity-50" onClick={inc}><Plus className="h-3 w-3" /></button>
</div>
{/* Outline (formularios) */}
<Button variant="outline" size="icon" className="h-8 w-8 shrink-0"><Minus className="h-3.5 w-3.5" /></Button>
```
Input numérico limpio (sin flechas del browser): `[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`. Deshabilitar botones en los límites.

**Dinero vs cantidad:** montos en `$` → `MoneyInput` + `parseMoney` (nunca `type="number"`); cantidades/unidades → `type="number"` + `parseInt`/`parseNum`.

### 6.8 Password input (show/hide)

```tsx
<div className="relative">
  <Input type={show ? "text" : "password"} className="pr-10" />
  <button type="button" onClick={() => setShow(!show)}
    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none">
    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
  </button>
</div>
```

### 6.9 File / image upload (dropzone + preview + compresión)

**Dropzone** (drag&drop + click):
```tsx
<label onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
  className="flex flex-col items-center justify-center gap-1.5 h-24 rounded-lg border-2 border-dashed border-input bg-muted/10 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors text-center">
  <input type="file" accept="image/*" onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }} className="hidden" />
  <Upload className="w-5 h-5 text-muted-foreground/50" />
  <span className="text-xs text-muted-foreground">Arrastrá o hacé click</span>
</label>
```
**Estado con imagen** (fila con thumb + acciones): `flex items-center gap-3 rounded-lg border border-input bg-muted/20 p-2.5`, thumb `h-12 w-12 rounded-md object-cover border shrink-0`, botones `h-8 w-8 rounded-md border border-input` (borrar: `hover:text-destructive hover:bg-destructive/10`).

**Compresión** (obligatoria antes de subir imágenes) — `utils/imageCompression.ts`:
```ts
export async function fileToCompressedDataUrl(file: File, maxDim = 1600, quality = 0.7): Promise<string> {
  // FileReader → <img> → canvas escala al lado mayor = maxDim → toDataURL('image/jpeg', quality)
  // devuelve el string más chico entre el comprimido y el original; nunca rechaza ('' = sin imagen)
}
```
Thumbnails más agresivos: `maxDim 1280, quality 0.6`. HEIC→JPEG lazy con `import('heic2any')` cuando haga falta OCR.

**Preview por URL** (imagen que puede fallar): `<img onError={e => (e.target as HTMLImageElement).style.display='none'} onLoad={e => (e.target as HTMLImageElement).style.display='block'} className="h-20 w-20 object-cover rounded-md border" />`.

### 6.10 Campos calculados en vivo y read-only

```tsx
{/* Valor derivado con color por signo */}
<div className={cn("text-lg font-bold", val >= 0 ? "text-emerald-600" : "text-red-500")}>${val.toFixed(2)}</div>

{/* Caja read-only calculada (mono) */}
<div className="h-10 rounded-md border border-input bg-muted/30 px-3 flex items-center text-sm font-mono">{calc}</div>

{/* Campo bloqueado por rol/estado (reemplaza al input) */}
<div className="flex h-10 items-center px-3 rounded-md border border-input bg-muted text-sm font-medium text-muted-foreground">{valorFijo}</div>
```
Recalcular derivados en `useEffect`/`useMemo`. Total al pie: `text-lg font-bold font-mono text-brand`.

### 6.11 Inline editing en tablas

Dos modos:
- **Save/cancel por fila**: botón `Edit` (ghost) activa un `<Input>` inline (`h-8 w-20 text-center`, `autoFocus`, Enter=confirmar/Escape=cancelar), con botones `Check` (emerald) / `X` (muted). Ej. el conteo físico de stock.
- **Commit global**: inputs editables en cada fila + un botón `Save` en el header que persiste todo (sin Check/X por fila). Fila en edición resaltada `bg-primary/5`.

### 6.12 Editable line-items (renglones con total derivado)

Tabla de líneas dinámicas (recetas, órdenes, facturas):
- **Agregar**: `<Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-1" /> Agregar línea</Button>`.
- **Quitar**: `<Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>` (o soft-delete con toggle `Trash2`↔`RotateCcw`).
- Selección de ítem: `Combobox` (searchable). Cantidad: stepper o `type="number"`. Precio: `MoneyInput`.
- Costo/total por línea derivado en `text-sm font-mono` (fallback `—`); total general en `useMemo`.
- Doble layout: `<Table>` en desktop, cards apiladas en mobile (mismo array).

---

## 7. Datos, tablas y listas

### 7.1 Tabla estándar (con cards mobile)

```tsx
{loading ? (
  <div className="flex items-center justify-center py-20"><Loader size="lg" text="Cargando…" subtext={ctx} /></div>
) : rows.length === 0 ? (
  <EmptyState icon={Package} text="Sin resultados" />   // ver 9.3
) : (
  <>
    <div className="md:hidden space-y-2">{rows.map(r => <RowCard key={r.id} row={r} />)}</div>
    <Card className="hidden md:block border shadow-sm">
      <Table>
        <TableHeader><TableRow><TableHead>…</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map(r => <TableRow key={r.id}><TableCell>…</TableCell></TableRow>)}</TableBody>
      </Table>
    </Card>
  </>
)}
```

### 7.2 Celdas especiales

- **2 líneas** (valor + metadato): `<div><div className="font-medium">{a}</div>{b && <div className="text-[10px] text-muted-foreground">{b}</div>}</div>`.
- **Numérica**: `text-right tabular-nums` (agregá `font-mono` en grids densos). Monto destacado: `font-semibold tabular-nums text-brand`.
- **Color por signo**: `cn(v < 0 ? "text-red-600" : "text-emerald-600")`, con prefijo `+`/`-`.
- **Diff como chip**: `cn("px-2 py-0.5 rounded-full text-xs font-semibold", diff < 0 ? "bg-red-100 text-red-700" : diff > 0 ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground")`.
- **Estado**: `StatusBadge` (3.11).

### 7.3 Filas de total

No hay `<tfoot>` en el kit. Opciones:
- **Barra de N columnas** (debajo de la tabla): `<div className="grid grid-cols-2 gap-px border-t bg-border sm:grid-cols-4">` con cada celda `bg-muted/30 px-4 py-2.5` (label `text-[10px] uppercase text-muted-foreground` + valor `text-sm font-bold tabular-nums`). El `gap-px bg-border` dibuja las hairlines.
- **Chips de total** (grid views): cada uno `rounded-lg border bg-card px-3 py-1.5` con label uppercase + `<b className="tabular-nums">`.
- **Footer de total en modal**: `border-t-2 border-foreground/15 bg-muted/40 px-6 py-4`, línea Total en `font-bold` con monto `text-brand tabular-nums`.

### 7.4 Paginación (client-side)

```tsx
const PAGE_SIZE = 30;
const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
const safePage = Math.min(page, pageCount - 1);           // page es 0-based
const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
// setPage(0) en cada cambio de búsqueda/filtro
```
```tsx
<div className="flex items-center gap-1">
  <button disabled={safePage === 0} onClick={() => setPage(p => Math.max(0, p - 1))}
    className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:bg-muted disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
  <span className="text-sm text-muted-foreground px-1">Página {safePage + 1}/{pageCount}</span>
  <button disabled={safePage >= pageCount - 1} onClick={() => setPage(p => p + 1)} className="…"><ChevronRight className="h-4 w-4" /></button>
</div>
```

### 7.5 Header ordenable

```tsx
const SortIcon = ({ field }: { field: string }) =>
  sortField !== field ? <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />
  : sortDir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;

<TableHead>
  <button className="flex items-center hover:text-foreground transition-colors" onClick={() => handleSort('name')}>
    Nombre <SortIcon field="name" />
  </button>
</TableHead>
```

### 7.6 Row actions

Íconos `ghost` right-aligned en la última columna; usar color semántico por acción, y `e.stopPropagation()` si la fila entera es clickeable.
```tsx
<TableCell className="text-right"><div className="flex justify-end gap-1">
  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"><Eye className="h-4 w-4" /></Button>
  <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"><Check className="h-4 w-4" /></Button>
  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button>
</div></TableCell>
```

### 7.7 Selección de filas + barra de acción masiva

Checkbox de "seleccionar todo" en el header + `accent-brand` por fila; fila seleccionada `bg-primary/5`. Al pie, la **floating action bar** (5.7) con el conteo (`{sel.size} seleccionados`) y el botón bulk (`bg-red-600 text-white` para void, o `bg-emerald-600` para dispatch).

### 7.8 Filas agrupadas / expandibles

- **Subheader de grupo** (`colSpan`): `<TableRow><TableCell colSpan={cols} className="bg-muted/50 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{grupo}</TableCell></TableRow>`. Preservá el orden de primera aparición.
- **Fila expandible** (acordeón): fila `cursor-pointer hover:bg-muted/50` con chevron; al expandir, `<TableRow><TableCell colSpan={cols} className="p-0 border-b"><div className="p-4 bg-muted/10">…</div></TableCell></TableRow>`.

### 7.9 Cards de datos

- **Card de fila mobile**: `rounded-lg border bg-card p-3 shadow-sm` (header `flex items-start justify-between`, footer `mt-2 pt-2 border-t`).
- **Card de sector con sparkline** (tipo Home): `Card cursor-pointer hover:border-brand/30 hover:shadow-md`, ícono en tile `h-8 w-8 rounded-lg bg-brand/10`, sparkline `<AreaChart>` de `h-[52px]`, footer de métricas `border-t pt-2.5`.
- **cornerStat** (pill de métrica en esquina): `inline-flex items-baseline gap-1 rounded-full px-2.5 py-1 bg-brand/10` con valor `text-sm font-bold tabular-nums text-brand` + label `text-[10px] uppercase`. Variante ámbar (`bg-amber-100 text-amber-700`) si necesita atención.

### 7.10 Grid views + export XLSX

Las "grid views" (dashboards de datos) usan `<table>` crudo con `<th>` sticky (no los primitivos), scroll horizontal en todos los tamaños (sin cards mobile), altura por `useFillHeight()`:
```tsx
// <th> sticky canónico (repetir en cada columna)
<th className="sticky top-0 z-10 whitespace-nowrap bg-muted/60 px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur">…</th>
// fila
<tr className="border-b align-top last:border-0 hover:bg-muted/30">…</tr>
```
**Export XLSX** (patrón estándar con `xlsx`):
```tsx
import * as XLSX from 'xlsx';
const handleExport = () => {
  const ws = XLSX.utils.json_to_sheet(filtered.map(r => ({ … })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Datos');
  XLSX.writeFile(wb, `Datos_${label}.xlsx`);
};
<Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport} disabled={!filtered.length}><Download className="h-4 w-4" /> XLS</Button>
```

### 7.11 KPI cards — usar `KpiCard`

Hay varias definiciones casi-idénticas en el código (dashboard, maintenance, performance). **Canónico = `KpiCard` de `dashboard/shared.tsx`** (ver 10.2). Para el tile con ícono en cuadro de color:
```tsx
<Card className="border shadow-sm"><CardContent className="p-4 flex items-center justify-between">
  <div><p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p><p className="text-2xl font-bold" style={{ color }}>{value}</p></div>
  <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", iconBg)}><Icon className={cn("h-4 w-4", iconColor)} /></div>
</CardContent></Card>
```

---

## 8. Overlays, capas (z-index) y navegación

### 8.1 Familias de overlay

El kit unifica en **una** familia canónica (estándar). Las otras dos existen en el código pero no las repliques:
- **✅ Estándar** (usar siempre): `bg-black/60 backdrop-blur-sm` + `useModalAnimation` (o `animate-in fade-in`/`zoom-in-95`) + `backdropClose`.
- **Lightbox** (preview de imagen/PDF): `bg-black/80 backdrop-blur-sm`.
- ⚠️ Dashboard detail modals: `bg-black/40` sin blur, `z-[1000]`, `rounded-2xl` — familia aparte para drill-downs anchos (`max-w-[1200px]`).

### 8.2 Escala de z-index (usar estos tokens)

Definí constantes y respetalas — el código real tiene una mezcla desprolija; esta es la escala saneada:

```
z-nav           = z-20     sidebar desktop, action bars sticky
z-mobile-header = z-30     header mobile, overlays scoped (charging)
z-mobile-drawer = z-40     drawer de navegación mobile, backdrops de bottom-sheet
z-overlay       = z-50     drawers de detalle, bottom-sheet, dropdowns de nav
z-modal         = z-[60]   modal de formulario estándar
z-modal-nested  = z-[70]   sub-modal dentro de un modal
z-modal-top     = z-[80]   confirm/lightbox sobre un sub-modal
z-popover       = z-[90]   popovers sin backdrop (menús contextuales)
z-confirm       = z-[100]  ConfirmModal (por encima de cualquier form modal)
z-save-overlay  = z-[110]  overlay de guardado full-screen
z-success       = z-[120]  SuccessCard
z-toast         = z-[130]  toasts
z-tooltip       = z-[140]  tooltip global
```
> El código actual usa valores mucho más altos y superpuestos (`z-[9999]`, `z-[10000]`, `zIndex:999999`). Los dropdowns portaled (`zIndex:999999`) hoy quedan por encima de todo, incluso tooltips — un repo nuevo debería usar la escala de arriba y que los popovers portaled usen `z-popover`/`z-tooltip`, no un número gigante.

### 8.3 Variantes de modal (además del form estándar de 4.1)

| Variante | Tamaño | Particularidad |
|---|---|---|
| **Preview de archivo** | `max-w-5xl h-[90vh]` | overlay `bg-black/80`; `<iframe>` (PDF) o `<img>`; sin footer |
| **Checkout / 2 columnas** | `max-w-4xl` | header oscuro `bg-zinc-900 text-white`; izq scroll + der resumen `w-full lg:w-80 shrink-0` (footer en mobile) |
| **Master-detail** | `max-w-4xl`/`5xl` | body `w-full md:w-1/3` (form/resumen) + `md:w-2/3` (contenido), separados por `border-r` |
| **Reconciliation** (Cierre) | `max-w-md` | callout de color por diferencia (ver 11.2) |
| **Anidado** | según nivel | overlay `absolute inset-0` (scoped al padre) con `bg-black/20 backdrop-blur-[1px]` |
| **Cash-family** | `max-w-md`/`lg` | header `bg-gradient-to-br from-{accent}/5 to-transparent` + tile `h-10 w-10 rounded-xl`; `rounded-2xl` |

### 8.4 Popover portaled (patrón único para todo dropdown)

Todo menú/dropdown que deba escapar de `overflow:hidden` sigue este patrón (lo usan Select, Combobox, DatePicker, CategoryMultiSelect, menús de Layout):
1. `ref` en el trigger; al abrir, `getBoundingClientRect()` → guardar `{top,left,width}`.
2. `createPortal` a `document.body` con `style={{ position:'fixed'|'absolute', top, left, width, zIndex }}`.
3. Panel: `bg-popover text-popover-foreground border rounded-md shadow-md animate-in fade-in zoom-in-95 duration-100 overflow-hidden`.
4. Cierre por `mousedown` fuera (comparando `contains` de trigger y panel).
5. Flip vertical si no entra abajo; clamp horizontal si desborda (ver `Select`/`DatePicker` en 3.9).

**Prescripción**: extraé esto a un hook `useAnchoredPortal()` en vez de repetirlo (el código lo tiene duplicado en 5+ lugares).

### 8.5 Sidebar completo

- **Aside**: `hidden md:flex flex-col border-r bg-card transition-all duration-300 ease-in-out z-20`, ancho `isCollapsed ? "w-16" : "w-64"`.
- **Logo**: expandido (`h-7`) con botón de colapso al lado (`ChevronRight rotate-180`); colapsado (`h-8 w-8` icon) con botón de expandir sobre el logout.
- **Selector de tenant** (ej. lodge/sucursal): `Combobox` con búsqueda si el rol puede cambiar; texto fijo si no.
- **NavSection (grupos colapsables)**: acordeón con la técnica `grid-rows-[1fr]`/`grid-rows-[0fr]` (ver 9.6); header con chevron `-rotate-90` cuando cerrado. Grupo "en desarrollo": tono ámbar + pill `text-[8px] font-bold rounded-full bg-amber-100 text-amber-700 uppercase` con texto "soon", ítems `disabled` (`opacity-50 cursor-not-allowed`).
- **NavItem**: activo `bg-primary text-primary-foreground shadow-sm`, hover `hover:bg-accent hover:text-accent-foreground`, base `text-muted-foreground`. **Badge de contador**: expandido `ml-auto rounded-full bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px]`; colapsado `absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] ring-2 ring-card` (99+ si `>99`).
- **Flyout de sección colapsada**: portaled `z-popover`, `w-56 bg-popover border rounded-md shadow-md`, con dot rojo en el ícono si algún hijo tiene badge.
- **Logout**: `Button ghost text-destructive hover:bg-destructive/10`, pasa por `triggerNavigationGuard` antes de abrir `ConfirmModal`.

### 8.6 Header desktop, breadcrumb y language switcher

- **Header**: `hidden md:flex h-16 bg-background border-b items-center justify-between px-6 z-10`.
- **Breadcrumb**: `Entidad / Vista` → `<span className="font-medium text-foreground capitalize flex items-center gap-2">{tenant} <span className="text-muted-foreground/50">/</span> {vista}</span>`.
- **Language switcher (pills)**: contenedor `flex items-center bg-muted/50 rounded-full p-1 border`; cada pill `px-2 py-1 text-xs font-semibold rounded-full transition-all` con activo `bg-background text-foreground shadow-sm`; bandera `<img className="w-4 h-3 rounded-[2px]" />` (en mobile el activo usa `bg-primary text-primary-foreground`).
- **Bloque usuario**: `text-right hidden lg:block border-l pl-4` (nombre + rol) + `Avatar` con `bg-brand/10 text-brand`.

### 8.7 Tabs de navegación

- **Tab bar con underline animado** (dashboard): contenedor `mb-6 border-b`, tabs `flex gap-1 overflow-x-auto`, cada botón `relative px-4 py-3 text-sm font-medium transition-colors` (activo `text-brand`), underline `{active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}`. El panel activo usa `key={active}` para re-animar (`animate-in fade-in duration-300`).
- **Sub-nav de pills** (segmented anidado): `inline-flex items-center gap-1 rounded-xl border bg-muted/30 p-1`, pill activa `bg-background text-brand shadow-sm`.

### 8.8 navigationGuard (cambios sin guardar)

Singleton para interceptar navegación cuando hay cambios pendientes:
```ts
// utils/navigationGuard.ts
let guardFn: ((proceed: () => void) => void) | null = null;
export const setNavigationGuard = (fn: typeof guardFn) => { guardFn = fn; };
export const clearNavigationGuard = () => { guardFn = null; };
export const triggerNavigationGuard = (proceed: () => void): boolean => {
  if (guardFn) { guardFn(proceed); return false; }  // hay cambios → bloquea y muestra confirm
  return true;                                        // libre
};
```
La vista con cambios registra `setNavigationGuard(fn)` (donde `fn` abre un `ConfirmModal` de descartar y ejecuta `proceed` al confirmar). El sidebar/logout llaman `triggerNavigationGuard(go)` y hacen `e.preventDefault()` si devuelve `false`.

---

## 9. Feedback, estados y motion

### 9.1 Loading

- **Loader de marca** (`Loader`, 3.12): para fetch de página/lista. `<div className="flex items-center justify-center py-20"><Loader size="lg" text="…" subtext={ctx} /></div>`.
- **Spinner inline** (botones): `<Loader2 className="h-4 w-4 animate-spin" />` + `disabled`.
- **Overlay de guardado full-screen**: `fixed inset-0 z-save-overlay flex flex-col items-center justify-center bg-background/70 backdrop-blur-sm animate-in fade-in duration-200` con `<Loader text="Guardando…" />`.
- **Overlay scoped** (dentro de un panel `relative`): `absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/85 backdrop-blur-sm`.
- **Refresh silencioso** (recarga por cambio de filtro sin desmontar): atenuar el contenedor con `transition-opacity duration-300 ${isRefreshing ? 'opacity-60' : ''}` + `animate-spin` en el ícono de refresh.
- **No hay skeletons** en el kit. Si los necesitás, construilos con `animate-pulse bg-muted rounded`.

### 9.2 Barras de progreso

```tsx
{/* Determinada (%) */}
<div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
  <div className="h-full bg-primary rounded-full transition-all duration-300 ease-out" style={{ width: `${pct}%` }} />
</div>
{/* Indeterminada (usa keyframe upload-progress, 9.6) */}
<div className="absolute top-0 left-0 h-1 bg-primary animate-[upload-progress_2s_infinite]" />
{/* Timeline que se vacía (auto-dismiss, ver SuccessCard) */}
<div className="h-1.5 bg-muted overflow-hidden"><div className="h-full w-full bg-emerald-500 origin-left" style={{ animation: `scz-shrink ${ms}ms linear forwards` }} /></div>
```

### 9.3 Empty states

```tsx
{/* Canónico: border-dashed + ícono en círculo */}
<div className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-xl bg-muted/5">
  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4"><Icon className="w-8 h-8 text-muted-foreground/40" /></div>
  <p className="text-muted-foreground font-medium text-sm text-center">Sin resultados</p>
</div>
{/* Compacto (dentro de card/tabla): ícono opacity + texto */}
<div className="flex flex-col items-center py-12 text-center"><Icon className="h-10 w-10 text-muted-foreground/40 mb-3 stroke-1" /><p className="text-sm text-muted-foreground">Sin datos</p></div>
```

### 9.4 Banners / alertas inline

```tsx
{/* Acento lateral con progreso (ej. modo activo) */}
<div className="bg-amber-100 border-l-4 border-amber-500 text-amber-700 p-4 rounded-r shadow-sm">
  <div className="flex items-center justify-between gap-3"><div className="flex items-center"><AlertOctagon className="h-5 w-5 mr-2 shrink-0" /><p className="font-bold">Título</p></div><span className="text-xs font-semibold">{n}/{total}</span></div>
</div>
{/* Suave (info/warning/error/success) — patrón: bg-{c}-50 border border-{c}-200 text-{c}-700 */}
<div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-lg p-3 flex items-center gap-2 text-sm"><AlertTriangle className="h-4 w-4" /> …</div>
```
Colores: warning=amber, error=red/destructive, info=blue, success=emerald.

### 9.5 Success, confirmación y disabled

- **Success**: `SuccessCard` (3.15) para "operación confirmada, seguir en pantalla"; `useToast().showToast(msg, 'success')` para feedback fugaz; checkmark inline `<CheckCircle2 className="text-emerald-600 animate-in zoom-in duration-300" />`.
- **Confirmación destructiva**: `ConfirmModal` con `variant="danger"` (3.x / 4.2).
- **Disabled**: componentes del kit → `disabled:opacity-50 disabled:pointer-events-none` (Button) / `disabled:cursor-not-allowed disabled:opacity-50` (Input); botones-ícono custom (paginación, stepper) → `disabled:opacity-40`.

### 9.6 Motion — animaciones y keyframes

**Entrada (requieren `tailwindcss-animate`):**
| Contexto | Clases |
|---|---|
| Overlay de modal | `animate-in fade-in duration-200` |
| Panel de modal | `animate-in zoom-in-95 duration-200` |
| Dropdown/popover | `animate-in fade-in zoom-in-95 duration-100` |
| Toast | `animate-in slide-in-from-top-2 fade-in duration-200` |
| Contenido de tab | `animate-in fade-in slide-in-from-bottom-2` |
| Banner de error | `animate-in fade-in slide-in-from-top-2` |
| Reveal de campo en form | `animate-in slide-in-from-top-1 fade-in` |
| Entrada de página | `animate-in fade-in duration-500` |

**Salida**: no se usa `animate-out`; la salida de modales/drawers la maneja `useModalAnimation` + el CSS de `index.css` (`.modal-exit`, `.drawer-exit-*`).

**Nativas (siempre funcionan):** `animate-spin` (spinners), `animate-pulse` (heartbeat del Loader, cards en proceso), `animate-ping` (halos, live-dot `<span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />`).

**Transiciones**: `transition-colors` (default de botones/hover), `transition-all` (cards interactivas, switches), `transition-transform` (chevrons `rotate-180`/`-rotate-90`, imágenes). Duraciones: `duration-100` dropdowns · `150` overlays rápidos · `200` modales · `300` sub-tabs/grid-rows/barras · `500` páginas.

**Micro-interacciones**: `active:scale-[0.99]`/`[0.98]` (cards al tocar), `hover:shadow-md` (cards clicables), `group-hover:` (reveal de botón/color), `hover:scale-[1.01]` (botón submit del login).

**Keyframes custom** (inline `<style>` cuando el efecto es puntual):
```css
@keyframes scz-shrink { from { transform: scaleX(1); } to { transform: scaleX(0); } }        /* barra timeline SuccessCard */
@keyframes upload-progress { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }  /* barra indeterminada */
```
**Acordeón de altura** (única técnica de height-animation): envolver en `<div className={cn('grid transition-[grid-template-rows] duration-300 ease-in-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}><div className="overflow-hidden">…</div></div>`.

---

## 10. Dashboard — catálogo de charts

Extiende 4.6 (paleta `WINE`/`shade`, `KpiCard`, `SectionTitle`, `TooltipShell`/`TipRow`, `HBarList`, chart-en-card, area+gradiente, donut). Tipos adicionales:

### 10.1 Barras apiladas con signo (cashflow: ingresos arriba, egresos abajo)

Pre-calcular el negativo con signo invertido (`expensesNeg: -m.expenses`) y usar `stackOffset="sign"` + `ReferenceLine y={0}`:
```tsx
<BarChart data={data} stackOffset="sign" margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
  <CartesianGrid {...CHART_GRID} vertical={false} />
  <XAxis dataKey="label" tick={X_TICK} {...AXIS_LINE} interval="preserveStartEnd" minTickGap={10} />
  <YAxis tick={Y_TICK} {...AXIS_LINE} width={52} tickFormatter={moneyK} />
  <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1} />
  <Tooltip content={<FlowTip />} cursor={{ fill: 'rgba(128,0,32,0.04)' }} />
  <Bar dataKey="incomes"     fill="#2f9e6f" radius={[3,3,0,0]} maxBarSize={22} />  {/* positivo verde, redondea arriba */}
  <Bar dataKey="expensesNeg" fill={WINE}    radius={[0,0,3,3]} maxBarSize={22} />  {/* negativo marca, redondea abajo */}
</BarChart>
```

### 10.2 ComposedChart (Bar + Line con ejes duales)

```tsx
<ComposedChart data={data}>
  <CartesianGrid {...CHART_GRID} vertical={false} />
  <XAxis dataKey="lodge" tick={X_TICK} {...AXIS_LINE} interval={0} angle={-40} textAnchor="end" height={60} />
  <YAxis yAxisId="left"  tick={Y_TICK} {...AXIS_LINE} width={42} tickFormatter={moneyK} />
  <YAxis yAxisId="right" orientation="right" tick={Y_TICK} {...AXIS_LINE} width={36} domain={[0,100]} tickFormatter={v => `${v}%`} />
  <Tooltip content={<Tip />} />
  <Bar  yAxisId="left"  dataKey="sales" fill={WINE} radius={[3,3,0,0]} maxBarSize={34} />
  <Line yAxisId="right" type="monotone" dataKey="profitPct" stroke="#9ca3af" strokeWidth={2.5} dot={{ r: 2.5, fill: '#9ca3af' }} activeDot={{ r: 5 }} />
</ComposedChart>
```

### 10.3 LineChart — actual vs período anterior

Serie anterior gris punteada + serie actual sólida con dot:
```tsx
<Line type="monotone" dataKey="prevRevenue" stroke="#cbd5e1" strokeWidth={2} strokeDasharray="5 4" dot={false} />
<Line type="monotone" dataKey="revenue" stroke={WINE} strokeWidth={2.5} dot={{ r: 2.5, fill: WINE }} activeDot={{ r: 5 }} />
```

### 10.4 RadarChart (budget vs actual)

```tsx
<RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
  <PolarGrid stroke="#e5e7eb" />
  <PolarAngleAxis dataKey="category" tick={{ fontSize: 11 }} />
  <PolarRadiusAxis tick={{ fontSize: 9 }} />
  <Radar name="Budget" dataKey="budget" stroke={WINE} fill={WINE} fillOpacity={0.15} strokeWidth={2} />
  <Radar name="Actual" dataKey="actual" stroke="#2f9e6f" fill="#2f9e6f" fillOpacity={0.15} strokeWidth={2} />
  <Legend verticalAlign="bottom" height={24} iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
  <Tooltip />
</RadarChart>
```

### 10.5 Leyendas y gradientes

- **Leyenda custom** (preferida, va en el prop `right` de `SectionTitle`): `<span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-full" style={{ background: WINE }} /> Ingresos</span>` (series de línea: `h-0.5 w-3`).
- **Gradiente de área** (reutilizar en todo AreaChart): `<defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={WINE} stopOpacity={0.35} /><stop offset="100%" stopColor={WINE} stopOpacity={0.02} /></linearGradient></defs>`.
- **Barra de ratio sin Recharts** (liviana): `<div className="flex h-2.5 rounded-full bg-muted overflow-hidden"><div style={{ width: `${pct}%`, background: WINE }} /><div style={{ width: `${100-pct}%`, background: '#d8939f' }} /></div>`.

### 10.6 Alturas y formatters

- Alturas típicas: **250/270** (hero line/area), **200/240** (secundarios), **340** (combo denso), **150** (donut, `width` fijo), **52** (sparkline). `HBarList` dinámico: `Math.max(110, data.length * 40)`.
- Centralizá `moneyK` en `shared.tsx` (el código lo duplica 5×): `const moneyK = (v: number) => v === 0 ? '0' : `$${Math.round(v/1000)}k`;`.
- Tipos que **no existen** en el kit (si los necesitás, construilos): gauge/radial-progress, calendar-heatmap, funnel, treemap, scatter.

---

## 11. Widgets de dominio

Widgets de negocio genéricos, reutilizables en cualquier app.

### 11.1 Calculadora de tipo de cambio (con staging local)

Patrón "preview en vivo + tabla staging en localStorage" (útil para prototipos sin backend):
- Persistencia: `useState` con lazy init desde `localStorage.getItem(KEY)` + `useEffect(() => localStorage.setItem(KEY, JSON.stringify(rows)), [rows])`.
- Preview: `const rate = a > 0 && b > 0 ? a / b : 0;` → `1 USD = {fmt(rate)} {moneda}` con `text-brand font-bold`.
- Tras cargar una fila: resetear montos, conservar fechas (para carga rápida múltiple).

### 11.2 Callout de reconciliación / discrepancia

Caja que cambia de color según una diferencia calculada en vivo (físico vs sistema):
```tsx
const color = diff === 0 ? 'text-green-600' : diff > 0 ? 'text-blue-600' : 'text-red-600';
const bg    = diff === 0 ? 'bg-green-50 border-green-200' : diff > 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200';
const Icon  = diff === 0 ? CheckCircle2 : AlertTriangle;

<div className={cn("rounded-lg border p-3 flex items-center gap-2", bg)}>
  <Icon className={cn("h-5 w-5", color)} /><span className="font-medium">Diferencia</span>
  <span className={cn("ml-auto font-bold tabular-nums", color)}>{diff >= 0 ? '+' : ''}{diff.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
</div>
```
Además: el **botón de submit cambia** según el estado (`diff === 0 ? "Confirmar cierre" : "Notificar diferencia"` con ícono distinto), y aparece un warning ámbar cuando hay discrepancia.

### 11.3 Carrito + checkout

- **Carrito**: líneas con `lineId`; `addToCart` stackea por (item + precio + observación) y capea al stock. Panel derecho en desktop / bottom-sheet en mobile (mismo nodo, 5.6). Cada línea: nombre + variante + `qty × monto` + stepper.
- **Checkout** (2 columnas): métodos de pago (izq, scroll, data-driven) + resumen sticky (der/footer mobile) con Restante / Total pagado / Restante-después (color condicional). El botón muestra el total: `Confirmar $${total.toFixed(2)}`.

### 11.4 Otros widgets

- **Avatar con iniciales**: `Avatar` + `AvatarFallback` (3.6), `{name.charAt(0).toUpperCase()}` sobre `bg-brand/10 text-brand`.
- **Badge de conteo**: pill `rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white` (o `bg-primary text-primary-foreground min-w-[1.25rem]`).
- **Sparkline inline**: `<AreaChart>` en `h-[52px]`, `strokeWidth={1.5}`, `dot={false}`, con gradiente, sin ejes.
- **Season/Date picker**: `DatePicker` (3.9) para fechas; para rangos, dos `Input type="date"` con `min`/`max` cruzados; para temporadas, `SeasonPicker` (4.7).
- **Segmented toggle**: 6.6.

---

## 12. Auth (login / reset de contraseña)

### 12.1 Login — layout split-screen

```tsx
<div className="min-h-screen flex flex-col md:flex-row bg-background animate-in fade-in duration-500">
  {/* Panel de branding (solo desktop) */}
  <div className="hidden md:flex flex-col justify-between w-1/2 lg:w-3/5 relative overflow-hidden text-white">
    <div className="absolute inset-0 z-0 bg-cover bg-center transition-transform duration-1000 hover:scale-105" style={{ backgroundImage: `url(${heroImg})` }} />
    <div className="absolute inset-0 z-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent" />
    <div className="absolute inset-0 z-0 bg-gradient-to-t from-black/90 via-transparent to-black/30" />
    <div className="relative z-10 p-12 h-full flex flex-col justify-between">
      <img src="/logo.svg" className="h-12 object-contain brightness-0 invert drop-shadow-lg" />  {/* SVG negro → blanco */}
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight lg:text-6xl mb-6 leading-tight drop-shadow-lg">Título</h1>
        <p className="text-lg text-gray-200 max-w-md border-l-2 border-white/30 pl-4">Subtítulo</p>
      </div>
      <p className="text-xs text-gray-400 font-medium tracking-wide uppercase">© …</p>
    </div>
  </div>
  {/* Panel de formulario */}
  <div className="flex-1 flex flex-col relative bg-white">
    {/* language switcher absolute top-6 right-6, ver 8.6 */}
    <div className="flex-1 flex items-center justify-center p-6">
      <Card className="w-full max-w-sm border-0 shadow-none bg-transparent"><CardContent className="p-0">
        <img src="/logo-icon.svg" className="md:hidden h-14 w-14 mb-6" />
        <h2 className="text-3xl font-bold tracking-tight text-primary">Bienvenido</h2>
        <p className="text-sm text-muted-foreground mb-6">Ingresá a tu cuenta</p>
        {/* banner de error (6.2), inputs h-12 bg-secondary/30 focus:bg-background, password con toggle (6.8) */}
        <Button className="w-full h-12 mt-4 text-base font-semibold shadow-lg shadow-primary/20 transition-all hover:scale-[1.01]">
          {loading ? <Loader2 className="animate-spin" /> : <>Ingresar <ArrowRight className="ml-2 h-4 w-4" /></>}
        </Button>
        <p className="mt-6 text-center text-xs font-medium tracking-wide text-muted-foreground/70">{APP_VERSION}</p>
      </CardContent></Card>
    </div>
  </div>
</div>
```
Inputs del login: `h-12 bg-secondary/30 border-border focus:border-primary focus:bg-background transition-all`; label `text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1`.

### 12.2 Rate limiting (lockout client-side)

`utils/rateLimit.ts` (localStorage, key `rl:<kind>`): login = 5 intentos / 5 min; recover = 3 / 1h. API: `getLockStatus`, `recordFailedAttempt`, `resetAttempts`, `formatLockTime` (`"4:32"` o `"32s"`). En la UI: `lockSecs` con `setInterval(1s)`, el botón se deshabilita y muestra `<Lock className="mr-2 h-4 w-4" /> Bloqueado · {formatLockTime(lockSecs)}`. Login exitoso → `resetAttempts`.

### 12.3 Reset de contraseña (ruta pública, 4 estados)

`Shell` centrado (`min-h-screen flex items-center justify-center p-6` → `Card max-w-sm shadow-lg` → `CardContent p-8` con logo-icon + título + versión). Estados:
1. **checking**: `<Loader2 className="animate-spin" />` + "Verificando link…".
2. **invalid/expired**: círculo `bg-destructive/10 text-destructive` + `AlertCircle` + botón "Volver".
3. **form**: dos inputs `h-11` con ícono `Lock` (`pl-9`) + toggle show/hide, validando min-length y coincidencia; botón con `Loader2`.
4. **done**: círculo `bg-emerald-100 text-emerald-600` + `CheckCircle` + auto-redirect.

Para el backend: minteá el link con `supabaseAdmin.auth.admin.generateLink({ type: 'recovery' })` y enviá el email con el shell de marca propio (sección 13), no el template default de Supabase. El modal de recuperación ("olvidé contraseña") nunca revela si el email existe (mensaje genérico).

---

## 13. Emails transaccionales

Sistema centralizado en `server/utils/emailTemplate.ts`. HTML table-based, estilos 100% inline (requisito de clientes de correo). Logo embebido como **CID attachment** (no URL remota).

### 5.1 Paleta de email

```ts
const BRAND = {
  primary: '#992720',   // ← ACENTO DE MARCA. Usar EL MISMO color que --brand del frontend.
  ink: '#1a1a1a',       // texto principal
  muted: '#6b7280',     // texto secundario / headers de tabla
  border: '#e5e7eb',    // hairlines
  page: '#f4f4f5',      // fondo de página
  zebra: '#f6f6f7',     // fila de total / fill sutil
};
// Puntuales: #dc2626 (negativo), #2563eb (positivo/diferencia), #fdecea (fondo de badge), #b0b0b8 (footer)
```
> **Unificación pendiente**: Kautapen usa `#992720` en email y `#800020` en la UI (dos bordós distintos). En una app nueva, usá **el mismo hex** en `--brand`, `WINE` y `BRAND.primary`.

### 5.2 Shell de email (`renderBrandedEmail`)

Card blanca `max-width:840px; border-radius:16px`, header con logo (izq) + badge pill maroon (der), línea de acento de marca (`height:3px;width:52px`), título `24px/800`, slot de contenido, footer. Tipografía `Arial, Helvetica, sans-serif`; headers de tabla `10px uppercase letter-spacing:.4px`; celdas `13px`. Copiar `emailTemplate.ts` completo (246 líneas). Helpers expuestos:

| Función | Arma |
|---|---|
| `renderBrandedEmail({title, intro?, contentHtml, footerNote?, badge?})` | el shell |
| `renderEmailTable(headers, rows, total?, aligns?)` | tabla de detalle genérica (fila total opcional en gris, número en color de marca) |
| `renderIncomeOrderTable` / `renderExpenseOrderTable` | tablas de ingresos/gastos |
| `renderCashClosingSummaryEmail` / `renderCashClosingDifferenceEmail` | resumen / diferencia de caja |
| `escapeHtml`, `formatMoney` | utilidades |

### 5.3 Logo inline (`server/utils/logoAttachment.ts`)

```ts
export const LOGO_CID = 'kautapenlogo';   // ← renombrar por cliente
const LOGO_BASE64 = '…';                  // PNG del logo en base64 (regenerar con scripts/genLogoAttachment.mjs)
export const LOGO_ATTACHMENTS = [{
  '@odata.type': '#microsoft.graph.fileAttachment',
  name: 'logo.png', contentType: 'image/png', isInline: true,
  contentId: LOGO_CID, contentBytes: LOGO_BASE64,
}];
```
En el HTML: `<img src="cid:${LOGO_CID}" …>`. En el sendMail de Microsoft Graph: `message.attachments = LOGO_ATTACHMENTS`. El shell incluye CSS de dark-mode que invierte el logo negro a blanco en Apple Mail/iOS.

### 5.4 Envío

Vía Microsoft Graph: `POST /users/{sender}/sendMail` con `{ message: { subject, body: { contentType: 'HTML', content: renderBrandedEmail(...) }, attachments: LOGO_ATTACHMENTS, ... } }`. El reset de password usa el mismo shell (link generado con `supabaseAdmin.auth.admin.generateLink({ type: 'recovery' })`, enviado por Graph — **no** el email nativo de Supabase).

---

## 14. Control de acceso por rol

Matriz centralizada en `utils/permissions.ts`, compartida por sidebar y router (nunca hardcodear checks de módulo sueltos):

```ts
export type ModuleKey = 'shopx' | 'invoiceUpload' | 'maintenance' | 'kitchen' | 'dashboard' | 'configuration';
export const canAccessModule = (role: string | undefined, module: ModuleKey): boolean => {
  const isOperador = role === 'operador', isManager = role === 'manager';
  switch (module) {
    case 'shopx':         return !isOperador;               // admin + manager
    case 'invoiceUpload': return !isManager;                // admin + operador
    case 'maintenance':   return !isOperador;               // admin + manager
    case 'kitchen':       return !isOperador && !isManager; // admin only
    case 'dashboard':     return !isManager;                // admin + operador
    case 'configuration': return !isManager;                // admin + operador
    default:              return true;
  }
};
```
Convención (fail-open): cualquier rol que no sea explícitamente `operador`/`manager` (incluye `admin` y roles legacy) tiene acceso completo. Patrón visual: los ítems no permitidos **no se renderizan** (no hay disabled ni "acceso denegado"); ruta directa no permitida → redirect a home. Gating de campo/acción: `bg-muted/40 text-muted-foreground` bloqueado vs. control editable.

---

## 15. Reglas de oro

1. **Un solo set de íconos**: `lucide-react`. No mezclar otras librerías de íconos.
2. **Color de marca en 3 lugares**: `--brand` (index.css), `WINE` (dashboard/shared.tsx), `BRAND.primary` (email) — mismo hex. Nada más lleva el color de marca hardcodeado.
3. **`primary` (negro) y neutros no se tocan** entre clientes.
4. **Dinero**: `MoneyInput` + `parseMoney`/`maskFromNumber`. Nunca `type="number"` ni `parseNum()` para montos.
5. **Modales**: siempre `useModalAnimation` + `backdropClose` + `createPortal`. Estructura header/body/footer de 4.1. Nunca un modal sin portal.
6. **Dropdowns/selects**: usar `Select` / `Combobox` / `MultiCombobox` / `CategoryMultiSelect` del kit. No reimplementar posicionamiento de popovers.
7. **Estado de estado (workflow)**: `StatusBadge` con `status` canónico + `label` traducido. No badges de estado ad-hoc.
8. **Loading de página/lista**: `<Loader>`. Loading de botón: `<Loader2 className="animate-spin">` inline + `disabled`.
9. **Tablas responsive**: dos bloques (`md:hidden` cards + `hidden md:block` tabla). Ocultar columnas secundarias con `hidden lg:table-cell`.
10. **Tooltips**: `title="…"` en el elemento (el `TooltipHost` global se encarga). Montar `<TooltipHost/>` una vez.
11. **Feedback semántico**: emerald/red/amber/blue en las variantes de la tabla de tokens (1.4). Verde = positivo/ok, rojo = negativo/error, amber = warning, blue = info.
12. **Animaciones**: dependen de `tailwindcss-animate` (obligatorio en el config) + el CSS hand-rolled de `index.css`. No agregues `framer-motion`.
13. **Filtros NO son modales**: usá el patrón de barra colapsable (`FilterProvider` + `FilterToggle` + `FilterBar`, sección 4.7) o `CategoryMultiSelect` para una sola dimensión. Nunca un overlay centrado con backdrop para filtrar.
14. **Color de marca con opacidad**: `bg-brand/10`, `border-brand/20`, etc. funcionan solo porque `brand` está definido con `hsl(var(--brand) / <alpha-value>)` en el config (1.2). Si copiás el config, no le saques el `<alpha-value>`.
15. **Breakpoint según la zona** (sección 5.1): vistas de negocio cortan en `md`, dashboards en `sm`, carritos/bottom-sheets en `lg`. No uses `md` para todo.
16. **Modales en mobile NO son full-screen**: card centrada con overlay `p-4`, panel `max-h-[90vh] flex flex-col`, footer `flex-col sm:flex-row` con botones `w-full sm:w-auto`.
17. **Bottom-sheet**: un solo nodo `fixed inset-x-0 bottom-0 … lg:relative`. **Nunca** pongas una clase `relative` suelta junto a `fixed` (Tailwind la emite después y rompe el sheet mobile). Usá solo `fixed` + `lg:relative`.
18. **Vistas full-height**: `h-[calc(100dvh-Npx)]` (dvh, no vh) en mobile para manejar la barra dinámica del browser.
19. **z-index por escala** (sección 8.2): usá los tokens de capa, no los `z-[9999]`/`999999` del código legacy.
20. **KPIs**: usá `KpiCard` (10.2). No armes tiles de métrica ad-hoc.
21. **Tablas grandes**: paginación client-side con `PAGE_SIZE` + `slice` (7.4); no traigas todo a la vez sin cortar.
22. **Empty / error / loading**: las 3 variantes siempre (9.1/9.3). Empty = `border-2 border-dashed` + ícono en círculo; error = círculo `bg-red-50` + `AlertCircle` + retry.
23. **Imágenes**: comprimir con `fileToCompressedDataUrl` antes de subir (6.9). Nunca subas el archivo crudo.
24. **Accesibilidad**: agregá `aria-invalid`/`role="alert"` a errores de campo y `aria-label` a botones-ícono (el código base no los tiene — no heredes esa deuda).
