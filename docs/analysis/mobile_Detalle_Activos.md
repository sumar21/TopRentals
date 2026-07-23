# mobile / Detalle Activos

## Purpose
Read-only consultation screen for field technicians: shows every Orden de Trabajo (work order / incident) tied to a specific Activo (a building unit/department) once the tech picks that unit via a two-level filter. For each work order the tech can see status, assigned technician, and drill into two sub-details without leaving the screen: the incident observation text and the list of spare parts (repuestos) consumed on that order. No creation or editing of orders happens here — it is purely a browsing/detail screen that feeds off collections populated elsewhere in the app.

## Layout
Phone-frame canvas (640x1136). Header band: back-chevron icon button (top-left) and a bold screen title, plus a white pill "Filtrar" button (funnel icon + down-chevron) anchored top-right below the title. Main body: a single vertical Gallery (gal_detalleActivo, 145px row template) bound to CollectDetalleActivo; each row is a white rounded card containing a two-line text block (Torre - Departamento | Problema, then Técnico), a circular avatar/tech icon top-right of the card, a small chevron "view detail" hotspot, a dynamically-positioned status badge (image swapped per Status_OT, right-aligned, width/X shift per badge width), and an underlined "Ver repuestos" text link bottom-left. An empty-state icon (warning_Activos) replaces the gallery when CollectDetalleActivo has 0 rows. Three full-screen modal overlays (each a dark 12%-opacity scrim + centered/bottom white card, toggled by boolean context vars) sit above everything: Filtrar Activos (cascading 2-level combobox + Cancelar/Aceptar), Ver Repuestos (sub-gallery of parts), and Observación del Incidente (read-only text + Aceptar). A full-screen Loading overlay sits on top of all of that, toggled around every OnSelect handler.

## components
- bt_back_DA — icon-only back button; clears CollectDetalleActivo and Navigate('Home Tecnico', Fade)
- bt_filtrarActivos — opens the Filtrar Activos popup (sets PopUpFiltrarActivos=true)
- gal_detalleActivo — main vertical gallery over CollectDetalleActivo (BrowseLayout TwoText/OneImage variant, 145px rows)
- img_gal_DA — per-row white card background with avatar icon and chevron affordance
- lbl_nive24 — 'Torre_OT - Departamento_OT | Problema_OT' composite text
- lbl_tecnicoActivo — assigned technician name (Tecnico_IN)
- img_status_da — status badge image, swapped + repositioned per Status_OT via nested If()
- bt_verDetalle_DA — transparent hotspot; stores ThisItem.Detalle_IN into ObsDA and opens Observación modal
- bt_verRepuestos — underlined link; ClearCollect(CollectRepuestos, Filter('10.RepuestosOT', Status_ROT='Activo' && IDUnivoco_ROT=ThisItem.IDUnivoco_IN)) then opens Ver Repuestos modal
- warning_Activos — empty-state illustration shown when IsEmpty(gal_detalleActivo.AllItems)
- cmbox_nivel1_FA — 'building/edificio' combobox, Items=Distinct(CollectEdificiosOT, field_2)
- cmbox_nivel2_FA — 'unit/departamento' combobox, disabled until nivel1 chosen, Items=Filter(CollectEdificiosOT, field_2=nivel1.Selected.Value); shows field_1 via ComboBoxDataField
- bt_cruz_FA / bt_cancelar_FA — close/cancel the filter popup, Reset both comboboxes
- bt_aceptar_FA — disabled until cmbox_nivel2_FA has a selection; on select: ClearCollect(CollectDetalleActivo, Filter('07.OrdenesTrabajo', IDActivo_OT=cmbox_nivel2_FA.Selected.ID)), resets combos, closes popup
- gal_detalleRepuestos_1 — sub-gallery over CollectRepuestos (69px rows) inside Ver Repuestos modal
- bt_fondoGal_RT_2 / TextCanvas4_2 / Button2_2 — disabled blue card row showing Repuesto_ROT name and Cantidad_ROT as a pill badge
- bt_cruz_VR_1 — closes Ver Repuestos modal (VerRepuestos=false)
- LBL_InfoIncidente_da — shows ObsDA, or 'Sin Observaciones' when blank
- bt_cruz_ODA / bt_aceptar_ODA — both simply close the Observación modal (no writes)
- img_loading_HA — full-screen blocking loading overlay tied to the Loading context variable

