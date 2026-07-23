# mobile / Ordenes de Trabajo

## Purpose
Home screen for a field technician's assigned Work Orders (Órdenes de Trabajo, "OT"). Lets the technician see OTs pending/assigned for their building(s), drill into a work order's detail (fields, priority, attached photos/video), assign spare parts consumed from stock, close/resolve the OT (which emails a notification), and create new maintenance-request tickets ("Nueva Solicitud") with photo attachments. Also lets the technician switch which building/tower they are currently viewing.

## Layout
Single Canvas-Apps screen built as one flat z-stack of "Group" containers toggled by boolean context variables (SPA-style modals, not separate screens). Base layer (Group "GroupExtras_OT"): top app-bar with back-arrow button (navigates to 'Home Tecnico'), screen title + a 3-dot "more" icon that opens a small in-place action menu (Cambiar edificio / Agregar solicitud / Actualizar incidentes). Below the app-bar is the main vertical Gallery of work-order cards (594x166 px template) with a small floating Timer control (used to auto-clear the Loading flag) and an empty-state illustration shown when there are no items. Every other Group is a full-screen dim overlay (black 12% opacity) with a centered white rounded card (x=34, variable y/height) acting as a bottom-sheet/modal: repuestos list, OT detail, attached-photos list, single photo/video viewer, "nueva solicitud" form, photo-staging ("agregar fotos") list, local photo/video preview, change-building picker, assign-spare-parts picker, and a small close/resolve-OT confirmation. A full-screen loading overlay (Loading var) sits above everything.

