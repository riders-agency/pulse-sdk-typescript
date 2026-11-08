import type {AIMessage, AISession, JSONRecord, RequestOptions, Task, TaskInput, TaskPage} from "./types.js";
export type * from "./types.js";

/** Response bodies and credentials are deliberately excluded from errors. */
export class PulseError extends Error {
  constructor(public readonly status: number, public readonly requestId: string | null = null) {
    super(`Pulse API returned HTTP ${status}`); this.name = "PulseError";
  }
}

export class PulseClient {
  readonly #base: URL;
  #token: string;
  readonly #timeout: number;
  constructor(options: {baseUrl: string; token?: string; timeoutMs?: number}) {
    const url = new URL(options.baseUrl);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      throw new TypeError("baseUrl must be an origin without credentials or path");
    }
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
      throw new TypeError("HTTPS is required except for loopback development");
    }
    this.#base = url; this.#token = options.token ?? "";
    this.#timeout = options.timeoutMs ?? 60_000;
    if (!Number.isSafeInteger(this.#timeout) || this.#timeout < 1) throw new TypeError("timeoutMs must be a positive integer");
  }

  /** Server-side only. Keep the client/token out of browser bundles and logs. */
  setToken(token: string) { this.#token = token; }

  async request<T = unknown>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    const url = new URL(path, this.#base);
    if (!path.startsWith("/api/v1/") || url.origin !== this.#base.origin || !url.pathname.startsWith("/api/v1/") || path.includes("\\")) {
      throw new TypeError("Only same-origin /api/v1/ paths are allowed");
    }
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(this.#timeout)]) : AbortSignal.timeout(this.#timeout);
    const headers: Record<string, string> = {Accept: "application/json"};
    if (this.#token) headers.Authorization = `Bearer ${this.#token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(url, {method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal, redirect: "manual", credentials: "omit"});
    if (!response.ok) {
      await response.body?.cancel();
      throw new PulseError(response.status, response.headers.get("X-Request-ID"));
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    try { return (text ? JSON.parse(text) : undefined) as T; }
    catch { throw new Error("Pulse API returned invalid JSON"); }
  }

  async login(email: string, password: string) {
    const result = await this.request<{access_token: string; expires_in: number}>("POST", "/api/v1/auth/login", {email, password});
    this.setToken(result.access_token); return {expiresIn: result.expires_in};
  }
  me() { return this.request<{user_id: string}>("GET", "/api/v1/auth/me"); }
  async logout() { await this.request("POST", "/api/v1/auth/logout"); this.#token = ""; }

  listTasks(projectId: string, options: {limit?: number; offset?: number; search?: string; archived?: boolean} = {}) {
    const query = new URLSearchParams({project_id: projectId});
    for (const [key, value] of Object.entries(options)) if (value !== undefined) query.set(key, String(value));
    return this.request<TaskPage>("GET", `/api/v1/work/tasks?${query}`);
  }
  getTask(taskId: string) { return this.request<{task: Task}>("GET", `/api/v1/work/tasks/${segment(taskId)}`); }
  createTask(input: TaskInput) { return this.request<Task>("POST", "/api/v1/work/tasks", input); }
  updateTask(taskId: string, patch: Partial<Omit<TaskInput, "project_id" | "task_workflow_status_id">> & {expected_revision?: number}) {
    return this.request<Task>("PATCH", `/api/v1/work/tasks/${segment(taskId)}`, patch);
  }
  archiveTask(taskId: string) { return this.request("DELETE", `/api/v1/work/tasks/${segment(taskId)}`); }
  restoreTask(taskId: string) { return this.request<{archived: boolean}>("POST", `/api/v1/work/tasks/${segment(taskId)}/restore`, {}); }

  createSession(projectId: string) {
    return this.request<AISession>("POST", `${ai(projectId)}/employee/sessions`, {screen_scope: "project", screen_entity_type: "project", screen_entity_id: projectId, page_context_json: {projectId}});
  }
  getSession(projectId: string, sessionId: string) {
    return this.request<AISession>("GET", `${ai(projectId)}/employee/sessions/${segment(sessionId)}`);
  }
  sendMessage(projectId: string, sessionId: string, input: AIMessage, options?: RequestOptions) {
    return this.request<AISession>("POST", `${ai(projectId)}/employee/sessions/${segment(sessionId)}/messages`, input, options);
  }
  editProposal(projectId: string, toolCallId: string, input: JSONRecord, reason = "Изменено пользователем через SDK") {
    return this.request<AISession>("PATCH", `${ai(projectId)}/tool-calls/${segment(toolCallId)}`, {input_json: input, edit_reason: reason});
  }
  approveProposal(projectId: string, toolCallId: string) {
    return this.request<AISession>("POST", `${ai(projectId)}/tool-calls/${segment(toolCallId)}/approve`, {});
  }
  rejectProposal(projectId: string, toolCallId: string, reason = "Отклонено пользователем") {
    return this.request<AISession>("POST", `${ai(projectId)}/tool-calls/${segment(toolCallId)}/reject`, {reason});
  }
}

function segment(value: string) {
  if (!value || value === "." || value === "..") throw new TypeError("An identifier is required");
  return encodeURIComponent(value);
}
function ai(projectId: string) { return `/api/v1/projects/${segment(projectId)}/ai`; }
