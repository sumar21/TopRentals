# mobile / Mails

## Purpose
"Mails" is not a user-facing screen — it has no navigation target, no SVG background/asset, and nothing interactive. It's a headless "compute surface": an HtmlViewer control whose HtmlText property assembles the full HTML body of the work-order (OT) resolution/close-out email (header, optional spare-parts table, work metadata, technician sign-off), plus a Label holding a hardcoded CC recipient list. Other screens (the OT resolution/close-out flow) read this screen's control properties off-screen (e.g. `Mails.HtmlText1.HtmlText`, `Mails.lbl_mailssumar.Text`) to build the payload for an Office365Outlook.SendEmail call or a Power Automate flow — that send action itself lives elsewhere, not in this file.

## Layout
No real layout: two controls stacked top-left, screen is never rendered/visited. HtmlText1 (HtmlViewer@2.1.0), Width=640, Height=633, at implicit (0,0) — computes the resolution email HTML string. lbl_mailssumar (Text@0.0.51), X=12, Y=784, Width=584, Height=80, positioned below/outside the HtmlViewer — holds the CC email list as plain static text. There is no card, header, gallery, or background — confirmed no SVG assets exist for this screen at all (glob over svg/mobile/* shows folders for Detalle Activos, Home Tecnico, Login, Ordenes de Trabajo, Screen_Stock, Screen_Ventilaciones, Start — no "Mails" folder), consistent with it never being shown to a technician.

## components
- HtmlText1 (HtmlViewer@2.1.0) — builds the full HTML body for the OT resolution email: title 'Resolución - Orden de Trabajo Nro {RegistroOT.ID}', intro paragraph naming the asset (RegistroOT.ConcatActivo_IN), a conditional 'Repuestos Utilizados' table rendered only if CountRows(CollectRepuestosFinalizacion)>0 (columns: Repuesto_ROT, Cantidad_ROT, built via Concat over the collection), work metadata block (TipoTrabajo_IN, TipoTarea_IN, DiasEstimado_IN, each falling back to 'No asignado' via IsBlank), a computed 'Días utilizados' via DateDiff(DateValue(FechaAsignada_IN), Today()), a 'Sin repuestos utilizados' notice when the parts collection is empty, and a sign-off naming Tecnico_IN (or varTecnico as fallback). Purely a formula output surface, not interactive.
- lbl_mailssumar (Text@0.0.51) — static label whose Text is a hardcoded semicolon-delimited CC list: santiago.bianucci@sumardigital.com.ar; nicolas.acosta@sumardigital.com.ar; julian.rossi@sumardigital.com.ar; sebastian.cimino@sumardigital.com.ar; rodrigo.rizzo@sumardigital.com.ar; francisca.gatica@biba.dev. Used as the notification CC list by whichever screen/button actually sends the email.

## modals

## data_reads
- None — no SharePoint Filter/LookUp/Search/ClearCollect in this screen. All entities referenced (RegistroOT record, CollectRepuestosFinalizacion collection, ZocaloSuperiorOT variable, varTecnico variable) are globals populated by OTHER screens (the OT detail/resolution flow) and merely consumed here by reference.
- RegistroOT fields referenced: ID, ConcatActivo_IN, TipoTrabajo_IN, TipoTarea_IN, DiasEstimado_IN, FechaAsignada_IN, Tecnico_IN.
- CollectRepuestosFinalizacion fields referenced: Repuesto_ROT, Cantidad_ROT.

## data_writes
- None — no Patch/Remove/SubmitForm/Collect in this file, and no Office365Outlook.SendEmail or flow.Run call either. The actual send action is inferred to live on another screen (OT close-out) that reads Mails.HtmlText1.HtmlText and Mails.lbl_mailssumar.Text as inputs — flag this as a dependency to trace when analyzing the OT resolution/close-out screen.

## navigation
- None — no Navigate() calls to or from this screen; it is a headless compute-only screen, never a navigation target for the technician.

## statuses

## role_logic
No role/permission gating in this screen — no CollectPermisos or 99.ABM_ListaPermisosPerfilesV3 references, no Visible conditions on any control.

## visual_notes
No SVG/background assets exist for this screen (verified by glob — no "Mails" folder under svg/mobile, unlike every other mobile screen). No colors, icons, or card layouts to report; this is plain computed text, never rendered to a user.

## react_mapping
Do not port this as a route/page — collapse its two responsibilities into backend/shared code. (1) Email HTML generation: replace HtmlText1's Power Fx string concatenation with a template function or component, e.g. `buildOtResolutionEmailHtml(ot, repuestos, tecnico)`, driven by the OT record + a joined spare-parts-used table from Supabase; if HTML emails are still required, use a templating approach (react-email, MJML, or a simple server-side string builder) rather than a UI Label. (2) CC recipient list: replace the hardcoded lbl_mailssumar Label with a config value — an env var or a Supabase `notification_recipients` table — not a UI control. The actual send should move to a Supabase Edge Function / server action triggered on OT close-out (replacing the Office365Outlook connector), consuming the template output. No Sumar UI Kit primitives are needed for this screen itself since nothing is user-facing; if TopRentals ever wants an in-app "preview email before sending" feature, a read-only Modal with the rendered HTML would be the natural fit, but nothing in this source implies that exists today.