## components
- Gallery gal_IncidentesTecnico — main work-order list, one card per OT (Torre - Departamento title, TipoTrabajo | FechaAsignada subtitle, priority chip, 'Ver Detalle' dark pill button, 'Repuestos' outline pill button, circular green 'complete' checkmark button)
- warning_OT — empty-state illustration (question-mark circle icon) shown when the gallery has no items
- bt_MenuIncidentes_OT + Img_MiniMenuActualizar_OT — 3-dot icon opening an inline action menu with 3 rows: Cambiar edificio, Agregar solicitud (nueva OT), Actualizar incidentes (re-filter list by building cluster)
- Priority badge (Img_Status_OT) — 3 color variants driven by TipoPrioridad_OT: Baja=blue, Media=yellow, Alta=green (note: not a red-for-urgent scheme)
- Group_VerRepuestos — read-only popup listing the spare parts already assigned to the selected OT (name + quantity chip per row)
- Group_DetalleOBS_OT — OT detail popup: Torre, Departamento, Fecha asignada, Tipo de prioridad, Prioridad, Tipo de trabajo, Días estimado, Personas requeridas, Detalle (multiline), plus a 'Ver Foto' button when photos exist (layout Y-offsets shift depending on SinFoto)
- Group_ImagenesDetalle_1 — list of attached photos/videos for the OT, each row has a file-name label and a view icon; Cerrar/Aceptar both return to the detail popup
- Group_VerFotoDetalle_OT — full image viewer (Image from CollectImagenesAdjuntadas Miniatura.Large) or StreamVideo control (fed by 'ObtenerVideo-TR' flow's uniqueid) when the file is .mp4/.mov
- Group_NuevaSolicitud — new-ticket form: DatePicker, cascading ComboBox Torre → ComboBox Departamento, multiline TextInput 'Detalle', 'Subir Fotos' trigger, Cancelar/Aceptar pills (Aceptar disabled until required fields are filled)
- Group_AgregarIamgenes_OT — photo-staging popup: AddMedia capture control, gallery of staged photos (thumbnail label + view icon + trash/delete icon), empty-state warning image when none staged, Cerrar/Aceptar
- Group_VerFoto_OBS_1 — preview of one *not-yet-uploaded* local photo/video (Image or Video control bound to ImagenAux) before confirming the new ticket
- GroupCambioTorre_OT — change-building popup: ComboBox of building clusters + Cancelar/Aceptar (re-filters the main OT collection and sets the active building context var)
- GroupAddRepuesto_OT — assign-spare-parts popup: search TextInput, GalleryRepuestos rows (article name, numeric quantity Input validated in red when it exceeds available stock, hidden helper labels for delta calc), empty-state 'sin stock' illustration, Cerrar/Aceptar
- Group_CerrarOT — small confirmation popup to resolve/close the OT (Aceptar patches status to Cerrada + sends an email; Cancelar/X dismiss)
- img_loading_OT — full-screen loading overlay bound to the Loading context variable

## modals
- Mini action menu (MenuIncidentes) — Cambiar edificio / Agregar solicitud / Actualizar incidentes
- Group_VerRepuestos (VerRepuestos) — read-only assigned-parts list
- Group_DetalleOBS_OT (VerDetalleOT) — full OT detail fields
- Group_ImagenesDetalle_1 (VerFotosDetalle) — attached photos/videos list
- Group_VerFotoDetalle_OT (VerFotoAdjunta) — single attached photo/video viewer
- Group_NuevaSolicitud (NuevaSolicitud) — new work-order request form
- Group_AgregarIamgenes_OT (PopUpAgregarFotosOT) — staged photo/video list for the new request
- Group_VerFoto_OBS_1 (VerFotoOT) — preview of one staged (not yet uploaded) photo/video
- GroupCambioTorre_OT (PopUpCambioTorre) — change active building
- GroupAddRepuesto_OT (popUpAddRepuesto) — assign spare parts from stock to an OT
- Group_CerrarOT (ResolverOT) — confirm resolving/closing the OT
- img_loading_OT (Loading) — global loading overlay

## data_reads
- '07.OrdenesTrabajo' → CollectOT: Filter(..., DateValue(FechaAsignada_IN) <= DateValue(Today()) And Status_OT="Pendiente" || Status_OT="Asignada") for the initial gallery Items (also re-filtered on 'Actualizar incidentes' and 'Cambio de edificio' with extra Status_OT="Programada" and per-building-cluster OR logic, and after closing an OT: Filter(Tecnico_IN = NombreUser And (Status_OT="Asignada" Or Status_OT="Pendiente")))
- '10.RepuestosOT' → CollectRepuestos: Filter(Status_ROT="Activo" And IDUnivoco_ROT = ThisItem.IDUnivoco_IN) — parts already assigned to the tapped OT
- '08.Stock' → CollectAddROT: Filter(ThisItem.Torre_OT in Edificio_ST, Status_ST="Activo") — stock available for the OT's building, used by the assign-parts popup and validated against quantities already assigned
- '99.ABM_TipoUnidades' → CollectEdificiosOT: Filter(Status_ABMUnid="Alta"); CollectDepartamentos: Filter(Torre_ABMUnid = <selected building>, Status_ABMUnid="Alta") — cascading building/unit picklists
- Documentos (SharePoint library) → CollectImagenesAdjuntadas: Filter('Ruta de acceso a la carpeta' = "Documentos compartidos/Ordenes/" & IDUnivoco_IN & "/") — attached photos/videos for the OT detail popup
- '99.ABM_Emails' → CollectMails: Filter(Modulo_E="OT") — lookup of the notification recipient used when closing an OT

## data_writes
- Patch '07.OrdenesTrabajo' Defaults(...) — create a new work order from 'Nueva Solicitud': Título, Status_OT="Asignada", IDUnivoco_IN, Tipo_IN="SOLICITUD OT", Detalle_IN, FechaInicio_OT, Torre_OT, Departamento_OT, IDActivo_OT, ConcatActivo_IN, Desde_IN="Mobile", FechaMes_IN, FechaMesAno_IN, FechaAsignada_IN, UserCarga_IN, Version_IN, Hora_IN
- Patch '07.OrdenesTrabajo' LookUp(ID=IDRegistro) — close/resolve an OT: Status_OT="Cerrada", Tecnico_IN=NombreUser, FechaCierre_OT=Today()
- Patch '10.RepuestosOT' Defaults(...) or LookUp(existing) — assign/update a spare part on the OT: Título, Usuario_ROT, Fecha_ROT, Hora_ROT, IDUnivoco_ROT, Edificio_ROT, Repuesto_ROT, Cantidad_ROT, IDArticulo_ROT, MesAño_ROT, VersionApp_ROT, Status_ROT="Activo"
- Patch '08.Stock' LookUp(ID=RowID) — decrement/increment Cantidad_ST by (previous stock + previously-assigned qty) - newly-assigned qty
- Patch '08.MovimientoStock' Defaults(...) — audit row for the stock change: Usuario_MS, IDArticulo_MS, ConcatArticulo_MS, CantAnterior_MS, CantPosterior_MS, IDEdificio_MS, Edificio_MS, Desde_MS="Mobile - OT", TipoMovimiento_MS="Asignacion Repuesto", Fecha_MS, Hora_MS, Status_MS="Null", MesAño_MS, VersionApp_MS
- ForAll(CollectImagenesOT) 'Arenera-SubirFoto'.Run(IdUnivoco, nombreArchivo, base64) — Power Automate flow uploading each staged photo to the SharePoint document library for the new OT
- 'ObtenerVideo-TR'.Run(ThisItem.ID) — flow returning a SharePoint stream uniqueid, used to build the embed URL for .mp4/.mov attachments
- Office365Outlook.SendEmailV2(...) on close — sends 'Resolucion - Orden de Trabajo' HTML email; recipient/Bcc chosen by RegistroUser.UsuarioApp_Usr
- Remove(CollectImagenesOT, ThisItem) — local-only removal of a staged (not-yet-uploaded) photo

## navigation
- bt_backOT → Navigate('Home Tecnico', ScreenTransition.Fade) — clears CollectAddROT and the building context vars before leaving
- All other screen transitions are in-place modal toggles via boolean context vars (MenuIncidentes, VerRepuestos, VerDetalleOT, VerFotosDetalle, VerFotoAdjunta, NuevaSolicitud, PopUpAgregarFotosOT, VerFotoOT, PopUpCambioTorre, popUpAddRepuesto, ResolverOT) — no further Navigate() calls elsewhere in the screen

## statuses
- Pendiente
- Asignada
- Programada
- Cerrada
- Activo
- Alta
- Baja
- Media
- Admin
- SOLICITUD OT
- Mobile
- Mobile - OT
- Asignacion Repuesto
- Null

## role_logic
No CollectPermisos / ABM_ListaPermisosPerfilesV3 references exist on this screen — there is no role-based show/hide of controls here (permission gating, if any, happens before reaching this screen, e.g. at 'Home Tecnico'). The only role-sensitive logic is in the close-OT email step: `If(RegistroUser.UsuarioApp_Usr = "Admin", send to lbl_mailssumar.Text as primary, send to the '99.ABM_Emails' OT-module recipient as primary with lbl_mailssumar.Text as Bcc)` — i.e. the technician's profile flag only changes who is the primary vs. Bcc recipient of the resolution email, not what they can see or do.

## visual_notes
Frame (001.svg): white rounded card (rx=35) on black background, header row with a back-arrow icon, screen-title glyphs, and a vertical 3-dot menu icon (#374957) top-right. Empty/info illustrations reuse one visual language across the screen — a dark-navy (#1F2B37) stroked circle with a "?"/info glyph — for: no work orders (002.svg), no repuestos assigned (007.svg), no photos attached warning (020.svg), no stock available (025.svg). Work-order card (003.svg): white card, dark-navy pill button "Ver Detalle" (#23313E) with a clipboard/chat icon, white outline pill "Repuestos" (border #DADADA) with a wrench-like icon, and a circular success button (fill #E2FFE0, border #ACDEA9, green checkmark #63B75C). Priority chips (004/005/006.svg) map TipoPrioridad_OT to color in a non-obvious way: Baja=pale blue (#D2E2FF/#93B5F4, text #225DCA), Media=pale yellow (#FFFDD8/#F0EB69, text #9E9808), Alta=pale green (#DCFBC7/#A8DB87, text #51882E) — i.e. "Alta" is NOT rendered as red/urgent, worth flagging before reusing as-is. Small utility icons: open-eye "view" icon (013/018.svg, stroke #23313E), trash "delete" icon (019.svg, stroke #A6413B), 1px divider line (#DEDEDE, 024.svg). Every popup follows one template: full-screen scrim (black @12% opacity) + a white rounded-12px card at x=34 with a gray (#878787) X close icon top-right; primary/"Aceptar" actions are a dark-navy pill (#23313E/#1F2B37), secondary/"Cancelar" a light-gray pill (#F4F4F4/#F4F7F9); confirm-close popup (026.svg) is the same template shrunk to a small dialog. Loading overlay (027.svg) is uniquely a rasterized PNG illustration (a checkmark card graphic) rather than vector shapes.

## react_mapping
Map to a mobile-first composition using the Sumar UI Kit's table-to-cards / bottom-sheet patterns rather than desktop Table/Sidebar primitives: (1) App bar = simple header with an icon Button (back) + title + a Dropdown/Popover menu (kebab trigger) for the 3 quick actions. (2) Main list = a vertical stack of Card components (one per work order) instead of a Table — each Card composes a title Text row, a StatusBadge/Badge for priority (re-palette to a semantic red/amber/green scale on rebuild), two secondary Buttons ("Ver Detalle", "Repuestos") and a circular success IconButton ("Completar"); wrap in an EmptyState component for the no-data illustration. (3) All Group_* popups become Modal (full-screen) or bottom-Sheet recipes keyed off the same boolean UI state, replacing Canvas Apps' single-screen context-variable toggling with a small `useState`/router-less modal stack: OT-detail Modal (key/value grid + read-only Textarea for Detalle), Repuestos Modal (Table-to-cards list with quantity Badge), Photos Modal (list + Image/`<video>` viewer Modal nested inside), Nueva-Solicitud Modal (DatePicker Input, two cascading Combobox/Select controls, Textarea, a FileUpload/AddMedia-style control with a thumbnail Chip list supporting delete, Cancel/Confirm Buttons gated by the same required-fields rule), Cambiar-Edificio Modal (single Select + Confirm), Agregar-Repuesto Modal (search Input + Table-to-cards rows using a numeric Input per row with the same over-stock red-border validation), and a small Dialog/AlertDialog for the close-OT confirmation. (4) Loading flag → the kit's global Spinner/Skeleton pattern tied to mutation isPending state (React Query) instead of a manual Timer-driven boolean. (5) Toast component for Patch/flow success or failure feedback (SendEmailV2, SubirFoto, stock Patch) — these become normal API/Edge-Function calls against Supabase instead of Power Automate flows. (6) Role-based logic (RegistroUser.UsuarioApp_Usr === "Admin") is not a visibility gate here — keep it as plain application logic deciding the email recipient, not a route/permission check.