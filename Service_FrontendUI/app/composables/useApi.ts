// ── Types ─────────────────────────────────────────────────────────────────────

export interface SearchResult {
  truth: string
  projectID: string
  name: string
  latestValue: string | number | null
  score: number
  is_sensitive: boolean
}

export interface NodeResolveResponse {
  type: 'name' | 'value' | 'group'
  uuid: string
  name_val?: string
  val?: string | number
  is_sensitive?: boolean
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
  value: string | number | Record<string, unknown> | unknown[]
  sensitive?: boolean
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
  environment: string
  rows: CTRow[]
  // Populated by getByUuid; null when returned by get_config (latest-only endpoint)
  approval_status?: string | null
  approved_by?: string | null
  approved_at?: string | null
  rejection_reason?: string | null
  created_by?: string | null
  is_latest?: boolean | null
  change_description?: string | null
}

export interface ConfigWriteEntry {
  key: string
  val: string
  group_entries?: GroupEntry[]
}

export interface ConfigWritePayload {
  proj_id: string
  cmp_id: string
  environment: string
  user_id: string
  entries: ConfigWriteEntry[]
  template_version_uuid?: string
  change_description?: string
}

export interface ConfigHistoryItem {
  config_relation_uuid: string
  date_created: string
  date_deleted: string | null
  created_by: string | null
  entry_count: number
  is_latest: boolean
  environment: string
  template_version_uuid: string | null
  template_version_number: number | null
  approval_status: string
  approved_by: string | null
  approved_at: string | null
  rejection_reason: string | null
  change_description: string | null
}

export interface ConfigApprovalResponse {
  config_relation_uuid: string
  approval_status: string
  approved_by: string | null
  approved_at: string | null
  rejection_reason: string | null
}

export interface CompanyResponse {
  uuid: string
  cmp_id: string
  display_name: string
  description: string | null
  created_by: string
  date_created: string
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

export interface ProjectTemplateKey {
  uuid: string
  proj_id: string
  alias: string
  position: number
  date_created: string
}

export interface ProjectTemplateVersion {
  uuid: string
  proj_id: string
  version_number: number
  latest: boolean
  created_by: string
  date_created: string
  keys: string[]
}

export interface PublishedTemplateKeysResponse {
  version_uuid: string | null
  keys: string[]
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
      ssot: () => req<{ status: string }>(`${BASE.ssot}/health`),
      template: () => req<{ status: string }>(`${BASE.template}/health`),
      version: () => req<{ status: string }>(`${BASE.version}/health`),
    },

