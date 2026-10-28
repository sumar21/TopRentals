// Pure helpers for the "new version available" prompt. No react/DOM — must stay importable from plain Node scripts.
// Format: v<YYYYMMDD>_<major>.<minor>.<patch> (config/appVersion.ts). The semver was reset once, so the DATE is the
// monotonic part: compared first, then major, minor, patch.

const FORMAT = /^v(\d{8})_(\d+)\.(\d+)\.(\d+)$/;

/** `[date, major, minor, patch]`, or null when `version` is not in the app's format. */
export function parseAppVersion(version: unknown): [number, number, number, number] | null {
  const m = typeof version === 'string' ? FORMAT.exec(version) : null;
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] : null;
}

/** True only when `candidate` is strictly newer than `current`. Either one invalid -> false. */
export function isNewerAppVersion(candidate: unknown, current: unknown): boolean {
  const a = parseAppVersion(candidate);
  const b = parseAppVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
