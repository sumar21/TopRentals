# mobile / Login

## Purpose
Entry point for field technicians using the TopRentals mobile app. Validates username/password against the '00.Usuarios' SharePoint list, bootstraps the technician's session (identity, role/profile, greeting, week number, shift), preloads the permission matrix and the technician's assigned work orders, then navigates to the 'Home Tecnico' screen. No data is written from this screen — it is read-only plus local state/collection setup.

## Layout
Single full-bleed screen (640x1136 design canvas) with a static flattened background image (001.svg) providing all visual chrome: a phone-frame rounded card (632x722, rx 11.5), decorative background shapes/photo (two 638x768 rx 74.5 blobs, two <image> raster refs — likely a brand photo + logo), a 117x117 logo placeholder, four 538x76 rounded-11.5 field placeholders, and a 539x90 rx-12 button placeholder. Interactive Power Apps controls are transparent overlays positioned exactly on top of that art:
- Group 'GroupExtras_SL' (main form layer, back-to-front): version label (bottom, Y=1090), Usuario input (Y=668), Contraseña input (Y=810) with two mutually-exclusive eye icons at X=544, a nearly-invisible 'bt_refresh_LG' button (Text='', Y=910), and the primary 'Ingresar' button (Text='', Y=987, 539x89).
- Group 'Group_PopUp_Contraseña_Incorrecta_SL' (error overlay layer): a card image (002.svg) plus two buttons (dark 'Cerrar/Reintentar' bar and an 'X' cross) both toggled by WarningLogin.
- Root-level 'Img_Loading_Loading' (topmost, full-screen loading overlay, 003.svg), toggled by PopUpLoadingLoginSL — sits above both other layers per child order (bottom-to-top z-order).

## components
- inputUsuario (Classic TextInput) — username field, transparent chrome, HintText 'Usuario', rounded 10px, no validation on the field itself
- inputPassword (Classic TextInput) — password field, HintText 'Contraseña', Mode toggles Password/SingleLine via VarPasswordMostrar ('ON'/'OFF')
- Icon_Ver_SL / Icon_Ocultar_SL — pair of eye/eye-slash icons implementing password show/hide; only one visible at a time via VarPasswordOculta / VarPasswordOculta2 booleans
- bt_refresh_LG — invisible/blank-text button; OnSelect refreshes '00.Usuarios' and reloads CollectUsuarios and Collect_LPP with a loading spinner around it; developer-only utility control, not a real UI element
- btIngreso — the actual submit/login button (blank text, styling from background art); OnSelect does credential validation, session bootstrap, and navigation
- lbl_versionApp — small centered caption showing app build version string, also captured into VarVersion on login
- PopUp_Contraseña_Incorrecta_SL — error popup image (Visible=WarningLogin), shown when credential match fails
- Bt_Cerrar_Contraseña_Incorrecta_SL / Bt_cruz_WPW — two buttons (a full-width bar and an 'X' cross) that both reset the inputs and hide the error popup; functionally duplicate
- Img_Loading_Loading — full-screen loading overlay with centered logo card and drop shadow (Visible=PopUpLoadingLoginSL), shown during data refresh / login processing

## modals
- Wrong-credentials popup (PopUp_Contraseña_Incorrecta_SL + its Group): toggled by global boolean WarningLogin, set true when the credential Filter() returns empty in btIngreso.OnSelect. Visual (from 002.svg): a 572x180 white rounded card (rx 12) with a dark navy (#23313E) 548x61 action bar and an 'X' cross close icon top-right. Both the action bar button and the X button run identical logic: Reset(inputUsuario), Reset(inputPassword), reset password-visibility state to OFF, and Set(WarningLogin, false). No form fields inside beyond the message text (vector-drawn, not literal <text>, so exact copy wasn't OCR-extractable, but structurally it is a single-message/single-action error dialog).
- Loading overlay (Img_Loading_Loading): toggled by global boolean PopUpLoadingLoginSL, set true/false around the two data-refresh blocks (bt_refresh_LG and btIngreso). Visual (from 003.svg): full-screen black overlay at 12% opacity, centered white rounded card (147x147, rx 18) with a drop shadow, containing a 109x109 embedded raster image (app/company logo). Purely decorative/blocking — no interactive elements, self-dismisses when the calling code sets the flag back to false.

## data_reads
- '00.Usuarios' — Refresh() then Filter(Status_Usr = "ALTA") -> ClearCollect(CollectUsuarios). Fields consumed downstream: Password_Usr, UsuarioApp_Usr, Nombre_Usr, Perfil_Usr, ConcatName_Usr, ID.
- '99.ABM_ListaPermisosPerfilesV3' — Filter(Aplicacion_LPP = "Mantenimiento" && Status_LPP = "Activo") -> ClearCollect(Collect_LPP). Loaded both by bt_refresh_LG and again inside btIngreso's OnSelect on successful login.
- '07.OrdenesTrabajo' — Filter(Tecnico_IN = NombreUser And Status_OT = "Asignada") -> ClearCollect(CollectOT). Preloads the newly-logged-in technician's assigned work orders for the Home screen.
- Dead/commented code referencing '99.ABM_LPPTecnico' filtered by Accion_LLPPT = "Activo" — inactive alternate permissions source, not executed.

## data_writes

## navigation
- btIngreso.OnSelect -> Navigate('Home Tecnico', ScreenTransition.Fade), only after IsEmpty(Filter(CollectUsuarios, password && username match)) is false (i.e. a matching user was found); also clears varTecnico to Blank() right after navigating.

## statuses
- ALTA
- Activo
- Asignada
- Día
- Noche

## role_logic
This screen doesn't gate its own UI by role, but it is where role state is bootstrapped for the rest of the app: on successful login, `Perfil_Usr` (the user's profile/role) is captured into `PerfilUser`, and `Collect_LPP` is loaded from '99.ABM_ListaPermisosPerfilesV3' filtered to `Aplicacion_LPP = "Mantenimiento"` (the identifier distinguishing this mobile/field app's permission rows from the desktop back-office app's rows) and `Status_LPP = "Activo"`. Note the filter loads ALL active permission rows for the "Mantenimiento" app — it is not further scoped to the logged-in `PerfilUser` here; per-profile filtering is presumably applied downstream on each subsequent screen against this cached collection. `NombreUser` (concatenated full name) is also captured specifically to match the technician against `Tecnico_IN` on Work Orders, i.e. identity + role + assignment-matching are all seeded here in one shot.

