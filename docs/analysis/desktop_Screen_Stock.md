# desktop / Screen_Stock

## Purpose
Back-office inventory (stock) management for TopRentals maintenance supplies. Lets Admin/Operador/Recepcion/Tecnico roles see current stock quantities per article per building, add incoming stock ("Ingresar Stock"), dispatch/consume stock to a technician or another building ("Salida de Stock"), and edit an existing stock line's quantity/minimum-threshold/unit cost. Every stock mutation writes an audit row to '08.MovimientoStock'. The "Compras" profile (and a hardcoded named user) is largely read-only here — this is the reception/warehouse-keeper screen, not the purchasing screen (that is Screen_Compras).

## Layout
Fixed 1366x768 canvas. Dark navy full-bleed background (#23313E) with a large white rounded content card (X=163,Y=16,1190x736) that holds everything. Inside that card: a header row (Y≈25-77) that is visually the gallery's column header ("Código / Artículo / Edificio / Precio Unitario / Cantidad / Stock Mínimo / Costo Total") plus, to its right, the action toolbar (search input, refresh icon, "Salida de Stock" light button, "Ingresar Stock" dark button with a plus icon). Below that, the main body is a single vertical Gallery (gal_stock) occupying nearly the whole card (X=182,Y=125,1166x553, 49px row template) rendered as a flat table. A footer strip below the gallery shows two right-aligned totals (item count, total cost). A far-left vertical strip (X=5-153) outside the white card holds the app logo, a role-filtered vertical nav gallery (gal_menu_ST), and a logout icon at the bottom. Six overlay groups (each an Image background + Classic/Buttons, toggled by a boolean/context variable) act as full-screen modals layered on top: low-stock empty-state illustration, "Cantidad Insuficiente" warning, "Agregar Stock" form, "Salida de Stock" form, "Editar Stock" form, and "Cerrar Sesión" confirmation. A final full-screen Loading_ST image is the global spinner overlay.

## components
- gal_menu_ST — vertical icon nav gallery, Items = SortByColumns(Filter(CollectPermisos, <Profile>_LPP="SI"), field_8 asc); per-item OnSelect Switches on Modulo_LPP to refresh collections and Navigate to the matching screen (Home/Compras/Aprobaciones/OrdenesTrabajo/Ventilaciones/ABM); the screen's own 'Stock' branch is a no-op (commented out, Blank())
- gal_stock — main table gallery (BrowseLayout_Vertical_TwoTextOneImageVariant), Items = Filter(CollectStock, Cantidad_ST>0) optionally further filtered by free-text search against ConcatArt_ST or Edificio_ST, sorted by ID then ConcatArt_ST; each row: red-tinted background rectangle when Cantidad_ST < CondicionCorte_ST (low-stock highlight), a thin separator line, 7 text fields, an edit-pencil icon and a person/checkout icon (both hidden for Compras profile or the named user 'Perche, Adriana')
- txt_search_ST — free-text search TextInput (Placeholder 'Busqueda'), filters gal_stock live, no explicit search button
- bt_refresh_ST — Image-as-button, re-pulls '08.Stock' and '99.ABM_Edificios' into collections
- bt_ingresarStock_ST — dark 'Ingresar Stock' button, opens PopUpAgregarStock (Disabled for Compras/'Perche, Adriana')
- bt_salidaStock_ST — light 'Salida de Stock' button, preloads CollectSalidasStock for current+previous month and navigates straight to Screen_SalidasStock (Disabled for Compras only)
- WarningStock — empty-state illustration+text card shown when gal_stock.AllItems is empty
- lbl_totalItems_ST / lbl_totalCosto_ST — footer totals: CountRows(gal_stock.AllItems) and Sum(PrecioUnitario_ST*Cantidad_ST) over currently visible rows
- img_cerrarSesion_ABM_ST — logout icon, sets boolean cerrarSesion=true to open the logout modal
- Loading_ST — full-screen loading overlay bound to LoadingLocal context var, wraps virtually every OnSelect

## modals
- GroupWarningSALIDA (var WarningCantidadSalida) — 'Cantidad Insuficiente' blocking alert with a single dismiss action; never observed being set true in this screen's formulas (candidate dead code / validation gap to double-check)
- GroupAgregarStock_ST (var PopUpAgregarStock) — 'Agregar Stock' (stock-in) form: Edificio select, Artículo combobox (excludes articles already stocked in that building), auto-filled/editable Precio Unitario, Cantidad input; Confirm disabled until article+building+valid qty+price are set
- Group_SalidaStock (var PopUpSalidaStock) — 'Salida de Stock' (dispatch/consume) form: Fecha (default today), Tipo (CONSUMIBLE/ASIGNACION/DEVOLUCION/TRASLADO), Técnico, Artículo (read-only, prefilled from the row clicked), Uso (fixed 'Consumo Diario'), Centro de Costo/Edificio; Confirm disabled unless requested qty ≤ available and every field is filled; TRASLADO type additionally moves the quantity to a destination-building stock row
- Group_EditarStock (var PopUpEditarStock) — 'Editar Stock' form: Cantidad actual, Stock mínimo, Costo unitario for the clicked row; Confirm disabled until all three are non-blank
- Group_CerrarSesion_ST (var cerrarSesion) — logout confirmation, Aceptar navigates to Screen_Login and clears login inputs
- Loading_ST (var LoadingLocal) — global full-screen loading spinner overlay, not a real modal but wraps almost every action

## data_reads
- '08.Stock' — Filter(Status_ST="Activo") into CollectStock; this is the primary list rendered by gal_stock
- '99.ABM_Articulos' — Filter(Status_AR="Activo") into CollectArticulos (article master used in the Agregar Stock combobox and as source of truth for PrecioUnitario_AR)
- '99.ABM_Edificios' — Filter(Status_E="Activo") into CollectEdificios (building picklists)
- '00.Usuarios' (CollectUsers, populated elsewhere) — Filter(Perfil_Usr="Tecnico") + Distinct for the technician combobox in Salida de Stock
- '09.SalidaStock' — Filter by current/previous month (FechaMes_SS) into CollectSalidasStock, prefetched before navigating to Screen_SalidasStock
- CollectPermisos (from '99.ABM_ListaPermisosPerfilesV3'-style permissions list) — Filter(<Profile>_LPP="SI") drives which nav items each role sees; Compras profile resolves the whole nested If to Blank() (no nav items rendered for Compras on this screen)
- Cross-navigation prefetches for other modules (not core to Stock): '07.OrdenesTrabajo', '14.Compras'/'15.DetalleCompras', '16.Aprobaciones', '19.Ventilaciones', '99.ABM_TipoUnidades', '99.ABM_Frecuencias'

## data_writes
- Patch('99.ABM_Articulos', ..., {PrecioUnitario_AR}) — keeps the article master's unit price in sync whenever a user changes cost via Agregar Stock or Editar Stock
- Patch('08.Stock', ...) — three call sites: (1) Agregar Stock: increments Cantidad_ST on the matching (article,building) row or creates a new '08.Stock' row via Defaults() if none exists for that building; (2) Salida de Stock: decrements the source row's Cantidad_ST, and for Tipo_SS="TRASLADO" also increments/creates a destination-building row; (3) Editar Stock: overwrites Cantidad_ST, PrecioUnitario_ST, CondicionCorte_ST directly on RegistroArtEditStock
- Patch('08.MovimientoStock', Defaults(...), {...}) — audit-log insert on every one of the above mutations, recording before/after quantity, cost, stock-min, building, user (VarUser.ConcatName_Usr), timestamp, TipoMovimiento_MS ("Nuevo"/"Editado"/the Salida type), and Desde_MS origin tag ("Desktop - Stock" / "Desktop - Salida Stock"); Título field is always hardcoded to the literal "sumar" regardless of the actual operation — looks like leftover/mislabeled boilerplate
- Patch('09.SalidaStock', Defaults(...), {...}) — inserts the dispatch record (technician, tipo, fecha, cantidad, centro de costo, usuario) whenever stock is checked out via Salida de Stock
- No Remove()/delete calls anywhere on this screen — all list rows are soft-managed via Status_ST/Status_AR/Status_E flags elsewhere

## navigation
- gal_menu_ST item OnSelect → Screen_Home, Screen_Compras, Screen_Aprobaciones, Screen_OrdenesTrabajo, Screen_Ventilaciones, Screen_Configuracion (per Modulo_LPP), each preceded by a Refresh/ClearCollect of that module's lists; the 'Stock' branch on this same screen is dead code (Blank())
- bt_salidaStock_ST OnSelect → Navigate(Screen_SalidasStock) directly (bypasses the modal, unlike img_person_ST which opens PopUpSalidaStock first)
- bt_aceptar_SS (confirm Salida de Stock modal) OnSelect → after all Patches, Navigate(Screen_SalidasStock)
- bt_aceptarCerrarSesion_ST OnSelect → Navigate(Screen_Login) after resetting login inputs

## statuses
- Activo
- Nuevo
- Editado
- Null
- sumar
- CONSUMIBLE
- ASIGNACION
- DEVOLUCION
- TRASLADO
- Consumo Diario
- Admin
- Operador
- Tecnico
- Recepcion
- Compras
- Gerencia

## role_logic
Left-nav visibility is driven entirely by CollectPermisos rows filtered on VarUser.Perfil_Usr matching one of Admin_LPP/Operador_LPP/Tecnico_LPP/Recepcion_LPP = \"SI\"; the Compras profile branch resolves to Blank() so Compras users get no sidebar nav items rendered on this screen at all. Within the screen itself, two independent (and inconsistent) restrictions gate write actions: (1) the per-row edit-pencil and 'salida' icons are hidden when Perfil_Usr=\"Compras\" OR the specific hardcoded user ConcatName_Usr=\"Perche, Adriana\"; (2) the 'Ingresar Stock' button is disabled under that same Compras-or-Perche condition, but the 'Salida de Stock' button is disabled for Compras only (no Perche exception) — an inconsistency worth resolving (and the hardcoded named-user check should become a real permission flag) when porting to Supabase RLS/role-based access.

## visual_notes
Dark navy (#23313E) app chrome, white content cards, light-grey field fills (#F5F5F5) with #DFE6EB borders — consistent 'light form on dark shell' design language seen across TopRentals desktop screens. Accent/primary action color is the same dark navy reused for the 'Ingresar Stock' button (#23313E fill, white plus icon), while secondary actions ('Salida de Stock', refresh, edit-pencil, person/checkout icons) use a plain white/outline style with dark-grey (#6E7882/#19222B) icon strokes. Low-stock rows get a pale red wash (#FFF1F0) as an implicit warning badge — no explicit color-coded status pill exists, this row tint is the only 'alert' affordance on the whole table. All five popup/modal groups render as static background SVG art (title, labels, field boxes, and even button labels are baked into the image) with only invisible Classic/Button hit-targets and native TextInput/ComboBox/DatePicker controls overlaid on top — meaning in the current app the modal chrome/typography is not real text controls but flattened vector art, which will need to be recreated as real markup in React. The 'Cantidad Insuficiente' warning modal's boolean (WarningCantidadSalida) is reset to false by its own buttons but is never explicitly set to true anywhere in this screen's visible formulas — likely dead/vestigial validation that used to run and should be re-verified against intended behavior (quantity requested > available) before porting.

## react_mapping
Sidebar layout primitive for the left nav (icon list bound to a role-derived permissions array, same CollectPermisos-driven pattern used across all TopRentals screens) + a top toolbar row (Input/search with debounce, IconButton for refresh, Button variant=secondary for 'Salida de Stock', Button variant=primary/dark with leading plus icon for 'Ingresar Stock', both disabled via a role/user permission check rather than the current hardcoded name-string check). Main body → Table primitive with columns Código, Artículo, Edificio, Precio Unitario (MoneyInput display), Cantidad, Stock Mínimo, Costo Total (computed), row actions (edit IconButton, 'salida' IconButton) and a per-row low-stock indicator done properly as a StatusBadge/Badge('Bajo stock') instead of only a background tint. Footer totals → a small inline StatCard/KPI pair (Items, Total). Empty state → Card/EmptyState illustration+copy. The five popups become real Modal recipes (not baked-in SVG chrome): 'Agregar Stock' → Modal with Select(Edificio) + Combobox(Artículo, filtered) + MoneyInput(Precio Unitario) + Input(Cantidad) + Button(disabled until valid); 'Salida de Stock' → Modal with DateInput + Select(Tipo: CONSUMIBLE/ASIGNACION/DEVOLUCION/TRASLADO) + Select(Técnico) + read-only Combobox(Artículo) + fixed Select(Uso) + Select(Centro de Costo) + validated Confirm; 'Editar Stock' → Modal with Input(Cantidad), Input(Stock mínimo), MoneyInput(Costo unitario); 'Cantidad Insuficiente' → replace with a Toast(error) instead of a full-screen modal, since it's purely a validation message; 'Cerrar Sesión' → a generic ConfirmDialog recipe reused app-wide. Global LoadingLocal overlay → a single app-level Spinner/loading-boundary component instead of a per-screen image. Mobile (field-technician companion, if this screen is ever needed there): switch the Table to a stacked Card-per-article list (article+building as title, qty/cost as body rows, edit/salida as trailing icon buttons or swipe actions) and switch all Modals to bottom-sheets.