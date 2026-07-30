// Deno port of scripts/migrate/src/graph.ts — client-credentials auth + the site/list
// resolution helpers, PLUS the write operations (createItem/updateItem) that the
// create -> confirm -> delete test against 99.ABM_Articulos proved working.
// Plain global fetch, no Graph SDK, no npm imports — this file only runs under Deno
// (Supabase Edge Functions), it is not part of the Vite app build.

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';

export interface GraphAuthEnv {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

/** A Graph HTTP error, carrying the status code so callers can map it to a response. */
export class GraphError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function graphFetchJson<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new GraphError(`Graph request failed (${res.status} ${res.statusText}) for ${url}: ${body.slice(0, 500)}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function createGraphClient(env: GraphAuthEnv) {
  let cachedToken: { value: string; expiresAt: number } | null = null;

  async function getAccessToken(): Promise<string> {
    if (cachedToken && cachedToken.expiresAt - Date.now() > 60_000) {
      return cachedToken.value;
    }
    const url = `https://login.microsoftonline.com/${env.tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new GraphError(`Azure AD token request failed (${res.status}): ${text.slice(0, 500)}`, res.status);
    }
    const json = (await res.json()) as { access_token: string; expires_in: number };
    cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return cachedToken.value;
  }

  /** SP_SITE_URL like 'https://tenant.sharepoint.com/sites/TopRentals' -> Graph site id. */
  async function resolveSiteId(spSiteUrl: string): Promise<string> {
    const url = new URL(spSiteUrl);
    const token = await getAccessToken();
    const path = encodeURI(`${GRAPH_ROOT}/sites/${url.hostname}:${url.pathname}`);
    const site = await graphFetchJson<{ id: string }>(path, token);
    return site.id;
  }

  async function resolveListId(siteId: string, displayName: string): Promise<string> {
    const token = await getAccessToken();
    const filter = encodeURIComponent(`displayName eq '${displayName.replace(/'/g, "''")}'`);
    const url = `${GRAPH_ROOT}/sites/${siteId}/lists?$filter=${filter}`;
    const page = await graphFetchJson<{ value: Array<{ id: string; displayName: string }> }>(url, token);
    const match = page.value[0];
    if (!match) throw new Error(`SharePoint list not found by displayName: "${displayName}"`);
    return match.id;
  }

  async function createItem(siteId: string, listId: string, fields: Record<string, unknown>): Promise<{ id: string }> {
    const token = await getAccessToken();
    const url = `${GRAPH_ROOT}/sites/${siteId}/lists/${listId}/items`;
    return graphFetchJson<{ id: string }>(url, token, {
      method: 'POST',
      body: JSON.stringify({ fields }),
    });
  }

  async function updateItem(
    siteId: string,
    listId: string,
    itemId: string | number,
    fields: Record<string, unknown>,
  ): Promise<void> {
    const token = await getAccessToken();
    const url = `${GRAPH_ROOT}/sites/${siteId}/lists/${listId}/items/${itemId}/fields`;
    await graphFetchJson(url, token, {
      method: 'PATCH',
      body: JSON.stringify(fields),
    });
  }

  return { getAccessToken, resolveSiteId, resolveListId, createItem, updateItem };
}

export type GraphClient = ReturnType<typeof createGraphClient>;