## visual_notes
Background (001.svg, 2.3MB — inspected via targeted grep rather than full read due to size): a 640x1136 flattened design mockup providing all static chrome — phone-frame rounded rect (632x722 rx11.5), two large soft-cornered background shapes (638x768 rx74.5, likely a brand photo/gradient via <image id=image0_759_3410>), a small logo raster (<image id=image1_759_3410>, matches a 117x117 rx placeholder), four 538x76 rx11.5 field-shaped placeholders (Usuario/Contraseña visual backgrounds) and one 539x90 rx12 button placeholder (Ingresar visual). Sampled fill colors: #F2F2F2 (light neutral), #202020 (near-black text), #7D7D7D x2 (secondary/placeholder text gray), #6E7882 (muted gray-blue caption text), #23313E (dark navy — brand action-button color, reused identically on the error popup's action bar in 002.svg, confirming it's the app's primary CTA color). Error popup (002.svg): white card, #23313E action button, gray/dark vector text, X-shaped close glyph built from two crossing paths (#878787). Loading overlay (003.svg): black 12%-opacity scrim, white rounded card with dropShadow filter (offset dy=1, blur 8.25, 11% black), centered 109x109 logo image — a generic branded splash/loading motif reusable for any full-screen async wait state.

## react_mapping
Pre-auth screen — no Sidebar/Table/Gallery needed. Structure: full-viewport background (brand image or CSS gradient) with a centered `Card` holding: logo image, heading, one `Input` (username) and one `Input` type="password" with a built-in trailing show/hide `IconButton` (Eye/EyeOff) replacing the two Power-Apps icon controls and their 3-variable toggle — collapse to a single `showPassword` boolean. Submit via a primary `Button` ("Ingresar") calling a login mutation. Version caption -> plain styled `Text` in the footer, no Kit primitive needed. Wrong-credentials popup -> `Toast` (error variant, e.g. "Usuario o contraseña incorrectos") is the natural fit since it's a single message + single dismiss action with no form fields; if pixel-parity with the existing small centered card is required instead, use the Modal recipe with one `onClose` wired to both the visual 'X' and the action-bar button (they're functionally identical, so one handler suffices). Loading overlay -> a full-screen `Spinner`/loading overlay component shown while an `isLoading` flag is true during the auth call and initial data preload — no Modal chrome needed, it's a blocking splash. `bt_refresh_LG` has **no React equivalent**: it's a debug/manual-refresh workaround for Power Apps' local caching; in the Supabase-backed app, login should just fetch fresh user/permission data server-side as part of the auth request. Auth logic itself must move off client-side plaintext comparison and onto Supabase Auth (or a server-side RPC with hashed passwords); on success, fetch (via a hook, e.g. `useSession`/`usePermissions`) the profile, permission set (scoped server-side by profile rather than pulling the whole `99.ABM_ListaPermisosPerfilesV3` table into the client), and the technician's assigned work orders (`Status_OT = "Asignada"`), then `navigate('/home')` (React Router) in place of `Navigate('Home Tecnico', ...)`. The Día/Noche shift calculation is a trivial pure helper: `hour > 18 ? 'Noche' : 'Día'`.