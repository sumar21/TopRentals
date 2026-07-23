# desktop / Screen_Login

## Purpose
Entry point / authentication gate for the desktop back-office app. Validates a username+password pair against the Usuarios list, hard-blocks accounts whose profile is "Tecnico" (mobile-only role), and on success bootstraps the client-side working set (active permission profile, pending purchases, active buildings, open work orders) before navigating to Screen_Home. It has no CRUD purpose of its own — purely a login/session-bootstrap screen.

## Layout
Full-screen (1366x768) composite background image (001.svg) provides all the chrome: a white, black-bordered rounded panel on the left (~x=0-711) hosting the actual login form, and a solid dark-navy (#212847) decorative panel on the right (~x=711-1343) with no interactive controls (pure branding/illustration). All real controls are borderless/transparent-filled and positioned to sit exactly on top of shapes already drawn into the background image (e.g. the "Ingresar" button's dark #23313E pill is baked into 001.svg at the same X/Y/W/H as the transparent bt_ingreso_SL button). Inside the white panel: username input (y=395), password input with show/hide toggle (y=483), login button (y=548), version label bottom-left (y=741), and a small refresh icon/wordmark top-right of the form (y=359). Two full-screen overlay groups stack above everything, each gated by a boolean variable: a centered "wrong credentials" alert card (GroupWPW, ~x=394-895/y=303-465) and a full-screen loading scrim/splash (loading_SL), functioning as modals since they are plain image+button groups toggled by Visible conditions rather than real popup controls.

## components
- input_user_SL: borderless TextInput, HintText 'Usuario', 357x43, styled purely by the background art (rounded pill, no visible border/fill of its own).
- input_password_SL: borderless TextInput, HintText 'Contraseña', 358x41; Mode toggles TextMode.Password <-> TextMode.SingleLine based on VarPasswordMostrar ('ON'/'OFF').
- Icon_Ver_SL / Icon_Ocultar_SL: Icon.View / Icon.Hide, mutually exclusive via Visible=VarPasswordOculta / !VarPasswordOculta — classic show/hide-password toggle pair, color #747474.
- bt_ingreso_SL: transparent 358x56 Button overlaying a pre-rendered dark (#23313E) pill in the background image; OnSelect runs the full auth + session-bootstrap logic (see data_reads).
- lbl_versionApp_SL: static Label showing app build/version string ('v20260622_1.3.2'), also captured into the global AppVersion on login.
- img_RefreshLogin_SL: 71x28 Image (icon + wordmark, 002.svg) acting as a button; OnSelect force-refreshes Usuarios/Permisos SharePoint data and reloads CollectUsers/CollectPermisos without a full login attempt (manual retry when the cached lists are stale).
- GroupWPW ('wrong credentials' modal): img_WPW full-screen dim scrim + alert card (003.svg) plus bt_aceptarWPW, bt_cancelarWPW, bt_cruzWPW — all three buttons run the identical OnSelect (Set(VarContraseñaWarning,false)); despite looking like Accept/Cancel/Close, there is no differing behavior between them.
- loading_SL: full-screen Image overlay (004.svg, dim scrim + static branded splash graphic with drop shadow), Visible=LoadingLocal, shown while the login or refresh OnSelect logic executes; separate from the screen's native LoadingSpinnerColor=RGBA(56,96,178,1) engine spinner.

## modals
- 'Credenciales inválidas' alert (GroupWPW, Visible=VarContraseñaWarning): dim full-screen scrim + card with heading/body message and three controls (Aceptar, Cancelar, X-close) that are functionally a single dismiss action — all three set VarContraseñaWarning back to false with no other differing effect. Triggered when login finds zero matching Usuario/Password rows, OR finds a match whose Perfil_Usr = 'Tecnico' (role block).
- Loading overlay (loading_SL, Visible=LoadingLocal): dim scrim + static branded splash shown for the duration of the login or manual-refresh OnSelect handlers (LoadingLocal toggled true at the start and false at the end of each handler).

## data_reads
- '00.Usuarios' -> Filter(Status_Usr="ALTA") into CollectUsers (loaded on Refresh via img_RefreshLogin_SL, and re-loaded with the same filter after a successful login).
- Auth check performed client-side against the in-memory CollectUsers: Filter(CollectUsers, UsuarioApp_Usr = input_user_SL.Text And Password_Usr = input_password_SL.Text) — plaintext password compared directly against the Password_Usr field.
- '99.ABM_ListaPermisosPerfilesV3' -> Filter(Aplicacion_LPP="Desktop" && Status_LPP="Activo") into CollectPermisos — the permission/profile matrix consumed by later screens for role-based UI gating; seeded here, not used by Screen_Login itself.
- '14.Compras' -> Filter(Status_C="Pendiente") into CollectComprasHechas (preloaded only on successful login).
- '99.ABM_Edificios' -> Filter(Status_E="Activo") into CollectEdificios (preloaded only on successful login).
- '07.OrdenesTrabajo' -> Filter(Status_OT="Pendiente" Or Status_OT="Asignada") into CollectOTHome (preloaded only on successful login).

## data_writes
- None. Screen_Login performs no Patch/Remove/Collect writes to SharePoint and calls no Power Automate flows and sends no emails — it is a pure read + client-side session bootstrap screen.

## navigation
- Navigate(Screen_Home, ScreenTransition.Fade) — fired only inside bt_ingreso_SL.OnSelect after a successful, non-Tecnico credential match.

## statuses
- ALTA
- Activo
- Pendiente
- Asignada
- Tecnico
- Desktop
- ON
- OFF

## role_logic
The only access-control rule on this screen is a hard login block: even when username/password match a row in CollectUsers, the login is rejected (treated identically to 'no match') if that user's Perfil_Usr = 'Tecnico' — technicians are restricted to the mobile app and cannot authenticate into desktop. There is no granular per-permission UI gating rendered on Screen_Login itself; instead, a successful login seeds CollectPermisos from '99.ABM_ListaPermisosPerfilesV3' filtered to Aplicacion_LPP="Desktop" && Status_LPP="Activo" — this becomes the permission/profile matrix (referenced elsewhere as CollectPermisos / 99.ABM_ListaPermisosPerfilesV3) that other desktop screens read to gate their own controls. Also worth flagging for the Supabase migration: password verification here is a plaintext client-side Filter() equality check against Password_Usr in the Usuarios list, not a hashed server-side check — should be replaced by Supabase Auth (or an equivalent hashed/server-verified flow) rather than ported as-is.

## visual_notes
Composite full-screen background (001.svg): white rounded panel, 5px black stroke, on the left; solid dark-navy (#212847) rounded panel on the right (pure decoration, presumably a branding/illustration area — file is large (2.2MB) suggesting an embedded raster illustration, but no <text> elements, so no baked-in copy to port); the login button's visual pill (#23313E) is pre-drawn into this same image rather than styled on the live Button. Refresh control (002.svg, 101x40 white rounded chip) shows a two-arrow circular "refresh/sync" icon glyph followed by wordmark-style vector paths (converted text-to-path, likely a brand/label string) rendered in #566482 (icon) and #424557 (text paths). Wrong-credentials alert (003.svg): full-screen black scrim at 12% opacity; centered white card (501x162, rounded 12px) with a soft drop-shadow (11% black, 8.25px blur); heading text in #19222B, secondary/body text in #6E7882; an X-close glyph in #878787 top-right of the card; a plain white 227x50 rounded rect visible for one of the two action buttons (the SVG read was truncated before the second, presumably differently-colored, button rect). Loading overlay (004.svg): same 12%-opacity black scrim plus a centered white rounded card containing a small (109x109) branded icon/illustration rotated ~1° with its own drop-shadow — effectively a static branded splash rather than an animated spinner, even though the screen also declares a native engine LoadingSpinnerColor of RGBA(56,96,178,1) (#3860B2, blue) as a secondary/fallback indicator. Overall palette: dark navy/slate (#212847, #23313E, #19222B) for chrome and primary actions, neutral greys (#566482, #6E7882, #747474, #878787) for icons/secondary text, white cards with soft shadows for elevation.

## react_mapping
Screen_Login is an unauthenticated Auth screen, not a data-management view, so most Sumar UI Kit table/CRUD primitives (Table, StatCard, Combobox, Tabs) don't apply. Compose it as a bespoke two-pane AuthLayout (the kit has no login template): left pane a centered form built from Input (username), Input type='password' with a trailing icon Button (eye / eye-off) reproducing the show/hide toggle, a full-width primary Button ('Ingresar') wired to an auth mutation that on success also warms the app's initial query cache (permissions, pending purchases, active buildings, open work orders — mirroring the four ClearCollects), a small IconButton+label for 'Actualizar' (manual cache refetch), and a muted Text for the build/version string. Right pane: a static brand/illustration panel — plain styled div, no kit primitive needed since it has no interactivity or copy. Collapse the three-button 'wrong credentials' alert (Aceptar/Cancelar/X, all identical) into a single error Toast (or an inline Input error state) rather than a Modal — a full popup is unwarranted for a message with exactly one real action. Replace the static branded loading-splash Image overlay with the kit's standard full-page loading state (spinner + scrim) instead of porting the baked-in graphic. On the mobile app's equivalent login screen, drop the decorative illustration pane entirely and stack Input/Input/Button full-width — there is no gallery/list here, so no table-to-cards or bottom-sheet conversion is needed on this particular screen.