## modals
- Filtrar Activos (Group_FiltrarActivos, toggled by PopUpFiltrarActivos) — cascading building→unit combobox filter that (re)loads CollectDetalleActivo
- Ver Repuestos (Group_VerRepuestos_DA, toggled by VerRepuestos) — read-only list of spare parts consumed on the selected work order
- Observación del Incidente (Group_Obs_DA, toggled by ObservacionIncidente) — read-only incident detail text with a fallback 'Sin Observaciones'
- Loading overlay (img_loading_HA, toggled by Loading) — full-screen blocking spinner wrapped around every OnSelect handler in the screen

## data_reads
- '07.OrdenesTrabajo' via Filter(IDActivo_OT = cmbox_nivel2_FA.Selected.ID) → CollectDetalleActivo; fields consumed per row: Torre_OT, Departamento_OT, Problema_OT, Tecnico_IN, Status_OT, Detalle_IN, IDUnivoco_IN
- '10.RepuestosOT' via Filter(Status_ROT='Activo' && IDUnivoco_ROT=ThisItem.IDUnivoco_IN) → CollectRepuestos; fields: Repuesto_ROT, Cantidad_ROT
- CollectEdificiosOT — pre-existing app-level collection (not populated on this screen, presumably loaded at app/Home level) used purely client-side for the cascading filter; fields field_1 (display label), field_2 (building/grouping key), ID (unit id passed into the OrdenesTrabajo filter)

## data_writes
- None. This screen performs no Patch/Remove/SubmitForm against SharePoint and calls no Power Automate flows and sends no emails. The only 'writes' are local: ClearCollect(CollectDetalleActivo, …) and ClearCollect(CollectRepuestos, …) — both re-populate local collections from read-only Filter() queries, plus Clear(CollectDetalleActivo) on back-navigation and Reset() on the two comboboxes.

## navigation
- bt_back_DA.OnSelect → UpdateContext({Loading:true}); Clear(CollectDetalleActivo); Navigate('Home Tecnico', ScreenTransition.Fade); UpdateContext({Loading:false}). This is the only Navigate() call in the screen — every other interactive control only toggles local boolean context variables (PopUpFiltrarActivos, VerRepuestos, ObservacionIncidente, Loading) to show/hide the in-screen modal overlays.

## statuses
- Pendiente
- Asignada
- Cerrada
- Cerrada V
- Cerrada F
- Anulada
- Activo (used only as a RepuestosOT row filter, not shown as a badge on this screen)

## role_logic
No permission/role gating exists on this screen — there are no references to CollectPermisos, 99.ABM_ListaPermisosPerfilesV3, or any user-profile field in any Visible/DisplayMode formula. All visibility here is purely data-state driven (IsEmpty(gallery), CountRows(CollectDetalleActivo), the four popup booleans, and combobox selection state for enabling Aceptar). Any technician-role gating for this screen is presumably enforced upstream (e.g., at 'Home Tecnico' navigation or app-level routing), not within Detalle Activos itself.

