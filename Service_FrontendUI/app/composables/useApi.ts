// ── Types ─────────────────────────────────────────────────────────────────────

export interface SearchResult {
  truth: string
  projectID: string
  name: string
  latestValue: string | number | null
  score: number
}

export interface NodeResolveResponse {
  type: 'name' | 'value' | 'group'
  uuid: string
  name_val?: string
  val?: string | number
  isArray?: boolean
  entries?: { key: string; val: string }[]
}

export interface ProcessedEntry {
  truthId: string
  nameId: string
  valRef: string
  groupEntries?: GroupEntry[]
}

export interface GroupEntry {
  gid: string
  key: string
  val: string
  groupEntries?: GroupEntry[]
}

export interface SsotConfigEntry {
  truth: string | null
  alias: string
  value: string | number
}

export interface SsotConfigRequest {
  CMPID: string
  projectID: string
  config: SsotConfigEntry[]
}

export interface CTRow {
  uuid: string
  key: string
  val: string
}

export interface ConfigReadResponse {
  config_relation_uuid: string
  date_created: string
  rows: CTRow[]
}

export interface ConfigWriteEntry {
  key: string
  val: string
  group_entries?: GroupEntry[]
}

export interface ConfigWritePayload {
  proj_id: string
  cmp_id: string
  user_id: string
  entries: ConfigWriteEntry[]
}

export interface ProjectResponse {
  uuid: string
  proj_id: string
  display_name: string
  description: string | null
  created_by: string
  date_created: string
  companies: string[]
}

// ── Base URLs ─────────────────────────────────────────────────────────────────

const BASE = {
  login: "/api/login",
  config: "/api/config",
  ssot: "/api/ssot",
  template: "/api/template",
  version: "/api/version",
} as const;

// ── Request helper ────────────────────────────────────────────────────────────

async function req<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const { headers: optsHeaders, ...restOpts } = opts
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(optsHeaders as Record<string, string>) },
    ...restOpts,
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const json = await res.json()
      message = json.detail ?? json.message ?? message
    } catch {
      const text = await res.text().catch(() => '')
      if (text) message = text
    }
    throw new Error(message)
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T
  }
  return res.json();
}

// ── API client ────────────────────────────────────────────────────────────────

export function useApi() {
  return {
    health: {
      login: () => req<{ status: string }>(`${BASE.login}/health`),
      config: () => req<{ status: string }>(`${BASE.config}/health`),
      template: () => req<{ status: string }>(`${BASE.template}/health`),
      version: () => req<{ status: string }>(`${BASE.version}/health`),
    },

    auth: {
      register: (email: string, username: string, password: string, full_name: string, company: string) =>
        req<{ id: number; email: string; company: string }>(
          `${BASE.login}/api/v1/auth/register`,
          { method: "POST", body: JSON.stringify({ email, username, password, full_name, company }) },
        ),
      login: (email: string, password: string) => {
        console.log("Login URL:", `${BASE.login}/api/v1/auth/login`);
        return req<{ access_token: string; refresh_token: string }>(
          `${BASE.login}/api/v1/auth/login`,
          { method: "POST", body: JSON.stringify({ email, password }) },
        );
      },
      me: (token: string) =>
        req<{ email: string; full_name: string; company: string; username: string }>(
          `${BASE.login}/api/v1/auth/me`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
    },

    ssot: {
      search: (q: string, token: string) =>
        req<SearchResult[]>(
          `${BASE.ssot}/api/v1/search?q=${encodeURIComponent(q)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      resolveNode: (uuid: string, token: string) =>
        req<NodeResolveResponse>(
          `${BASE.ssot}/api/v1/node/${uuid}`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      postConfig: (payload: SsotConfigRequest, token: string) =>
        req<{ entries: ProcessedEntry[] }>(
          `${BASE.ssot}/api/v1/config`,
          { method: "POST", body: JSON.stringify(payload), headers: { Authorization: `Bearer ${token}` } },
        ),
    },

    configTable: {
      getConfig: (projId: string, cmpId: string, token: string) =>
        req<ConfigReadResponse>(
          `${BASE.config}/api/v1/config?proj_id=${encodeURIComponent(projId)}&cmp_id=${encodeURIComponent(cmpId)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      writeConfig: (payload: ConfigWritePayload, token: string) =>
        req<ConfigReadResponse>(
          `${BASE.config}/api/v1/config/`,
          { method: "POST", body: JSON.stringify(payload), headers: { Authorization: `Bearer ${token}` } },
        ),
    },

    projects: {
      list: (token: string, cmpId?: string) =>
        req<ProjectResponse[]>(
          `${BASE.config}/api/v1/projects${cmpId ? `?cmp_id=${encodeURIComponent(cmpId)}` : ''}`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      get: (projId: string, token: string) =>
        req<ProjectResponse>(
          `${BASE.config}/api/v1/projects/${encodeURIComponent(projId)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      create: (payload: { proj_id: string; display_name: string; description?: string }, token: string) =>
        req<ProjectResponse>(
          `${BASE.config}/api/v1/projects`,
          { method: "POST", body: JSON.stringify(payload), headers: { Authorization: `Bearer ${token}` } },
        ),
      addCompany: (projId: string, cmpId: string, token: string) =>
        req<{ ok: boolean }>(
          `${BASE.config}/api/v1/projects/${encodeURIComponent(projId)}/companies`,
          { method: "POST", body: JSON.stringify({ cmp_id: cmpId }), headers: { Authorization: `Bearer ${token}` } },
        ),
      removeCompany: (projId: string, cmpId: string, token: string) =>
        req<void>(
          `${BASE.config}/api/v1/projects/${encodeURIComponent(projId)}/companies/${encodeURIComponent(cmpId)}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
        ),
      delete: (projId: string, token: string) =>
        req<void>(
          `${BASE.config}/api/v1/projects/${encodeURIComponent(projId)}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
        ),
    },
  };
}
