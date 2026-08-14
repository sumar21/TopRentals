// Small display-only string helpers. These NEVER mutate stored data — they format at render time
// so a value cargada en minúscula se muestra prolija sin reescribir la base.

/**
 * Capitalize only the FIRST letter of the string (sentence-case first char), leaving the rest as-is.
 * NOT Title Case: "cambiar la cerradura" → "Cambiar la cerradura" (never "Cambiar La Cerradura").
 * Empty/nullish → '' so callers can chain `|| 'fallback'`.
 */
export const capitalizeFirst = (s: string | null | undefined): string => {
  const t = (s ?? '').trimStart();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
};