## visual_notes
Background (001.svg): black phone-bezel frame around a white 640x1136 canvas; back chevron icon top-left; bold title text; a white 'Filtrar' pill button (border #D6D6D6) with a funnel icon and a down-chevron (#545454) at x=437,y=160. Gallery card (003.svg, 572x127 white rounded card, border #DDE4F2): circular avatar/technician icon (border #C7C6C6, glyph #66686C) top-right, and a small right-pointing chevron as the 'view detail' affordance. Empty state (002.svg): rounded-square outline card with a light-gray circular badge (#C8CACC) and a bell/alert glyph outline (#19222B) — generic 'nothing to show' illustration. Status badges (004–009.svg) all share one pill design (small rounded rect, ~4-5px radius, colored fill + slightly darker border + saturated text), one palette per literal: Pendiente = orange (#FFE7C2/#FEC877/#C07402), Asignada = yellow (#FAFFB4/#EDF674/#A3A209), Cerrada = green (#DBFFCA/#CBEABD/#3A8517), 'Cerrada V' = blue (#E9F4FF/#B7D4EF/#3A6894), 'Cerrada F' = magenta (#FFE9FB/#EFB7ED/#943A8B), Anulada = red (#FFC9C7/#E6ABA8/#A6100A). All three popups (010/011/012.svg) share one overlay language: full-screen black scrim at 12% opacity, a white rounded card, a top-right circular 'X' close icon (#878787), and — where there's a primary action (Observación's Aceptar, filter's Aceptar) — a dark navy pill button (#23313E fill, white text) anchored near the bottom. The filter popup (010.svg) stacks two gray input-look boxes (#F5F5F5 fill, #DFE6EB border) for the cascading comboboxes above a light Cancelar button and (inferred, not fully rendered) a dark Aceptar button mirroring it. The Ver Repuestos popup shows each part as a solid blue (#3860B2) disabled pill row with a darker quantity badge. The loading overlay (013.svg) is an auto-exported complex asset (Figma-style, embedded base64 PNG) — a full-screen dark blocking spinner, not something to hand-carry into React as-is.

## react_mapping
Header → simple mobile topbar: IconButton (back) + page Title + a ghost Button('Filtrar', icon=Filter) that opens a bottom Drawer/Modal (mobile bottom-sheet variant) instead of a full-screen popup. Main list → this is the textbook 'gallery → cards' mobile pattern: render a stacked list of Card components (one per work order), each Card composed of: Text (title line: torre - depto | problema), Text muted (técnico), StatusBadge with a variant map for the 6 literal statuses (Pendiente/Asignada/Cerrada/'Cerrada V'/'Cerrada F'/Anulada → warning/info/success/success-alt/purple/danger tones), an Avatar for the technician icon, and a trailing chevron IconButton that opens the Observación content in a bottom-sheet Modal (Text body, fallback 'Sin Observaciones', single Aceptar Button to dismiss — effectively a read-only Modal, no form). 'Ver repuestos' → ghost/link Button opening a second bottom-sheet Modal containing a small list (map Repuesto_ROT + Cantidad_ROT to Table-to-card rows: Text + Badge for quantity) fed by a Supabase query keyed on the OT's unique id. Filter popup → Modal/Drawer with two cascading Combobox/Select components (Select #2 disabled until Select #1 has a value, mirroring DisplayMode logic), a secondary Button (Cancelar) and a primary Button (Aceptar, disabled until Select #2 has a value) that fires the query and closes the drawer. Empty state → replace the raw warning image with the kit's EmptyState pattern (icon + caption). Loading overlay → replace the custom full-screen image with the kit's Spinner/Toast-style blocking overlay, driven by the same query's isLoading flag instead of a manual Loading boolean. State/data layer: collapse the four booleans (PopUpFiltrarActivos, VerRepuestos, ObservacionIncidente, Loading) into one `activeSheet: 'filter' | 'repuestos' | 'obs' | null` plus query isLoading state; replace ClearCollect+Filter Power Fx with two Supabase reads — `ordenes_trabajo` filtered by `id_activo = selectedUnitId` and `repuestos_ot` filtered by `status = 'Activo' AND id_unico = otId` — via React Query hooks, invalidated/refetched on filter Aceptar. No write endpoints are needed since this screen is 100% read-only.