    auth: {
      register: (email: string, username: string, password: string, full_name: string, company: string, role: string = 'user') =>
        req<{ id: number; email: string; company: string }>(
          `${BASE.login}/api/v1/auth/register`,
          { method: "POST", body: JSON.stringify({ email, username, password, full_name, company, role }) },
        ),
      login: (email: string, password: string) => {
        console.log("Login URL:", `${BASE.login}/api/v1/auth/login`);
        return req<{ access_token: string; refresh_token: string }>(
          `${BASE.login}/api/v1/auth/login`,
          { method: "POST", body: JSON.stringify({ email, password }) },
        );
      },
      me: (token: string) =>
        req<{ email: string; full_name: string; company: string; username: string; role: string }>(
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
      setSensitive: (truthId: string, sensitive: boolean, token: string) =>
        req<{ ok: boolean; sensitive: boolean }>(
          `${BASE.ssot}/api/v1/truth/${encodeURIComponent(truthId)}/sensitive`,
          { method: 'PATCH', body: JSON.stringify({ sensitive }), headers: { Authorization: `Bearer ${token}` } },
        ),
      postConfig: (payload: SsotConfigRequest, token: string) =>
        req<{ entries: ProcessedEntry[] }>(
          `${BASE.ssot}/api/v1/config`,
          { method: "POST", body: JSON.stringify(payload), headers: { Authorization: `Bearer ${token}` } },
        ),
    },

    configTable: {
      getConfig: (projId: string, cmpId: string, environment: string, token: string) =>
        req<ConfigReadResponse>(
          `${BASE.config}/api/v1/config?proj_id=${encodeURIComponent(projId)}&cmp_id=${encodeURIComponent(cmpId)}&environment=${encodeURIComponent(environment)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      writeConfig: (payload: ConfigWritePayload, token: string) =>
        req<ConfigReadResponse>(
          `${BASE.config}/api/v1/config/`,
          { method: "POST", body: JSON.stringify(payload), headers: { Authorization: `Bearer ${token}` } },
        ),
      companiesWithConfig: (projId: string, token: string) =>
        req<string[]>(
          `${BASE.config}/api/v1/config/companies?proj_id=${encodeURIComponent(projId)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      history: (projId: string, cmpId: string, environment: string, token: string) =>
        req<ConfigHistoryItem[]>(
          `${BASE.config}/api/v1/config/history?proj_id=${encodeURIComponent(projId)}&cmp_id=${encodeURIComponent(cmpId)}&environment=${encodeURIComponent(environment)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      getByUuid: (uuid: string, token: string) =>
        req<ConfigReadResponse>(
          `${BASE.config}/api/v1/config/${encodeURIComponent(uuid)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      promote: (payload: { proj_id: string; cmp_id: string; from_environment: string; to_environment: string }, token: string) =>
        req<ConfigReadResponse>(
          `${BASE.config}/api/v1/config/promote`,
          { method: 'POST', body: JSON.stringify(payload), headers: { Authorization: `Bearer ${token}` } },
        ),
      promoteByUuid: (uuid: string, toEnvironment: string, token: string) =>
        req<ConfigReadResponse>(
          `${BASE.config}/api/v1/config/${encodeURIComponent(uuid)}/promote`,
          { method: 'POST', body: JSON.stringify({ to_environment: toEnvironment }), headers: { Authorization: `Bearer ${token}` } },
        ),
      approve: (uuid: string, token: string) =>
        req<ConfigApprovalResponse>(
          `${BASE.config}/api/v1/config/${encodeURIComponent(uuid)}/approve`,
          { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
        ),
      reject: (uuid: string, reason: string | null, token: string) =>
        req<ConfigApprovalResponse>(
          `${BASE.config}/api/v1/config/${encodeURIComponent(uuid)}/reject`,
          { method: 'POST', body: JSON.stringify({ reason }), headers: { Authorization: `Bearer ${token}` } },
        ),
    },

    companies: {
      list: (token: string) =>
        req<CompanyResponse[]>(
          `${BASE.config}/api/v1/companies`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      get: (cmpId: string, token: string) =>
        req<CompanyResponse>(
          `${BASE.config}/api/v1/companies/${encodeURIComponent(cmpId)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      create: (payload: { cmp_id: string; display_name: string; description?: string }, token: string) =>
        req<CompanyResponse>(
          `${BASE.config}/api/v1/companies`,
          { method: 'POST', body: JSON.stringify(payload), headers: { Authorization: `Bearer ${token}` } },
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
      getTemplateKeys: (projId: string, token: string) =>
        req<ProjectTemplateKey[]>(
          `${BASE.config}/api/v1/projects/${encodeURIComponent(projId)}/template/keys`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      addTemplateKey: (projId: string, payload: { alias: string; position?: number }, token: string) =>
        req<ProjectTemplateKey>(
          `${BASE.config}/api/v1/projects/${encodeURIComponent(projId)}/template/keys`,
          { method: "POST", body: JSON.stringify(payload), headers: { Authorization: `Bearer ${token}` } },
        ),
      removeTemplateKey: (projId: string, keyUuid: string, token: string) =>
        req<void>(
          `${BASE.config}/api/v1/projects/${encodeURIComponent(projId)}/template/keys/${encodeURIComponent(keyUuid)}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
        ),
      getTemplateVersions: (projId: string, token: string) =>
        req<ProjectTemplateVersion[]>(
          `${BASE.config}/api/v1/projects/${encodeURIComponent(projId)}/template/versions`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      publishTemplate: (projId: string, token: string) =>
        req<ProjectTemplateVersion>(
          `${BASE.config}/api/v1/projects/${encodeURIComponent(projId)}/template/publish`,
          { method: "POST", headers: { Authorization: `Bearer ${token}` } },
        ),
      getPublishedTemplateKeys: (projId: string, token: string) =>
        req<PublishedTemplateKeysResponse>(
          `${BASE.config}/api/v1/projects/${encodeURIComponent(projId)}/template/published-keys`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
    },
  };
}
