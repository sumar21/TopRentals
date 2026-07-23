# desktop / Screen_Home

## Purpose
Landing/dashboard screen after login for TopRentals back-office staff. Its sole active function is a "Mantenimientos" (maintenance work-order) triage board: it shows all open Work Orders (07.OrdenesTrabajo) bucketed into "Pendiente" (unassigned) and "Asignada" (assigned, split by priority Alta/Media/Baja), lets the user search/filter them, refresh the data, jump into any order (Select(Parent) — likely navigates to an order detail screen not included in this file), and log out. It also hosts the left sidebar navigation whose visible items are driven by the logged-in user's profile permissions, and each nav click pre-loads (ClearCollect) the data collections the destination screen needs. A second "Planificaciones" (route/tour planning) view was designed on this same screen but is fully disabled (dead code, see visual_notes).

## Layout
Full 1366x768 canvas. BackgroundImage (SVG 001) renders the static chrome: a dark navy (#23313E) left rail ~163px wide (nav sidebar) and a large white rounded content panel (x=163..1353, y=16..752) with drop shadow. On top of that background: (1) top header inside the white panel — app logo/icon (top-left, y=22), user greeting name (VarUser.ConcatName_Usr, x=268,y=31), a search box (txt_search_HM, x=1040,y=43), a refresh icon-button with a 30s cooldown timer overlay (x=1234,y=40); (2) left rail — vertical Gallery (gal_menu_HM, x=5,y=67,148x558) of nav icons, each 44px row, plus a hidden logout hit-area at the bottom; (3) main board, three-ish columns under the header: a "Pendiente" column (gal_mantenimientoPendiente, x=182,y=155, 300x594, card height 150) and three "Asignada" columns side by side split by priority — Alta (x=490), Media (x=775), Baja (x=1058), each y=177 width=285 card height=144; count badges (lbl_cantidad_altas/medias/bajas) sit above each Asignada column header at y=142; (4) empty-state illustrations replace any column/board that has zero items; (5) full-screen overlays: a logout confirmation dialog (Group_CerrarSesion) and a full-screen loading spinner (LoadingHome), both toggled by boolean state, stacked above everything else. A disabled/hidden "botonera" segmented control (Planificaciones | Mantenimientos) and its associated empty-state graphic sit at x=720-1057,y=40, permanently Visible=false.

## components
- gal_menu_HM — vertical icon-only nav Gallery (148x558, 44px rows) bound to CollectPermisos filtered by the user's profile flag column (Admin_LPP/Operador_LPP/Tecnico_LPP/Recepcion_LPP = "SI"); Compras profile gets Blank() (empty nav — likely a gap). Each item swaps its icon (Imagen_LPP vs ImagenNoSelected_LPP) based on whether Modulo_LPP="Home". OnSelect Switch()es on Modulo_LPP to preload collections and Navigate to one of 6 other screens.
- txt_search_HM — free-text input filtering the 4 work-order galleries client-side via `in` operator against Torre_OT, Status_OT, Tecnico_IN.
- bt_refresh_home — icon button that re-ClearCollects CollectOTHome and restarts a 30s Timer (timer_RefreshHome) shown as mm:ss countdown, presumably to throttle refresh spamming.
- gal_mantenimientoPendiente — vertical card Gallery (TwoTextOneImage variant, 150px rows) of work orders with Status_OT="Pendiente", sorted by FechaInicio_OT desc. Card shows Detalle_IN, FechaInicio_OT, TipoTarea_IN, TipoTrabajo_IN, Asignador_OT, "Torre_OT - Departamento_OT", a priority pill (Prioridad_IN: Baja/Media/Alta) and a type pill (Tipo_IN: SOLICITUD OT / ORDEN DE TRABAJO). Card tap -> Select(Parent) (drill-in target not in this file).
- gal_asignadas_alto / _medio / _baja — three parallel Galleries, same card template, each filtered to Status_OT="Asignada" AND TipoPrioridad_OT = "Alta"/"Media"/"Baja" respectively (note: a *second*, separate priority field from the pill's Prioridad_IN — possible data-model duplication).
- lbl_cantidad_altas/medias/bajas — plain count labels (CountRows) above each Asignada column, not real KPI cards.
- Empty-state illustrations (warning_sinAlto_1, warning_sinAlto/Medio/Baja) — white rounded card, gray circle '?' icon, message text; shown per-column via IsEmpty(gallery.AllItems).
- Botonera Planificaciones/Mantenimientos — a segmented-control pair of transparent Buttons plus a background image, entirely Visible=false; permanently dead/disabled feature toggle.
- Group_CerrarSesion — logout confirmation modal (full-screen dim image + Aceptar/Cancelar/X classic buttons), toggled by boolean `cerrarSesion`.
- LoadingHome — full-screen loading overlay image, toggled by `LoadingLocal` context variable, shown during nav preloads and refresh.

## modals
- Group_CerrarSesion (logout confirmation) — full-screen dim overlay image (019.svg) + 'Aceptar' / 'Cancelar' / 'X' classic buttons, all gated on boolean `cerrarSesion` (set true by the hidden img_cerrarSesion_Home hit-target at the bottom of the sidebar). Aceptar logs out and navigates to Screen_Login; Cancelar/X just close it.
- LoadingHome — full-screen loading/spinner overlay image (020.svg), gated on context var `LoadingLocal`, shown while nav-click preloads run and during manual refresh.
- Per-column empty-state 'cards' (warning_sinAlto_1, warning_sinAlto, warning_sinMedio, warning_sinBajo) — not true modals but function as inline empty-state placeholders, each an Image whose Visible = IsEmpty(<corresponding gallery>.AllItems).
- sin_planificaciones_GRC — an empty-state image for the disabled Planificaciones tab; its Visible formula is entirely commented out, so this control is effectively permanently hidden (dead).

## data_reads
- CollectPermisos — nav menu source; Filter(CollectPermisos, <Profile>_LPP="SI") then SortByColumns(..., "field_8", Ascending). Loaded elsewhere (App OnStart), not on this screen.
- '07.OrdenesTrabajo' — Filter(..., Status_OT="Pendiente" Or Status_OT="Asignada") -> ClearCollect(CollectOTHome, ...) on Home nav click and on manual refresh; this collection then re-filtered client-side by the 4 galleries (Pendiente / Asignada+Alta / Asignada+Media / Asignada+Baja) plus the search-box `in` filters on Torre_OT/Status_OT/Tecnico_IN.
- '08.Stock' — Refresh + Filter(Status_ST="Activo"), building-scoped to VarUser.Edificio_Usr for Recepcion/Operador profiles, unscoped otherwise. Preloaded on Stock nav click.
- '99.ABM_Edificios' — Filter(Status_E="Activo"). Preloaded on Stock and Compras nav clicks.
- '14.Compras' / '15.DetalleCompras' — Refresh + Filter('14.Compras', Status_C in {"Pendiente","Aprobada","Aprobacion"}). Preloaded on Compras nav click.
- '16.Aprobaciones' — Refresh + role-based Filter: Gerencia sees Status_AP="Aprobada Supervision"; Admin sees that OR "Pendiente"; everyone else sees only "Pendiente". Preloaded on Aprobaciones nav click.
- '99.ABM_TipoUnidades' — Filter(Status_ABMUnid="Alta"). Preloaded on Ordenes de Trabajo nav click (as CollectEdificiosOT) and Ventilaciones nav click (as CollectEdificios).
- '07.OrdenesTrabajo' (again) — on 'Ordenes de Trabajo' nav click, Filter by current-or-previous month (FechaMes_IN) AND Status_OT in {Pendiente,Asignada,Cerrada,Cerrada F,Cerrada V}, plus Torre_OT=VarUser.Edificio_Usr scoping for Recepcion/Operador.
- '19.Ventilaciones' — Refresh + Filter(Estado_VE in {"Pendiente","Asignada","Programada"}). Preloaded on Ventilaciones nav click.
- '00.Usuarios' — Filter(Perfil_Usr="Tecnico") -> CollectTecnicos. Preloaded on Ventilaciones nav click.
- '99.ABM_Frecuencias' — Filter(Status_FE="Activo"). Preloaded on Ventilaciones nav click.
- '99.ABM_Articulos' — Refresh + full ClearCollect (no filter) -> CollectArticulosABM. Preloaded on ABM nav click.

## data_writes
- None on this screen. Screen_Home performs no Patch/Remove/SubmitForm and calls no Power Automate flow and sends no email. All actions here are read-only: ClearCollect() (client-side cache refresh) and Navigate(). The only 'write' is local app state: Set(cerrarSesion,...), Set(ReiniciarTimerCamarero,...), UpdateContext({LoadingLocal:...}), Reset() on filter controls of a different screen (cmbox_tecnico_SC etc., leftover cross-screen resets fired from the nav OnSelect).

## navigation
- gal_menu_HM item OnSelect Switch(Modulo_LPP): "Home" -> Navigate(Screen_Home) [self, refresh]; "Stock" -> Navigate(Screen_Stock); "Compras" -> Navigate(Screen_Compras); "Aprobaciones" -> Navigate(Screen_Aprobaciones); "Ordenes de Trabajo" -> Navigate(Screen_OrdenesTrabajo); "Ventilaciones" -> Navigate(Screen_Ventilaciones); "ABM" -> Navigate(Screen_Configuracion). All use ScreenTransition.Fade.
- bt_aceptarCerrarSesion OnSelect -> Set(cerrarSesion,false); Reset(input_password_SL) x2; Navigate(Screen_Login, Fade).
- Card image taps (Image3, Image2_1, img_tipo_OT_1 inside every work-order card) -> Select(Parent) — bubbles a select event on the gallery item; no explicit Navigate in this file, so the drill-in destination (order detail) is presumably handled by a parent App/Gallery-level OnSelect not present in Screen_Home.yaml.

## statuses
- Status_OT: Pendiente, Asignada, Cerrada, Cerrada F, Cerrada V
- TipoPrioridad_OT (bucket field for Asignada columns): Alta, Media, Baja
- Prioridad_IN (badge field shown on the Pendiente card, distinct from TipoPrioridad_OT): Baja, Media, Alta
- Tipo_IN: SOLICITUD OT, ORDEN DE TRABAJO
- Status_C (Compras): Pendiente, Aprobada, Aprobacion
- Status_AP (Aprobaciones): Aprobada Supervision, Pendiente
- Status_ST (Stock): Activo
- Status_E (Edificios): Activo
- Status_ABMUnid (TipoUnidades): Alta
- Estado_VE (Ventilaciones): Pendiente, Asignada, Programada
- Status_FE (Frecuencias): Activo
- Perfil_Usr: Admin, Operador, Tecnico, Recepcion, Compras, Gerencia
- Modulo_LPP (nav item key): Home, Stock, Compras, Aprobaciones, Ordenes de Trabajo, Ventilaciones, ABM
- Admin_LPP / Operador_LPP / Tecnico_LPP / Recepcion_LPP: SI (only value ever compared)

## role_logic


## visual_notes
"BackgroundImage (001.svg, 1366x768) is the full static shell: dark navy (#23313E) outer frame/left rail (~163px) + a large white (#FDFDFD) rounded content panel with a drop-shadow filter — i.e. classic dark-sidebar/light-content-area shell. Work-order card template (005/013/014/015.svg, ~290x140 white rounded card, border #C8D1D9) bakes a small document/calendar icon top-left plus PLACEHOLDER text glyphs at design time; the real per-item data is drawn on top via separate Text controls positioned to match (Detalle_IN, FechaInicio_OT, TipoTarea_IN, TipoTrabajo_IN, Asignador_OT, 'Torre - Depto'). Priority pill colors are counter-intuitive: Baja=blue (006.svg, fill #D2E2FF/border #93B5F4/text #225DCA), Media=yellow (007.svg, #FFFDD8/#F0EB69/#9E9808), Alta=green (008.svg, #DCFBC7/#A8DB87/#51882E) — i.e. the 'highest priority' pill reads as the calmest color, opposite of typical red-for-urgent convention; worth flagging to the client before porting 1:1. Type pills: SOLICITUD OT = neutral gray (009.svg #F9F9F9/#DADADA/#888888), ORDEN DE TRABAJO = blue (010.svg #E9F4FF/#B7D4EF/#3A6894). Empty-state illustrations (002/004/016/017/018.svg) are all the same pattern: white rounded card, light-gray circle with a dark stroked '?'/info glyph, paragraph message below. Refresh icon (003.svg) is a two-arrow circular-refresh glyph in slate blue #566482. The disabled botonera control (011/012.svg) is an iOS-style segmented pill: light-gray track (#F4F4F4), white active-segment pill with border #E4E4E4, active label dark #2F2F2F / inactive label gray #949494/#7C8497 — confirms a Planificaciones/Mantenimientos toggle was designed and then switched off (Visible=false on every related control, and Visible formulas on the empty-state elsewhere are commented out too) rather than removed, i.e. dead UI still shipping in the bundle."

## react_mapping
"Sidebar layout primitive as the page shell: dark Sidebar (icon-only nav rail, populated from a role-permission-filtered menu list — same CollectPermisos/*_LPP='SI' gating becomes a `usePermissions(profile)` hook driving which Sidebar items render, each item carrying its own onClick that triggers a data-prefetch + route push) + a light content Card/panel for the main area. Header row: greeting Text, an Input (search) wired with debounced client-side filtering (mirrors the `in` text match against tower/status/tech), a Button (icon-only) for manual refresh with a disabled/cooldown state driven by a 30s countdown (replace the Power Fx Timer with a simple setTimeout/useState cooldown — drop the literal countdown-label unless product wants it back). Main board: a 4-column KPI/Board layout — reuse a Table→Card-list pattern per column, i.e. one scrollable Card-list per bucket (Pendiente / Asignada-Alta / Asignada-Media / Asignada-Baja), each row rendered as a `Card` composed of: title Text, StatusBadge or a small `PriorityBadge` variant (map Alta/Media/Baja to the kit's semantic tone scale, but re-pick colors — do NOT literally reuse the green-for-Alta/blue-for-Baja mapping found in the source, it inverts the kit's severity convention) and a second `StatusBadge`-style tag for Tipo_IN (Solicitud vs Orden). Column headers get a small count `StatCard`/badge instead of the bare CountRows Text. Zero-state per column: reuse the kit's empty-state pattern (icon + message) instead of a baked SVG. Logout confirmation -> Modal recipe (kit's confirm-dialog composition) instead of a manually toggled full-screen image group; Loading overlay -> the kit's global loading/Skeleton or a Toast/spinner overlay tied to query-loading state (React Query `isFetching`) rather than a manual boolean. Drop the disabled Planificaciones/Mantenimientos segmented control entirely (dead feature) unless product confirms it should be revived — if revived, it's a straightforward `Tabs` primitive. On mobile, replace the 4 side-by-side card-list columns with a single vertical list plus a `Tabs`/segmented filter (All/Pendiente/Alta/Media/Baja) or a bottom-sheet filter, since 4 columns won't fit narrow viewports."