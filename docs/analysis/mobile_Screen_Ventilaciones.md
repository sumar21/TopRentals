# mobile / Screen_Ventilaciones

## Purpose
Field-technician ventilation/duct-cleaning task screen. Lists the ventilation-cleaning jobs assigned to the logged-in technician (IDAsignado_VE = RegistroUser.ID), lets them reschedule ("Programar"), close out ("Finalizar", with photo + notes, auto-creating the next cycle's pending record), advance a still-pending job early ("Adelantar" — incident flow), and switch which building/tower's jobs are shown ("Cambiar torre").

## Layout
640x1136 mobile canvas, header chrome in background SVG. Header (y78-144): back arrow, two 80x66 white icon buttons — "advance/incident" (X522) and "switch building" (X421). Body: gal_ventilaciones (X32 W592 H881, template 173) over CollectVentilaciones. Card template: white 572x155 border #DDE4F2, status pill top-left, building name (uppercase bold 24px #1F2B37), room label (18px #7C8497), next/scheduled date (18px semibold #476D90), "reprogramar" calendar icon-button (dark navy) and "finalizar" checkmark icon-button (outline) shown only if Estado_VE="Programada" and date arrived. Empty state 468x246 magnifying-glass illustration. Five full-screen modal groups + loading overlay.

## components
- bt_backVentilaciones — nav back to Home Tecnico (clears varEdificio)
- bt_agregarIncidente_VE — opens "Adelantar" flow
- gal_ventilaciones — job list; img_status_VE (Switch on Estado_VE), building/room/date labels, img_calendario_VE (reprogram), img_finalizar_VE (conditional)
- bt_CambiarTorre_VE — opens "Cambiar torre" modal
- img_LoadingVentilaciones — loading overlay (LoadingVentilaciones)

## modals
1. FotoVentilacion (verFotoVentilacion) — full-screen photo viewer bound to agregarFoto_VE.Media
2. Group_AdelantarVentilacion (AdelantarVentilacion) — cmbox building group (Distinct(CollectVentilacionesPendientes, field_3)) -> cmbox specific unit (disabled until group chosen), observaciones textarea, Cancel/X/Accept (disabled until unit chosen)
3. Group_Programar (PopUpProgramarVentilacion) — datepicker (defaults ProximaLimpieza_VE or FechaProgramada_VE), Cancel/X/Accept
4. Group_Finalizar (PopUpFinalizarVentilacion) — notes textarea, AddMedia (UseMobileCamera:true, visible while no photo), view-photo / delete-photo icon buttons once attached, Cancel/X/Accept
5. GroupCambioTorre_VE (PopUpCambioTorreVE) — cmbox_ConfigTorre_VE (Distinct(CollectEdificiosOT, field_2)), Cancel/X/Accept

## data_reads
- CollectVentilaciones <- Filter('19.Ventilaciones', (Estado_VE="Asignada" Or "Programada") And IDAsignado_VE = RegistroUser.ID) — re-run after Programar/Finalizar/Cambiar torre
- CollectVentilacionesPendientes <- Filter('19.Ventilaciones', Estado_VE="Pendiente") — for Adelantar (NOT scoped to technician)
- CollectEdificiosOT — from parent screen
- LookUp('99.ABM_TipoUnidades', ID = RegistroVentilacion.IDHabitacion_VE) -> EdificioRegistro at Finalizar time (building/room/frequency for next cycle)

## data_writes
1. Adelantar accept: Patch('19.Ventilaciones', selectedPending, {ProximaLimpieza_VE:Today, FechaMesAnoProxima_VE, FechaAnoProxima_VE, ObservacionAdelanto_VE, EsIncidente_VE:"SI"})
2. Programar accept: Patch(RegistroVentilacion, {FechaProgramada_VE, Estado_VE:"Programada", Orden_VE:2}) + refresh
3. Finalizar accept (KEY BUSINESS RULE — 3 writes):
   - Patch current: {Estado_VE:"Realizada", ObservacionResuelto_VE, FechaFinalizacion_VE + Mes/Año/Hora, VersionResuelto_VE, Orden_VE:1}
   - Patch Defaults (NEW record, next cycle): {EsIncidente_VE:"NO", Estado_VE:"Pendiente", Edificio_VE, IDHabitacion_VE, Habitacion_VE, Frecuencia_VE, FechaUltima_VE, ProximaLimpieza_VE: Today + Frecuencia_ABMUnid days, Orden_VE:4}
   - If photo attached: 'TopRentals-FotoVentilacion'.Run(RegistroVentilacion.ID, base64, FileName) -> Supabase Storage in the port
4. Cambiar torre accept: no Patch — client-side reload with HARDCODED zone grouping: {Palermo Chico, Palermo Soho}, {Palermo Hollywood, Dorrego}, {Montañeses, Nuñez, Hub, Jaramillo}, else exact — must become a config/lookup table (building zone/group)
- Dead variable VarMediaGral (base64 computed, never used) — skip in port

## navigation
- Only bt_backVentilaciones -> 'Home Tecnico'; everything else is local modal state

## role_logic
None — scoping is by assignment (IDAsignado_VE = RegistroUser.ID), an identity filter, not a permission gate.

## statuses
- Estado_VE: Asignada, Programada, Pendiente, Realizada; EsIncidente_VE: SI/NO; Orden_VE: 1 (Realizada), 2 (Programada), 4 (new Pendiente) — sort code

## visual_notes
Palette: dark navy #1F2B37/#113B62 text/icons; card borders #DDE4F2/#C8DBE8; muted #7C8497/#476D90. Status pills 34px: Asignada #FFFDD8/#F0EB69/#807B07 (yellow); Programada #DBFFCA/#CBEABD/#3A8517 (green); Pendiente #FFE7C2/#FEC877/#C07402 (orange). Reschedule icon = navy rounded square + white calendar; finalize = white circle outline + check (lucide calendar / check-circle). Modal shells: dark 12% overlay + white rounded 12px panel, height varies per content. 014.svg embeds a raster photo — drop. Loading overlay heavy vector — replace with spinner.

## react_mapping
Card list (no Table — mobile), StatusBadge for the 4 states, Buttons for header/row/modal actions, ONE Modal recipe (bottom-sheet on mobile) for the 5 popups, Combobox pairs with dependent disabled state, Textareas + date input, Toast on every mutation (missing today). Photo: capture/upload with compression -> Storage bucket 'ventilaciones'. The auto-create-next-cycle logic on Finalizar should live in a Postgres function/RPC for atomicity (close + create next in one transaction).
