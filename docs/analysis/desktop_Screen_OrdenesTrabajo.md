# desktop / Screen_OrdenesTrabajo

## Purpose
Back-office hub for managing building-maintenance Work Orders ("Ordenes de Trabajo"): lists all OTs for the current + previous month by default, lets staff create/edit a work request, assign a technician plus spare parts (currently a disabled/hidden feature), track a per-OT log (bitacora) with photos, close/void/replicate orders, and email the requester when an OT is resolved. It is the operational hub feeding Stock, Compras and Aprobaciones via shared master data (buildings/units, spare parts, users).

## Layout
Full-bleed dark navy (#23313E) app frame. Left column (GroupExtras_OT): 126x45 app logo, then a vertical nav gallery (gal_menu_HM_6) built from role-filtered CollectPermisos rows sorted by field_8, spanning y=67..625. Right side is a white rounded card (x=163..1353) containing a header strip (y=25..77) with a search input, a refresh icon-button, a "Nueva Solicitud" pill button, and a filters trigger; below it an auto-layout scrollable container (container_Incidentes, 1158x650) holding a static column-header strip image plus the main data gallery (gal_incidentes, 2524px wide, horizontal scroll, TemplateSize 50, ~14 text columns per row). Roughly 18 full-screen modal overlays are layered on top as Group_* containers toggled by boolean context vars, each rendered as a dark scrim plus a centered white rounded card with an X close icon. A logout-confirm overlay and a global loading-spinner overlay sit above everything else.

## components
- Left nav gallery gal_menu_HM_6 - vertical icon list; Items = CollectPermisos filtered by profile flag (Admin_LPP/Operador_LPP/Tecnico_LPP/Recepcion_LPP="SI"), sorted by field_8; each item switches on Modulo_LPP to prefetch data and Navigate to Home/Stock/Compras/Aprobaciones/Ventilaciones/Configuracion screens (selecting "Ordenes de Trabajo" is a no-op, already here)
- Toolbar: txt_search_OT (client filter across Status_OT/ConcatActivo_IN/TipoTrabajo_IN/TipoTarea_IN), bt_refresh_AB_1 (re-runs the 2-step month+facet filter into CollectOT), bt_nuevaSolicitud_OT (disabled for profile 'Compras', opens Nueva OT modal), bt_filtros_OT (opens right filter panel)
- gal_incidentes - main OT table/gallery, 2524px wide row template, 14 text columns (ID, IDRevision 'IDF', Departamento/Torre, Detalle, Prioridad_IN, TipoTrabajo_IN, TipoTarea_IN, FechaInicio_OT, FechaAsignada_IN, DiasEstimado_IN, FechaCierre_OT, computed DiasReales via DateDiff, TipoPrioridad_OT) plus a status-badge image, a tipo-badge image (hidden for 'Compras'), and per-row action icons (editar, ver-repuestos, anular, replicar, bitacoras, terminar/finalizar) each independently role- and status-gated via Visible formulas
- warning_sinOT - empty-state illustration shown when gal_incidentes.AllItems is empty
- gal_imagenesAdjuntas_OT - attached-photos list inside the Add Photos modal, each row: filename + view icon + delete icon
- gal_bitacoras_OT - work-order journal list inside the Bitacoras modal, each row: date + description + optional 'view photo' icon
- gal_detalleRepuestos - read-only list of spare parts consumed on the OT (Ver Repuestos modal), each row: part name + quantity chip
- gal_repuestosTemporales / gal_repuestosAsignados_OT - spare-parts editor lists inside the (currently disabled) Asignar OT modal, each row: part + qty chip + edit icon + delete icon (soft-delete via Status_ROT='Inactivo')
- Group_Filtros_OT panel - 5 multi-select ComboBoxes (Mes rolling 12 months, Estado, Edificio, TipoTrabajo, TipoTarea) plus a 'Filtrar' button that rebuilds CollectOT via a chain of nested If/ClearCollect combinations and persists selections into context filter vars
- Loading_OT - full-screen spinner overlay bound to LoadingLocal, blocking interaction during every async action

## modals
- Group_CerrarSesion_OT (cerrarSesion) - logout confirmation; Aceptar navigates to Screen_Login, Cancelar/X close.
- Group_NuevaOT (PopUpGenerarOT/PopUpGenerarOTN/EditarOT) - Nueva/Editar Solicitud form: fecha inicio, cascading edificio/unidad combos, prioridad de unidad, prioridad(Alta/Media/Baja), tipo de trabajo, tipo de tarea, dias estimados, personas requeridas, detalle textarea, attach-photos entry point; Aceptar is disabled until all required fields are filled.
- Group_AgregarIamgenes_OT (PopUpAgregarFotosOT) - manage staged/attached photos for the OT being created/edited (AddMedia + gallery with view/delete), with an empty-state illustration.
- Group_ImagenAdjunta (VerFotoOT) - full photo/video/pdf viewer for an OT attachment (image, native Video control, or SharePoint stream embed for mp4/mov).
- Group_AnularOT (AnularOT) - void confirmation; Aceptar patches Status_OT='Anulada' and refreshes the list.
- Group_ReplicarOT (ReiniciarOT) - replicate a 'Cerrada F' OT into a brand-new linked 'Pendiente' OT.
- Group_PopUpBitacoras (PopUpBitacoras) - work-order journal viewer (list + 'Agregar' button), with an empty-state illustration.
- Group_AgregarBitacora (AgregarBitacora) - add a journal entry (multiline text + optional photo).
- Group_ImagenBitacora (VerFotoBitacora) - preview of a not-yet-saved bitacora photo.
- VerFotoBitacoraCargada (PopUpVerFotoBitacora) - viewer for an already-saved bitacora photo.
- Group_FinalizarOT (ResolverOT) - close/resolve the OT and trigger the resolution email.
- Group_CerrarOT (CerrarOT) - set a closure sub-status ('Cerrada V' / 'Cerrada F') with date and (unused) observations field.
- Group_Filtros_OT (Filtros) - right-side multi-facet filter panel described in components.
- Group_VerRepuestos_OT (PopUpVerRepuestos) - read-only view of spare parts consumed on the OT, with an empty-state illustration.
- Group_AsignarOT (AsignarOT/EditarAOT) - assign technician + spare parts to an OT; currently disabled (entry Visible hardcoded false, all children Visible blank) despite complete working logic including stock deduction and a WhatsApp summary link.
- Group_EditCantRepuesto (EditarRepuesto) - inline quantity editor for a spare-part row, with a stock-sufficiency check before commit.
- GroupWarning_CS (WarningCantidadSalida) - insufficient-stock warning dialog.
- Loading_OT (LoadingLocal) - global loading overlay.

## data_reads
- '07.OrdenesTrabajo' (main list) - Filter by Status_OT, FechaMes_IN (month-string bucket, current+previous month by default or by selected filter months), Torre_OT, TipoTrabajo_IN, TipoTarea_IN via a 2-step colFechaOT -> CollectOT pattern (works around the Power Fx 'in' operator + delegation limitation)
- '99.ABM_TipoUnidades' (buildings/units master) - Filter Status_ABMUnid='Alta' -> CollectEdificiosOT, Distinct(field_2) for the building combo and Filter(field_2=selected) for the cascading unit combo (field_1), used to build Torre_ABMUnid/Depto_ABMUnid concat on save
- '08.Stock' - Filter Status_ST='Activo' And Edificio_ST=<torre> -> CollectRepuestos (spare-parts picker in the disabled Asignar OT modal)
- '10.RepuestosOT' - Filter IDUnivoco_ROT=<idUnivoco> And Status_ROT='Activo' -> CollectRepuestosUsados (Ver Repuestos) / CollectRepuestosAsignados (Asignar OT)
- '15.Bitacoras' - Filter IDOrden_BC=<idUnivoco> -> CollectBitacoras
- '16.FotoBitacora' - Filter IDUnivoco=IDUnivocoOT_FB -> CollectFotosBitacora, LookUp by IDBitacora_FB for a specific entry's photo
- Documentos (SharePoint library) - Filter IDOrdenes=<idUnivoco> and folder-path pattern 'Documentos compartidos/Ordenes/<id>/' / '.../Bitacoras/<id>/'; results de-duplicated via GroupBy(Identificador)+ForAll(First(...)) to reconcile 'old path-based' vs 'new column-based' attachment records
- '99.ABM_Emails' - Filter Status_E='Activo', LookUp by Modulo_E='OT' for the resolution-email recipient
- CollectPermisos - pre-seeded elsewhere (likely App.OnStart from a permissions/profile master list), filtered per VarUser.Perfil_Usr for the left nav

## data_writes
- Patch '07.OrdenesTrabajo' Defaults(...) on create - Status_OT='Asignada' (never 'Pendiente' from this screen), IDUnivoco_IN='(OT)-<initials>-<ddmmyyyyhhmmss>', Tipo_IN='ORDEN DE TRABAJO', plus all form fields; immediately followed by an unconditional second Patch(RegistroOTEdit,{...}) in the same create branch which looks like dead/leftover edit-path code since RegistroOTEdit is blank during create
- Patch '07.OrdenesTrabajo' RegistroOTEdit on edit - same field set as create
- Patch '07.OrdenesTrabajo' Status_OT='Anulada' on void (bt_eliminarOT)
- Patch '07.OrdenesTrabajo' Defaults(...) Status_OT='Pendiente', IDRevision_IN=<original ID> on Replicar (creates a new linked OT from a 'Cerrada F' one)
- Patch '07.OrdenesTrabajo' Status_OT='Cerrada', FechaCierre_OT=Today() on Finalizar/Resolver, followed by Office365Outlook.SendEmailV2
- Patch '07.OrdenesTrabajo' Status_OT=cmbox_tipoCierre_COT.Selected.Value ('Cerrada V' or 'Cerrada F'), FechaCierre_OT on the Cerrar OT modal
- Patch '07.OrdenesTrabajo' Status_OT='Asignada', Asignador_OT, FechaAsignada_IN, ObservacionesAsignacion_IN on Asignar OT (disabled feature)
- Patch '10.RepuestosOT' create/update rows keyed by IDUnivoco_ROT + soft-delete via Status_ROT='Inactivo' (disabled Asignar OT feature)
- Patch '08.Stock' increment/decrement Cantidad_ST when spare parts are assigned/unassigned/quantity-modified (disabled Asignar OT feature)
- Patch '15.Bitacoras' Defaults(...) create journal entry; Patch '16.FotoBitacora' Defaults(...) optional attached photo (base64 JSON string)
- Remove(Documentos, LookUp(...)) - delete a previously persisted attachment when removed from the photo list before/after commit
- 'Arenera-SubirFoto'.Run(idUnivoco, filename, base64Foto) - Power Automate flow, uploads staged OT photo attachments after the OT Patch commits
- 'ObtenerVideo-TR'.Run(id or path) - Power Automate flow, resolves a SharePoint stream uniqueid for embedding a video/pdf preview
- Office365Outlook.SendEmailV2(...) - sends 'Resolucion - Orden de Trabajo' HTML email on close; recipient/Bcc logic branches on VarUser.UsuarioApp_Usr='Admin' vs. a lookup in '99.ABM_Emails' (note: this uses UsuarioApp_Usr, not Perfil_Usr like every other role check on the screen)
- Launch('whatsapp://send?text=...') - deep link summarizing a spare-parts assignment, with a hardcoded phone number appended only for the Admin user (disabled Asignar OT feature)

## navigation
- Left nav item 'Home' -> Screen_Home (prefetches CollectOTHome)
- Left nav item 'Stock' -> Screen_Stock (prefetches CollectStock, CollectEdificios)
- Left nav item 'Compras' -> Screen_Compras (prefetches CollectEdificios, CollectCompras)
- Left nav item 'Aprobaciones' -> Screen_Aprobaciones (prefetches CollectAprobaciones, role-dependent status filter)
- Left nav item 'Ventilaciones' -> Screen_Ventilaciones (prefetches multiple collections)
- Left nav item 'ABM' -> Screen_Configuracion (prefetches CollectArticulosABM)
- Left nav item 'Ordenes de Trabajo' -> no-op (Blank()), already on this screen
- Logout confirm Aceptar -> Screen_Login

## statuses
- Pendiente
- Asignada
- Cerrada
- Cerrada V
- Cerrada F
- Anulada
- SOLICITUD OT
- ORDEN DE TRABAJO
- Activo
- Inactivo
- Alta
- Vacante
- Vacante con ingreso
- Bloqueada
- Ocupada
- Media
- Baja
- Correctivo
- Preventivo
- Chequeo
- Mejora
- Pintura
- Electrico
- Ventilacion
- Otros

## role_logic
VarUser.Perfil_Usr drives almost everything visible: it filters CollectPermisos (Admin_LPP/Operador_LPP/Tecnico_LPP/Recepcion_LPP='SI') to build the left nav (profile 'Compras' gets Blank(), i.e. no nav items besides whatever is hardcoded elsewhere); it disables 'Nueva Solicitud' for 'Compras'; and it hides most per-row action icons (editar, ver-repuesto, anular, replicar, bitacoras, terminar, and the Tipo_IN badge) specifically for 'Compras', making that profile effectively read-only/procurement-scoped on this screen. Separately, per-row action visibility also depends on Status_OT (e.g. anular only if 'Asignada', replicar only if 'Cerrada F', terminar only if 'Asignada', ver-repuesto only if not 'Pendiente'). The resolution email's To/Bcc logic instead branches on VarUser.UsuarioApp_Usr='Admin' (apparently a username field, not the role field used everywhere else) - worth verifying against the real VarUser schema before porting literally. No explicit '99.ABM_ListaPermisosPerfilesV3' reference appears on this screen; CollectPermisos is assumed pre-seeded globally (e.g. App.OnStart) per the app-wide naming convention.

## visual_notes
Design system is consistent across the screen: dark navy (#23313E) outer frame; white content card (radius 19, border #E3E8ED, subtle drop shadow). Header controls: rounded search input (#F1F5F8 fill/#DFE6EB border), dark filled pill icon-buttons (refresh, filters), dark navy 'Nueva Solicitud' pill button with a plus icon. Table header rendered as one wide static SVG strip of alternating light-gray (#E3E9EE) column blocks with gray (#6B7680/#6E7882) labels - a clear horizontal-scroll data table (~14 columns). Status_OT renders as 6 distinct colored pill-chip SVGs, one per status, all sharing the same rounded-rect + centered bold text shape: Pendiente bg #FFE7C2/border #FEC877/text #C07402 (orange); Asignada bg #FAFFB4/border #EDF674/text #A3A209 (lime); Cerrada bg #DBFFCA/border #CBEABD/text #3A8517 (green); Cerrada V bg #E9F4FF/border #B7D4EF/text #3A6894 (blue); Cerrada F bg #FFE9FB/border #EFB7ED/text #943A8B (magenta); Anulada bg #FFC9C7/border #E6ABA8/text #A6100A (red). Tipo_IN chips use the same shape but a neutral palette: 'SOLICITUD OT' gray (#F9F9F9/#DADADA/#888888), 'ORDEN DE TRABAJO' blue (#E9F4FF/#B7D4EF/#3A6894). Empty-state illustrations (no OTs / no fotos / no bitacoras / no repuestos) share one visual language: white rounded card, circular icon (magnifying glass, camera, etc.), two-line gray message text. Every modal is a dark scrim (rgba(0,0,0,.5)) plus a centered white rounded card (radius 12), a top-right X close icon, form fields as light-gray rounded rectangles (#F5F5F5 fill/#DFE6EB border) with a gray label, and bottom action buttons as pill shapes (dark-filled primary 'Aceptar' vs. lighter/outline secondary 'Cancelar') - this single Modal recipe repeats roughly 14 times on this screen. Loading overlay is the same dark scrim with a centered blue (#3860B2-family) circular spinner.

## react_mapping
Sidebar layout primitive for the persistent left nav (icon logo + role-filtered nav list from a permissions hook, replacing the CollectPermisos gallery) wrapping a main content area with a sticky Toolbar (Input/search, Button 'Nueva Solicitud', IconButton refresh, IconButton filtros). Main list -> Table primitive mapped 1:1 from gal_incidentes columns, with a StatusBadge primitive covering the 6 Status_OT colors above and a plain Badge (neutral/info variant) for Tipo_IN; row actions become an IconButton group or row action-menu, each gated by role + status exactly as the current Visible formulas describe. Search -> debounced Input bound to a client or server filter. Filters -> right Drawer housing multiple multi-select Combobox/Select controls (Mes, Estado, Edificio, TipoTrabajo, TipoTarea) plus a primary Button 'Filtrar' driving a filter-state hook instead of chained ClearCollects. Nueva/Editar Solicitud -> Modal or right Drawer form: DatePicker, two cascading Select/Combobox (edificio -> unidad), two priority Selects, Select tipoTrabajo/tipoTarea, two numeric Inputs (dias estimados, personas requeridas), multiline Textarea (detalle), native file input + thumbnail list replacing AddMedia/base64-JSON, Button Aceptar (disabled via the same required-field rule) / Cancelar - implement as one reusable FormModal recipe shared with Cerrar/Anular/Replicar/Finalizar (all are small confirm-or-1-3-field modals). Attached photos -> Modal with a simple list (view/delete IconButtons) feeding a Lightbox modal for image/video/pdf (native <img>/<video>, no SharePoint stream-embed hack needed). Bitacora -> Drawer or Modal with a List/Timeline (date + text + optional photo) plus an 'Agregar' sub-form. Ver Repuestos / Asignar OT (flag as currently disabled before rebuilding) -> Table/list of parts with a quantity Badge, a searchable Combobox article picker, numeric Input with a stock-check Tooltip, and a small quantity-edit Modal. Insufficient-stock warning -> Toast; all empty-gallery illustrations -> a single EmptyState component reused per context. LoadingLocal -> a global Spinner/overlay tied to mutation isLoading state via react-query rather than manual boolean flags scattered per handler. On mobile/narrow viewport the 14-column table is the biggest desktop-only risk: recommend a table-to-cards pattern (one Card per OT showing id/status/detalle/dates with an expand affordance) and moving the Filtros panel to a bottom-sheet, per the mobile guidance for this kit.