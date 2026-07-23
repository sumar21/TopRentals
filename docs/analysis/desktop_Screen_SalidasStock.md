# desktop / Screen_SalidasStock

## Purpose
Back-office screen for Stock Outbound Movements ("Salidas de Stock"): a history/ledger of every time stock items left a warehouse — assigned to a technician, consumed, transferred between buildings, or lent out for later return. From here an operator can search/filter the log, correct a mis-entered quantity on an existing outbound record, and confirm the return ("devolución") of previously transferred stock. Reached from Screen_Stock and returns to it.

## Layout
Dark rounded shell (#23313E) framing a white content card (163,16 – 1190x736, radius 19, border #E3E8ED). Search box, back button and header chrome are baked into the background SVG. Left vertical nav (gal_menu_SS, permission-filtered). Header row: logo, decorative tab-bar image, search input (X=1036), circular back-arrow (X=182) -> Screen_Stock. Main list gal_salidaStock (182,125, 1166x565, rows 49px): type badge, date, technician, article, quantity, cost center, edit/receive icons. Floating filter panel (266x338 at 1075,28). Three full-screen modals (Edit Salida ~413x237, Confirmar Devolución 501x162, Cerrar Sesión 501x162) + loading overlay.

## components
- gal_menu_SS — vertical icon nav from CollectPermisos filtered by role flag, sorted by field_8
- txt_search_SS — free-text search (Tecnico_SS or Tipo_SS substring)
- bt_backStock — back to Screen_Stock
- gal_salidaStock — main gallery: img_edit_SS (pencil, opens Edit modal), lbl_fecha/tecnico/articulo/cantidad/centroCosto (fallback "-"), IMG_TIPO_SS (type badge switched on Tipo_SS), img_RecibirStock (green check, opens Devolución modal, only for pending DEVOLUCION rows)
- bt_filtrar_SS / bt_cruz_FSS — open/close filter panel
- cmbox_mes_FSS, cmbox_tipo_FSS, cmbox_tecnico_FSS — multi-select comboboxes + bt_filtrar_FSS apply

## modals
- Group_EditSalida (PopUpEditarSalida) — edit quantity of an outbound record: input_cantidad_STT, Save (disabled if new qty > available stock or empty), Cancel/X
- GroupDevolucion (PopUpDevolucion) — confirm return of a DEVOLUCION-type item: Confirmar/Cancelar/X
- Group_CerrarSesion_SS (cerrarSesion) — logout confirmation
- Group_Filtros_SS (Filtros) — slide-in side panel with 3 filter combos + apply
- Loading_SS (LoadingLocal) — full-screen loading overlay

## data_reads
- '09.SalidaStock' -> CollectSalidasStock (primary; re-filtered by current/previous month after every write)
- '08.Stock' -> CollectStock (Status_ST="Activo"); ad-hoc Filter/LookUp by ID/IDArticulo_ST during edit and devolución (CollectArticuloSalida)
- '99.ABM_Edificios' -> CollectEdificios (loaded on nav-in, not consumed here)
- CollectPermisos — nav items; CollectUsers -> Distinct technicians (Perfil_Usr="Tecnico") for cmbox_tecnico_FSS
- No Power Automate flows, no emails on this screen

## data_writes
- bt_guardarEditSTT (edit quantity — 4 patches): Patch('08.Stock') source article: Cantidad_ST = CantidadStock + CantidadEdit - newQty; Patch('08.Stock') destination building (matched by IDArticulo_ST + CentroDeCosto_SS in Edificio_ST): inverse delta; Patch('09.SalidaStock') Cantidad_SS = newQty; Patch('08.MovimientoStock', Defaults) audit row (TipoMovimiento_MS = "<Tipo_SS> - EDIT CANT", Desde_MS="Desktop - Salida Stock", Status_MS="Null"). Then Refresh + reload collections.
- bt_confirmar_CSS (confirm return — 2 patches): Patch('08.Stock') adds CantidadDevolucion back to Cantidad_ST; Patch('09.SalidaStock') FechaReingreso_SS=Today(), Tipo_SS="DEVUELTO". NOTE: the MovimientoStock audit patch is ENTIRELY COMMENTED OUT — confirming a return leaves NO audit trail (gap to fix in the rewrite).

## navigation
- bt_backStock -> Screen_Stock; shared left-nav Switch -> all module screens; logout -> Screen_Login

## statuses
- Tipo_SS: ASIGNACION, CONSUMIBLE, DEVOLUCION, DEVUELTO, TRASLADO
- BUG: filter combo cmbox_tipo_FSS items = [ASIGNACION, CONSUMIBLE, DEVOLUCION, DEVUELTO] — TRASLADO missing, transfer rows can never be isolated via filter
- BUG: in bt_filtrar_FSS multi-month branch, two of four nested If combinations reference cmbox_tecnico_FSS.SelectedItems where cmbox_tipo_FSS.SelectedItems was intended — silently mis-filters by type when >1 month selected
- Sentinel "Todos"; Status_MS literal string "Null"; Título literal "sumar"

## role_logic
- Left nav from CollectPermisos per profile flag
- Hard-coded per-user exclusion: img_edit_SS.Visible = If(FechaReingreso_SS<>Blank() || VarUser.ConcatName_Usr = "Perche, Adriana", false, true) — convert to a real permission flag
- Edit hidden once record returned (FechaReingreso_SS populated); receive icon only for Tipo_SS="DEVOLUCION" still pending

## visual_notes
Shell navy #23313E; white card border #E3E8ED r19; search #F1F5F8/#DFE6EB; back button #19222B circular. Type badges (pill r~4.5): DEVUELTO #ECEDFF/#97AFFF/#444ABF (purple); ASIGNACION #D0F5C9/#92E084/#2C991B (green); DEVOLUCION #ECF9FF/#9BD0EB/#0594DD (blue); CONSUMIBLE #FFF6C5/#DFC852/#BFA000 (yellow); TRASLADO #F5E1C9/#E0AF74/#C16900 (orange). Receive icon green check circle #E2FFE0/#ACDEA9/#63B75C. Modals white r12 border #E7E6E6, backdrop black 12% + blur. Filter panel inputs #F5F5F5/#D8D4D4, primary button #232323.

## react_mapping
Sidebar layout; Input search; Button back; Table for the ledger; StatusBadge per Tipo_SS; per-row icon Buttons conditionally rendered; Edit Salida -> Modal (qty Input + validated Save); Devolución -> ConfirmModal; Logout -> shared ConfirmModal; Filters -> right Drawer / FilterBar with 3 multi-select Combobox + apply; loading -> page Loader. Fix in port: add TRASLADO to type filter, fix tipo/tecnico combo mix-up, add the missing devolución audit write (symmetric with edit flow), replace "Perche, Adriana" name-check with permission flag.
