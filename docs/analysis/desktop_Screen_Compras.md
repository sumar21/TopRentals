# desktop / Screen_Compras

## Purpose
Back-office purchasing (procurement) module. Lets Compras/Admin/other back-office roles create purchase requests ("Compras") with line items (articles, building, quantity, cost), route them through an internal approval workflow, mark them approved/received, receive goods into Stock with a photo/PDF receipt, and void requests. It is the operational hub connecting purchase requests, the approvals list, and the stock/inventory ledger.

## Layout
Full-screen desktop canvas (1366x768), dark navy (#23313E) app frame baked into a background SVG. Left: fixed sidebar (logo top-left, vertical nav gallery `gal_menu_HM_3` filtered by user's role via CollectPermisos, "Cerrar sesión" at bottom). Top toolbar (right of sidebar): refresh icon, "Nueva Compra" button, search TextInput, filter button (opens filter drawer). Main body: a table-like Gallery (`gal_compras_SC`) with a static header row baked into the background image (columns: ID, Usuario, Prioridad, Fecha, Cantidad, Monto Total) and one 1153x50 row per purchase order showing a status pill, ID, requester, urgency, date, qty, total, and contextual action icons. Empty state illustration replaces the gallery when there are zero visible rows. All secondary workflows (add/edit, view detail, approve, receive, void, filters, logout, document viewers, edit-line-quantity) are full-screen or centered overlay "Groups" toggled by boolean context variables, stacked on top of the base layout (Power Apps modal pattern — no true routing). A global loading overlay covers everything while `LoadingLocal` is true.

## components
- Sidebar nav gallery (gal_menu_HM_3) — role-filtered module list (Home/Stock/Aprobaciones/Ordenes de Trabajo/Ventilaciones/ABM/Compras), highlights current module
- Search TextInput (txt_search_SC) — filters the compras gallery client-side by Edificio, UsuarioCompra or ID substring
- Refresh icon button (bt_refresh_CP) — reloads Stock/Edificios/Compras/DetalleCompras collections from source lists (status Pendiente/Aprobada/Aprobacion only)
- Filter button (bt_Filtro_SC) — opens the filter overlay and preloads technician list
- Nueva Compra button (bt_AddCompra_SC) — preloads technicians/articles/users and opens the create-purchase overlay
- Purchases gallery (gal_compras_SC) — main data table: status badge image, ID, requester, urgency, date, qty, total, row action icons (edit, view detail, send-to-approval, void, receive, view attached document) each gated by Status_C
- Empty-state illustration (Img_WarningCompra_SC) — shown when the gallery has 0 rows
- Add/Edit Compra overlay (GroupAddCompra_SC) — technician/user Select, urgency Select, building Select (locked to user's building unless Admin/Compras), searchable article Combobox, quantity input, 'add line' button, temp cart gallery (CompraTemporal or CollectCompraEdit), observations textarea, cancel/accept
- Edit-line-quantity popup (GroupEditCantidas_SC) — recomputes CostoTotal_DC from quantity x unit price
- View Detail overlay (ViewDetailCompra_Group) — read-only gallery of line items + date + observation, and received quantity when Status_C='Recibida'
- Mandar a Aprobación overlay (Group_MandarAprobacion_SC) — confirms sending a Pendiente purchase into the approval pipeline
- Recibir Compra overlay (GroupRecibirCompra_SC) — per-line 'received quantity' input, delete/mark-not-received icon, receipt photo/PDF uploader (AddMedia), reception notes, accept/cancel; accept performs the stock intake transaction
- View-photo-during-receiving overlay (Group_VerFotoRecibida, var VerFotoRecibo) — nested inside Recibir Compra, previews the just-attached receipt
- View-stored-document overlay (Group_VerFoto_Recibida, var verPdf) — opened from a Recibida row's paperclip icon; fetches the archived receipt from the SharePoint 'Documentos' library / ObtenerPDF-Compra flow
- Anular Compra confirm overlay (Group_AnularCompra) — voids a Pendiente purchase
- Cerrar Sesión confirm overlay (Group_CerrarSesion_SC) — logout confirmation, navigates to Screen_Login
- Filtro overlay (Group_Filtros_SC) — Mes multiselect, Estado select, Tecnico search-combobox, apply button that re-filters CollectCompras
- Global loading overlay (Loading_SC, var LoadingLocal) — full-screen blocking spinner image
- DEAD/legacy overlay group (Group_VerFotoDetalle_SC) — every child control has Visible hardcoded to false and is not wired to any state variable; safe to drop when porting

## modals
- Filtro (Group_Filtros_SC, var PopUpFiltroSC): Mes multiselect combobox, Estado select, Tecnico search-combobox, apply/close
- Nueva/Editar Compra (GroupAddCompra_SC, var PopNuevaCompra||PopUpEdit): requester/urgency/building selects, article combobox+qty+add-line, cart gallery, observations, cancel/accept
- Editar cantidad de línea (GroupEditCantidas_SC, var PopUpEditCant): qty input, cancel/accept, nested inside #2
- Ver Detalle de Compra (ViewDetailCompra_Group, var PopUpViewDetail): read-only line-items gallery, date, observation, close
- Mandar a Aprobación (Group_MandarAprobacion_SC, var PopUpMandarAprobacion): confirm/cancel, writes Aprobaciones + sends email
- Recibir Compra (GroupRecibirCompra_SC, var RecibirCompra): per-line received-qty input + delete icon, receipt AddMedia uploader, notes, cancel/accept
- Ver foto/PDF del comprobante recién adjuntado (Group_VerFotoRecibida, var VerFotoRecibo): nested inside #6
- Anular Compra (Group_AnularCompra, var PopUpDelete): confirm/cancel, sets Status_C='Anulada'
- Cerrar Sesión (Group_CerrarSesion_SC, var cerrarSesion): confirm/cancel, navigates to login
- Ver documento archivado de una compra Recibida (Group_VerFoto_Recibida, var verPdf): image/PDF viewer + 'sin documentos' fallback, fetched via SharePoint + ObtenerPDF-Compra flow
- Loading overlay (Loading_SC, var LoadingLocal): full-screen blocking spinner, no user interaction
- DEAD (do not port): Group_VerFotoDetalle_SC — every child hardcodes Visible=false, unreachable

## data_reads
- '14.Compras' — Filter(Status_C = "Pendiente" Or "Aprobada" Or "Aprobacion") into CollectCompras (default table view = open purchases only; Recibida/Rechazada/Anulada are excluded unless the filter drawer's Estado/Mes selection pulls them in via CollectComprasF)
- '15.DetalleCompras' — Filter(IDCompra_DC = <compra> And Status_DC = "Activo") for edit cart, view-detail, and receive flows
- '99.ABM_Articulos' — Filter(Status_AR = "Activo") into CollectArticulos, used by the article Combobox and to resolve Codigo_AR/Articulo_AR/Corte_AR on stock intake
- '99.ABM_Edificios' — Filter(Status_E = "Activo") into CollectEdificios for the building Select
- '00.Usuarios' — Filter(Perfil_Usr = "Tecnico") and full '00.Usuarios' (CollectUserABM) to populate requester Combobox and the filter drawer's technician search
- '08.Stock' — Filter(Status_ST = "Activo") read before receiving, to detect existing stock rows to increment vs create
- '99.ABM_Emails' — read wholesale into CollectEmailCompra when opening 'send to approval' (email Bcc/body composition)
- CollectMails (module-to-email mapping) — LookUp(Modulo_E = "Compra") to pick the non-admin recipient when a purchase is received
- SharePoint 'Documentos' library — Filter('Ruta de acceso a la carpeta' = "Documentos compartidos/Compras/{ID}/") to find the archived receipt file for a Recibida purchase
- CollectPermisos — role-based filter (Admin_LPP/Operador_LPP/Tecnico_LPP/Recepcion_LPP = "SI") driving the sidebar's visible modules; profile 'Compras' resolves to Blank() (no sidebar items rendered for that role)

## data_writes
- Patch '14.Compras' Defaults(...) — create purchase header (Status_C:'Pendiente', IDCompra_C: generated '(BUY)-<init>-<timestamp>' id, totals summed from cart)
- ForAll Patch '15.DetalleCompras' Defaults(...) — insert one line per cart item (Status_DC:'Activo')
- Patch '14.Compras' LookUp(ID=IDRegistro) — update header fields when editing an existing Pendiente purchase (requester, urgency, obs, recomputed totals)
- ForAll Patch '15.DetalleCompras' — update existing lines (qty/cost) or insert new ones when editing; Patch(...,{Status_DC:'Inactivo'}) to soft-delete a line from the edit cart
- Patch '14.Compras' {Status_C:'Aprobacion'} + Patch '16.Aprobaciones' Defaults(...) — send a Pendiente purchase into the approval pipeline (creates Status_AP:'Pendiente' approval record with amount/qty snapshot)
- Office365Outlook.SendEmailV2 — 'Compra - Pendiente de Aprobación' to santiago.bianucci@sumardigital.com.ar (if current user is Admin, i.e. test routing) else to mantenimiento@thetoprentals.com, Bcc from lbl_correos_SM
- Patch '14.Compras' {Status_C:'Recibida', ObsRecibir_C} + ForAll Patch '15.DetalleCompras' {Recibido_DC, CostoTotal_DC} — mark purchase received and record actual received quantities/costs
- ForAll Patch '08.Stock' Defaults(...) or LookUp(...)+increment — creates or increments stock rows on receipt, with hardcoded building-pairing merge logic (16<->17, 1<->8, 4<->7, Admin<->'Admin 2', Hub<->Nuñez, 'Palermo Hollywood'<->Dorrego)
- Patch '08.MovimientoStock' Defaults(...) — audit row per stock change ('Nuevo' or 'Existente' movement type) with before/after quantities
- 'Arenera-SubirPDFCompra'.Run(id, filename, base64) / 'Arenera-SubirFotoCompra'.Run(id, filename, base64) — Power Automate flow uploading the receipt attachment to the SharePoint document library
- Office365Outlook.SendEmailV2 — 'Compra - Recibida' to santiago.bianucci@sumardigital.com.ar (Admin test routing) else to CollectMails lookup for module 'Compra'
- Patch(CollectRecibirCompra local collection) {Status_DC:'No Recibido'} — mark a line as not received (local only, still persisted via the ForAll Patch above)
- Patch '14.Compras' {Status_C:'Anulada'} + ForAll Patch '15.DetalleCompras' Defaults(...) {Status_DC:'Anulado'} — void a purchase; NOTE: this ForAll patches Defaults(), i.e. inserts new blank rows with Status_DC='Anulado' instead of updating the existing line records (likely bug — the intent was almost certainly Patch(ThisRecord,{Status_DC:'Anulado'}))
- 'ObtenerPDF-Compra'.Run(path) — flow fetching PDF bytes of an already-archived receipt for viewing
- BUG (found while tracing writes): bt_CancelarCompra_SC (the 'Cancelar' button inside the Add/Edit Compra overlay) calls Clear(CollectCompras) instead of Clear(CompraTemporal) — cancelling out of that form wipes the main purchases table in memory (empty grid) until the next explicit refresh, unlike the X/close button which correctly clears CompraTemporal

## navigation
- Sidebar 'Home' -> Screen_Home (loads open work orders)
- Sidebar 'Stock' -> Screen_Stock (loads active stock, scoped by building for Recepcion/Operador)
- Sidebar 'Compras' -> Blank() (stays on this screen, no-op)
- Sidebar 'Aprobaciones' -> Screen_Aprobaciones (loads approvals scoped by role: Gerencia sees 'Aprobada Supervision', Admin sees that + 'Pendiente', others just 'Pendiente')
- Sidebar 'Ordenes de Trabajo' -> Screen_OrdenesTrabajo (loads current+prior month work orders, building-scoped for Recepcion/Operador)
- Sidebar 'Ventilaciones' -> Screen_Ventilaciones (loads ventilation tasks + related lookups)
- Sidebar 'ABM' -> Screen_Configuracion (loads article ABM catalog)
- Cerrar Sesión confirm accept -> Screen_Login (resets login inputs)

## statuses
- Status_C: Pendiente
- Status_C: Aprobacion
- Status_C: Aprobada
- Status_C: Recibida
- Status_C: Rechazada
- Status_C: Anulada
- Status_DC: Activo
- Status_DC: Inactivo
- Status_DC: Anulado
- Status_DC: No Recibido
- UrgenciaPedido_C: Baja
- UrgenciaPedido_C: Media
- UrgenciaPedido_C: Alta
- Status_AP (created here, consumed by Screen_Aprobaciones): Pendiente

## role_logic
Sidebar module visibility is computed from CollectPermisos flags keyed by VarUser.Perfil_Usr (Admin_LPP/Operador_LPP/Tecnico_LPP/Recepcion_LPP = 'SI'); profile 'Compras' falls through to Blank() so those users see no sidebar items on this screen (likely unintended gap, not a deliberate lockdown — flag for product decision). Within the screen: the building Select in Nueva/Editar Compra is only editable for VarUser.Perfil_Usr in {Admin, Compras} — every other role gets it disabled and pre-filled with their own assigned building (VarUser.Edificio_Usr), preventing cross-building purchase requests. The requester Combobox only offers Tecnico-profile users, except when the logged-in user is Admin, who can also select themselves. The 'send to approval' action is visible for any role once a purchase is Pendiente — a prior restriction to Planificador/Supervisor/Gerencia/Admin is present in the formula but commented out, i.e. currently disabled/no-op. Both notification emails (approval-requested, received) route to a hardcoded developer inbox (santiago.bianucci@sumardigital.com.ar) when the acting user's UsuarioApp_Usr is 'Admin', and to the real business inbox otherwise — this is a test/prod email-routing shortcut baked into business logic that should become environment configuration, not a role check, in the rewrite.

## visual_notes
Consistent dark-navy (#23313E) chrome for the app frame, primary buttons and header search chip; light gray (#F5F5F5/#F4F4F4/#F1F5F8) for input/card surfaces; #E3E9EE for the baked-in table header row. Status pills are small rounded-rect badges rendered as pre-baked SVG images (text is vector-outlined, not real DOM text) with a consistent 2-tone convention: Pendiente = amber/orange (#FFE7C2 fill / #C07402 text), Rechazada = dusty red (#E2B1B1 / #865959), Aprobada = green (#DBFFCA / #3A8517), Aprobacion (en curso) = blue (#ECF9FF / #0594DD, widest pill at 104px), Recibida = light blue (#EDF9FF / #0594DD, same hue as Aprobacion but paler background) — i.e. two different blues currently used for two different meanings, a subtle disambiguation risk to fix in the React StatusBadge palette. Row action icons are plain 19-25px line icons: pencil (edit, #1C274C stroke), eye (view detail, #23313E stroke), trash (void, #A6413B/red stroke), price-tag (send to approval), green-circle checkmark (receive, #E2FFE0 bg / #63B75C check), document/list (view attachment, #1C274C stroke). All full-screen overlays share the same chrome: a semi-transparent black scrim (12%-50% opacity, some with a 1-2px backdrop blur) behind a white/light card, and a dark navy pill-shaped primary action button (rx 8) paired with a lighter/outline secondary button. Empty-state and 'no documents' placeholders reuse a plain gray circle (#EDEDED, 82px) icon-holder illustration.

## react_mapping
Sidebar layout primitive for the outer shell, with nav items sourced from a roles/permissions table (Supabase) instead of the CollectPermisos filter chain (flag: profile 'Compras' currently gets zero nav items — decide intentionally rather than porting the gap). Header row: Input (debounced search), IconButton for refresh, Button 'Nueva Compra', and a Filtro IconButton opening a right Drawer (replacing the absolutely-positioned filter card) containing Select (Mes, multi), Select (Estado), Combobox (Tecnico). Main content: Table with columns ID/Usuario/Prioridad/Fecha/Cantidad/MontoTotal (MoneyInput-formatted), StatusBadge per Status_C (fix the Aprobacion/Recibida color collision), row actions as an icon-button cluster or overflow menu gated the same way as today (edit only Pendiente, void only Pendiente, send-to-approval only Pendiente, receive only Aprobada, view-document only Recibida, view-detail always) wrapped in Tooltip for affordance; EmptyState card when filtered results are zero. Add/Edit Compra -> a right Drawer or large Modal form: Select x3 (requester, urgency, building — building Select disabled/prefilled unless role is Admin/Compras), Combobox (searchable article picker, excluding items already in the cart per the building-group de-dupe rule), Input (qty) + 'Add line' Button appending to a client-side cart Table (replace the duplicated gal_ArticulosCompra/gal_ArticulosCompraEdit_SC pair with one Table bound to a single cart state), inline-editable quantity cell (replaces the separate GroupEditCantidas_SC popup), Textarea (observations), Cancel/Submit Buttons — submit becomes one Supabase RPC that upserts the purchase + line items atomically (fixing the current two-step Patch/ForAll pattern). View Detail -> Modal + read-only Table/List. Mandar a Aprobación and Anular -> a shared ConfirmDialog/Modal recipe (accept/cancel), backed by an edge function that also fires the approval-created email — replace the hardcoded 'if Admin, send to a developer's personal inbox' test-routing with environment-based recipient config. Recibir Compra -> Modal/Drawer with an editable Table (received-qty NumberInput per row, delete/mark-not-received action), a file Upload component (Supabase Storage bucket + signed URL, replacing the SharePoint library + 'Arenera-SubirPDFCompra'/'Arenera-SubirFotoCompra' flows and the 'ObtenerPDF-Compra' viewer flow), Textarea, and Accept/Cancel — the whole stock-intake side effect (Stock upsert with the building-pairing merge table, MovimientoStock audit insert, status transitions, notification email) should become a single Postgres function/RPC for atomicity, and the hardcoded building-pairing Switch (16/17, 1/8, 4/7, Admin/Admin2, Hub/Nuñez, Hollywood/Dorrego) should move into a `building_group_id` column on the buildings table instead of being re-encoded in code. Photo/PDF preview overlays -> a single Modal with an image or embedded PDF viewer plus EmptyState fallback (collapse the three near-duplicate viewer groups — VerFotoRecibida, VerFoto_Recibida, and the dead VerFotoDetalle_SC — into one reusable component). Logout confirm -> ConfirmDialog. Loading overlay -> global Spinner/Skeleton via a loading store, not a screen-local boolean. This screen is desktop/back-office only; if ever exposed on mobile, collapse the Table to stacked Cards and the Filtro Drawer to a bottom sheet, per the kit's responsive recipes.