// Microsoft Graph client — client-credentials auth + the handful of REST
// calls this migration needs. Plain global fetch (Node 22+), no Graph SDK.

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';

export interface GraphAuthEnv {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export interface SpItem {
  id: string;
  fields: Record<string, unknown>;
}

export interface DriveInfo {
  id: string;
  name: string;
}

export interface DriveItemNode {
  id: string;
  name: string;
  isFolder: boolean;
  /** Folder path relative to the drive root, e.g. 'Ordenes/(OT)-123-...'. */
  parentPath: string;
  size: number;
  mimeType: string | null;
  createdDateTime: string | null;
  /** SharePoint list-item metadata attached to this drive item (e.g. IDOrdenes column), if any. */
  listItemFields: Record<string, unknown> | null;
}

async function graphFetchJson<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Graph request failed (${res.status} ${res.statusText}) for ${url}: ${body.slice(0, 500)}`);
  }
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
      throw new Error(`Azure AD token request failed (${res.status}): ${text.slice(0, 500)}`);
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

  async function fetchAllItems(siteId: string, listId: string): Promise<SpItem[]> {
    const token = await getAccessToken();
    const items: SpItem[] = [];
    let url: string | null = `${GRAPH_ROOT}/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=999`;
    while (url) {
      const page = await graphFetchJson<{
        value: Array<{ id: string; fields: Record<string, unknown> }>;
        '@odata.nextLink'?: string;
      }>(url, token);
      for (const raw of page.value) items.push({ id: raw.id, fields: raw.fields ?? {} });
      url = page['@odata.nextLink'] ?? null;
    }
    return items;
  }

  async function listDrives(siteId: string): Promise<DriveInfo[]> {
    const token = await getAccessToken();
    const page = await graphFetchJson<{ value: DriveInfo[] }>(`${GRAPH_ROOT}/sites/${siteId}/drives`, token);
    return page.value;
  }

  /** Walks a drive depth-first from its root, returning every file (folders are traversed, not returned). */
  async function listDriveItemsRecursive(driveId: string): Promise<DriveItemNode[]> {
    const token = await getAccessToken();
    const out: DriveItemNode[] = [];

    async function walk(itemId: string, parentPath: string): Promise<void> {
      let url: string | null =
        `${GRAPH_ROOT}/drives/${driveId}/items/${itemId}/children` +
        `?$expand=listItem($expand=fields)&$top=200`;
      while (url) {
        const page = await graphFetchJson<{
          value: Array<{
            id: string;
            name: string;
            folder?: unknown;
            file?: { mimeType?: string };
            size?: number;
            createdDateTime?: string;
            listItem?: { fields?: Record<string, unknown> };
          }>;
          '@odata.nextLink'?: string;
        }>(url, token);
        for (const child of page.value) {
          const isFolder = Boolean(child.folder);
          if (isFolder) {
            await walk(child.id, parentPath ? `${parentPath}/${child.name}` : child.name);
          } else {
            out.push({
              id: child.id,
              name: child.name,
              isFolder: false,
              parentPath,
              size: child.size ?? 0,
              mimeType: child.file?.mimeType ?? null,
              createdDateTime: child.createdDateTime ?? null,
              listItemFields: child.listItem?.fields ?? null,
            });
          }
        }
        url = page['@odata.nextLink'] ?? null;
      }
    }

    await walk('root', '');
    return out;
  }

  async function downloadDriveItemContent(driveId: string, itemId: string): Promise<Buffer> {
    const token = await getAccessToken();
    const res = await fetch(`${GRAPH_ROOT}/drives/${driveId}/items/${itemId}/content`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Failed to download drive item ${itemId} (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  return {
    getAccessToken,
    resolveSiteId,
    resolveListId,
    fetchAllItems,
    listDrives,
    listDriveItemsRecursive,
    downloadDriveItemContent,
  };
}

export type GraphClient = ReturnType<typeof createGraphClient>;
