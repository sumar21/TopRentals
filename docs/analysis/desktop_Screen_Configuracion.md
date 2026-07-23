# desktop / Screen_Configuracion

## Purpose
Back-office "ABM" (Alta/Baja/Modificación) admin screen for master-data maintenance. It hosts the shared left navigation (built from the logged-in user's permission profile) plus a type-switchable CRUD console. In the shipped build only the "Articulos" (price-list items) console is actually reachable and fully wired (list, search, add, edit, deactivate/reactivate, cascading price sync to Stock). A parallel "Usuarios" (users) console, and stubs for "Tripulacion"/"Activos", exist in the Power Fx but are unreachable because the type ComboBox's Items list is hardcoded to a single option.

## Layout
Full-bleed 1366x768 canvas. Background SVG (001.svg) paints: a dark navy (#23313E) app frame, a white content card (x163..1353, y16..752, rounded 19px) with a light header strip (y25-77) containing two pill inputs (a "sort" pill ~698-850 and a "notification/search" pill ~993-1202) and a user-menu pill (1215-1323) with a chevron, plus a bottom-left collapse icon and "Cerrar sesión" glyph baked into the bg image. Live controls overlay this: left vertical icon-menu (gal_menu_HM_7, x5 y67 w148 h558, one row per permitted module); top toolbar row (ABM_Utilities group, y~25-93) with page title label, type ComboBox, search box, filter icon-button (Usuarios only), refresh icon-button, and a colored "Agregar X" pill button whose icon/label/position shift depending on the selected type; below that a full-width breadcrumb/column-header bar image (002-005.svg, swapped per type) at y93; then the data area (y125, w1172) holding either gal_Users or gal_Articulos (only one Visible at a time, mutually exclusive on cmbox_tipoABM.Selected.Value). Everything else (10+ item groups) is an absolutely-positioned full-screen (1366x768) translucent-black overlay + centered white card = a modal, toggled by a boolean context/global variable, stacked in z-order at the end of the Children list.

## components
- gal_menu_HM_7 — left vertical icon nav; Items = CollectPermisos filtered by the caller's profile column (Admin_LPP/Operador_LPP/Tecnico_LPP/Recepcion_LPP = "SI"), sorted by field_8; each item swaps a selected/unselected icon image and Navigate()s + rehydrates collections for the destination screen on click.
- cmbox_tipoABM — ComboBox picking the ABM sub-type; Items hardcoded to ['Articulos'] (DefaultSelectedItems too) even though Usuarios/Tripulacion/Activos branches exist everywhere else — those 3 types are dead/unreachable in the shipped app.
- txt_search_ABM — free-text search box; read live via .Text inside both galleries' Filter/Or(...in...) expressions (client-side substring search over cached collections, no debounce).
- bt_refresh_home_ABM — icon button; re-Refresh()es the underlying SharePoint list and re-ClearCollect()s the local cache for whichever type is selected; its X position literally shifts (1215 vs 585) depending on selected type to dodge overlapping controls.
- AddItem_ABM — primary pill button whose icon/label AND action switch on type (Set(AddUser,true) / Set(AddTrip,true) / Set(AddActivos,true) / UpdateContext(AddArt:true)) — one control doing 4 jobs.
- bt_blockFilterART — an invisible-label white rectangle that sits exactly over where the filter icon-button would render, Visible only for Articulos/Activos — purely a visual mask to hide/disable that region rather than a real control.
- bt_PopUpFiltro_FU / Group_FiltroUser — filter icon + popover panel (Rol multi-select, Estado multi-select, Aplicar/close) for the Usuarios list; the actual filtering logic is commented out (dead) — clicking Aplicar just resets the combos and closes the panel with no effect on the list.
- gal_Users — BrowseLayout gallery (Usuarios): Nombre, Apellido, Rol, Usuario, Contraseña(!), FechaNac columns, edit-pencil icon, and a status-driven Alta/Baja toggle icon; hides accounts whose UsuarioApp_Usr = 'Admin' unless the viewer's own UsuarioApp_Usr is 'Admin'.
- gal_Articulos — BrowseLayout gallery (Articulos): Codigo, Articulo, formatted $ PrecioUnitario, Corte (min-stock), edit-pencil icon, and a status-driven Activar/Desactivar toggle icon. This is the only fully live CRUD table in the screen.
- img_cerrarSesion_ABM / Group_CerrarSesion_ABM — logout trigger + confirm modal.
- Loading_ABM — full-screen loading overlay bound to context var LoadingLocal (separate from the also-present PopUpLoadingABM global, used inconsistently across handlers).

## modals
- Group_CerrarSesion_ABM (017.svg, ~501x162 centered card) — logout confirmation, Aceptar/Cancelar/X, toggled by global var cerrarSesion.
- Group_FiltroUser (018.svg, 224x263 panel anchored top-right) — Rol + Estado multi-select filter popover for Usuarios, toggled by context var PopUpFiltroFU; Aplicar handler's real filtering logic is commented out (no-op).
- Group_AddUser (019.svg, 513x437 centered card) — Add-User form: nombre/apellido inputs, rol ComboBox, DatePicker fechaNac, auto-computed 'usuario' (login) and password preview labels; toggled by global var AddUser; Save is dead (Patch commented).
- Group_EditUser (029.svg, same 513x437 template as Add) — Edit-User form pre-filled from RegistroUserEdit; toggled by context var PopUpEditUser; Save is dead (Patch commented).
- Group_DAU (020/021.svg, 553x176 card) — Deactivate-User confirm, toggled by global var DesactivarUser + IDDesactivarUser; Patch commented out (dead).
- Group_RAU (022/023.svg, 553x176 card) — Reactivate-User confirm, toggled by ReactivarUser + IDReactivarUser; Patch commented out (dead).
- Group_DA (024/025.svg, 553x176 card) — Deactivate-Article confirm, toggled by DesactivarArt + IDArticulo; LIVE — Patches Status_AR/Status_ST to Inactivo.
- Group_RA (026/027.svg, 553x176 card) — Reactivate-Article confirm, toggled by ReactivarArt + IDReactivarArticulo; LIVE — Patches Status_AR/Status_ST to Activo.
- Group_NuevoArt (030.svg edit / 031.svg add, 513x493 card) — Add/Edit Article form: Nro(readonly, auto-increment), nombre, costoUnitario, stockMinimo, detalle (multiline); Save button DisplayMode is client-side-validated Disabled when code is duplicated for a different article, name already exists (case-insensitive), or required fields are blank; toggled by context vars AddArt/EditarArt.
- Group_AgregarImagenes_AABM (032.svg, 502x451 card, + 035.svg 472x237 'no files' empty-state illustration with a circular warning-i icon) — attach-photos-to-article modal with AddMedia dropzone and a gallery of pending attachments (view-eye icon Visible:false, delete-trash icon logic commented out); entry point (bt_addFoto_AABM) is hardcoded Visible:false, so this entire modal is currently unreachable dead UI.
- Group_ImgAdjunta_AABM (028.svg, 556x521 blurred-backdrop card) — full photo/PDF viewer (Image/PDFViewer controls), gated by context var VerFotoOT; its only entry point is the same disabled attach-photos flow, so also unreachable.
- Loading_ABM (036.svg full-screen) — generic loading overlay bound to context var LoadingLocal; a second, separately-tracked global PopUpLoadingABM is also toggled by most handlers but has no visible control bound to it in this screen — likely dead/vestigial state.

## data_reads
- CollectPermisos — Filter(..., {Profile}_LPP="SI") then SortByColumns(...,"field_8") to build the left nav per VarUser.Perfil_Usr; Compras profile falls through to Blank() (no menu at all) — likely an unintentional gap in the If/Else chain.
- '99.ABM_Articulos' — Refresh + ClearCollect(CollectArticulosABM,...) on tab-select and on refresh click; gal_Articulos Items = SortByColumns(Filter-or-all(CollectArticulosABM, search on Codigo_AR/Articulo_AR/Concat_AR), "ID").
- '00.Usuarios' — Refresh + ClearCollect(CollectUserABM,...) on tab-select/refresh; gal_Users Items = If(VarUser.UsuarioApp_Usr="Admin", CollectUserABM, Filter(CollectUserABM, UsuarioApp_Usr<>"Admin")) further filtered by search text over Nombre_Usr/Apellido_Usr/Perfil_Usr.
- '08.Stock' — LookUp by IDArticulo_ST for deactivate/reactivate; Filter(IDArticulo_ST=ArticuloEdit.ID And Status_ST="Activo") into CollectStockArt before the cascading edit-sync ForAll.
- Left-menu Navigate() targets also pre-warm collections for OTHER screens on click (not this screen's own state): '07.OrdenesTrabajo' (Home/Ordenes de Trabajo), '99.ABM_Edificios' (Stock/Compras), '14.Compras'/'15.DetalleCompras' (Compras), '16.Aprobaciones' (Aprobaciones, filtered per role), '99.ABM_TipoUnidades' (Ordenes de Trabajo/Ventilaciones), '19.Ventilaciones', '00.Usuarios' (Tecnicos), '99.ABM_Frecuencias' — boilerplate shared by every screen's nav gallery, not Configuracion-specific.
- Dead/commented reads: 'Documentos' SharePoint library (for CollectImagenesAdjuntadas by folder path) and '00.User' (legacy list name, different from live '00.Usuarios') inside disabled Add/Edit/Deactivate/Reactivate-User handlers.

## data_writes
- Patch('99.ABM_Articulos', ArticuloEdit, {Status_AR:"Activo", Codigo_AR, Articulo_AR, Concat_AR, PrecioUnitario_AR, Corte_AR, Detalle_AR}) — Save on Edit-Article path.
- Patch('99.ABM_Articulos', Defaults('99.ABM_Articulos'), {same fields}) — Save on Add-Article path (same button/handler, branched by EditarArt flag).
- ForAll(CollectStockArt, Patch('08.Stock', ThisRecord, {Codigo_ST, Articulo_ST, ConcatArt_ST, PrecioUnitario_ST, CondicionCorte_ST})) — on article edit, cascades the denormalized code/name/price/min-stock onto every active Stock row referencing that article (classic denormalization; a proper FK join in Supabase removes the need for this fan-out write entirely).
- Patch('08.Stock', LookUp(IDArticulo_ST=IDArticulo), {Status_ST:"Inactivo"}) + Patch('99.ABM_Articulos', LookUp(ID=IDArticulo), {Status_AR:"Inactivo"}) — Deactivate-Article confirm.
- Patch('08.Stock', LookUp(IDArticulo_ST=IDReactivarArticulo), {Status_ST:"Activo"}) + Patch('99.ABM_Articulos', LookUp(ID=IDReactivarArticulo), {Status_AR:"Activo"}) — Reactivate-Article confirm.
- Client-side ID generation for new articles: txt_Nro_ART.Value = Max(CollectArticulosABM, ID) + 1 — race-condition-prone pattern; must become a DB identity/serial or UUID in Supabase.
- Dead writes (commented out, never execute): Patch('00.User', Defaults(...), {...}) Add-User, Patch('00.User', LookUp(...), {Status_USR:"Inactivo"/"Activo"}) Deactivate/Reactivate-User, Patch('00.Usuarios', ...) Edit-User — the entire Usuarios CRUD flow is UI-only (list renders, forms open, buttons fire) but performs no persistence.
- Dead flow calls (commented out): 'TopRentals-FotoArticulo'.Run(...) and 'TopRentals-PDFArticulo'.Run(...) (would upload article photos/PDF to a SharePoint doc library) and 'ObtenerVideos'.Run(...) (would fetch PDF content for the viewer) — the whole "attach photos to article" feature is present in markup/collections but its entry button (bt_addFoto_AABM) is hardcoded Visible:false, so it is fully unreachable.

## navigation
- Navigate(Screen_Home) — left-menu 'Home' item, after ClearCollect(CollectOTHome, Filter('07.OrdenesTrabajo', Status_OT in {Pendiente,Asignada})).
- Navigate(Screen_Stock) — 'Stock' item, after Refresh+ClearCollect of Stock/Edificios (role-scoped by building for Recepcion/Operador).
- Navigate(Screen_Compras) — 'Compras' item, after Refresh+ClearCollect of Edificios/Compras/DetalleCompras.
- Navigate(Screen_Aprobaciones) — 'Aprobaciones' item, ClearCollect filtered by role (Gerencia/Admin/others see different Status_AP subsets).
- Navigate(Screen_OrdenesTrabajo) — 'Ordenes de Trabajo' item, ClearCollect scoped by current+prior month and (for Recepcion/Operador) by the user's building.
- Navigate(Screen_Ventilaciones) — 'Ventilaciones' item, Concurrent ClearCollect of Ventilaciones/Edificios/Tecnicos/Frecuencias.
- Navigate(Screen_Configuracion) — 'ABM' item, i.e. self-navigation (stays here), re-pulling ABM_Articulos.
- Navigate(Screen_Login) — logout confirm 'Aceptar', also Reset()s the login screen's user/password inputs.

## statuses
- Pendiente
- Asignada
- Cerrada
- Cerrada F
- Cerrada V
- Activo
- Inactivo
- Aprobada
- Aprobacion
- Aprobada Supervision
- Alta
- Programada
- ALTA
- BAJA
- SI
- Admin
- Operador
- Tecnico
- Recepcion
- Compras
- Gerencia
- Articulos
- Activos
- Usuarios
- Tripulacion
- Home
- Stock
- Ordenes de Trabajo
- Ventilaciones
- Aprobaciones
- ABM
- edit
- add
- pdf
- mp4
- mov

## role_logic
Left nav is built entirely from CollectPermisos: for VarUser.Perfil_Usr in {Admin, Operador, Tecnico, Recepcion} it filters that profile's own boolean column ({Profile}_LPP=\"SI\") and sorts by field_8; the Compras profile hits an If(...,Blank()) with no matching branch, so a Compras user gets an EMPTY left menu on this screen — an apparent gap rather than a deliberate design. There is no per-control role check gating the Articulos console itself (any user who can reach this screen and see 'ABM' in their nav can fully use it). The Usuarios console has one extra, unusual rule: it hides any row whose UsuarioApp_Usr literally equals \"Admin\" from the list UNLESS the current viewer's own UsuarioApp_Usr is also \"Admin\" — i.e. it gates by a literal login-name match, not by comparing Perfil_Usr/roles, so a second admin-profile user with a different login would still not see the 'Admin' account. Finally, the type ComboBox (cmbox_tipoABM) has its Items hardcoded to ['Articulos'] only, which functions as a de facto access control switch: even though the Usuarios console (search, CRUD forms, filter panel) is fully built in Power Fx, no user — regardless of role — can reach it through the shipped UI.

## visual_notes
Palette: dark navy #23313E/#19222B for chrome, headers, and primary buttons (text/icons rendered white); pale surface backgrounds #F5F5F5 / #F1F5F8 with #D8D4D4/#DFE6EB borders for pill inputs and search boxes; neutral list/label text #6B7680 and #19222B; light divider #DFE6EB/#E3E9EE between column-header segments and between gallery rows; small icon-button chrome is a 21x21 rounded square (#F4F6F8 fill, #B8C5CF border) housing either a checkmark or an X in #23313E — reused identically for activate/deactivate on both Users and Articulos; destructive/delete actions use red #A6413B (trash-can icon for removing an attached photo); edit action uses a dark #1C274C pencil icon. Every modal overlay is a full 1366x768 rect at 12% black opacity (some with a 1-2px backdrop blur) behind a white, rounded (12px), drop-shadowed card; confirm dialogs are small (≈553x176 or 501x162) with an 'x' dismiss in the corner, while form modals (Add/Edit User, Add/Edit Article, Photos) are large (≈502-556 wide, 437-521 tall). The column-header images (002-005.svg) are literally four near-identical horizontal strips of vector-text column labels, one per ABM type, swapped wholesale as a background image rather than as real table headers — meaning in React these must become live, localizable <th> text, not baked-in graphics. AddItem_ABM's plus-icon button (012-015.svg) also swaps per type (Usuario-plus, Tripulacion-plus, Activo-plus, Articulo-plus icons) sharing one 118x40 dark pill shape.

## react_mapping
Layout: Sidebar primitive for gal_menu_HM_7 (icon+label items, active-state = current module, item set driven by a permissions hook mirroring CollectPermisos). Header row: Tabs (not Select) for {Articulos, Usuarios} — collapse the currently-hardcoded single-option ComboBox and the dead Tripulacion/Activos branches into just the two real, working tabs (flag to product: decide whether Usuarios ABM should finally ship or be deleted, since it's fully built server-formula-wise but UI-locked). Combobox/Input row: Input w/ leading search icon for txt_search_ABM (debounce client-side filter or server query); IconButton for refresh (React Query invalidate/refetch instead of manual Refresh()+ClearCollect()); Button (primary) 'Agregar {tipo}' opening the relevant modal; IconButton+Popover (small, not a full Drawer) for the Usuarios filter panel — it's only 2 multi-selects and an apply button, no need for a Drawer's real estate. Data grid: Table primitive for both lists (columns per active tab), with a StatusBadge (Activo/Inactivo, or Alta/Baja) rendered alongside — but keep the toggle as an IconButton+Tooltip (not just a badge) since clicking it performs the actual activate/deactivate action; row actions column holds an Edit IconButton (pencil) + the status-toggle IconButton, mirroring the existing 21x21 rounded-square icon chrome. Modals: collapse all 6 near-identical confirm dialogs (logout, deactivate/reactivate user, deactivate/reactivate article) into ONE reusable ConfirmDialog(title, body, confirmLabel, onConfirm) built on the Modal recipe — this alone removes ~5 duplicated control trees. Use the Modal recipe (centered, medium) for Add/Edit User and Add/Edit Article forms, built with Input, Select (rol), a date Input (react-day-picker or native date input replacing DatePicker), and MoneyInput for PrecioUnitario_AR (currently a bare TextInput doing manual '$ ' + Text(...,'##,##0.00') formatting — MoneyInput removes that hand-rolled formatting entirely). Add real client validation with a schema lib (zod) mirroring the existing duplicate-code/duplicate-name/required-field DisplayMode logic, surfaced as inline field errors instead of a silently-disabled Save button. Add Toast feedback on every mutation (save/activate/deactivate) — the original screen has NO success/error notification at all (only a generic spinner flag), a real UX gap worth fixing in the rebuild. Do not port the Add-Photos/Photo-Viewer modals (032/028.svg) as-is: their trigger is hardcoded invisible, their Patch/flow calls are all commented out, and the feature is fully dead — treat as a backlog item to spec fresh (proper file storage in Supabase Storage) rather than a straight port. Schema/backend notes for the Supabase migration: replace the client-computed `Max(ID)+1` article numbering with a DB identity/UUID; replace the ForAll-cascade that copies Codigo/Articulo/Precio/Corte from Articulos onto every matching Stock row with a real foreign key (Stock.articulo_id → Articulos.id) and a join/view, eliminating that fan-out write path entirely; and decide/fix the Compras-profile empty-menu gap and the literal-username-based Admin-row hiding rule before reimplementing role gating with a proper roles/permissions table.