import {PulseClient, PulseError} from "./index.js";

/** A fresh client for each user request; never share mutable session state. */
export function pulseFromAuthorization(baseUrl: string, authorization: string | null | undefined) {
  const match = /^Bearer ([^\s]+)$/i.exec(authorization ?? "");
  if (!match) throw new TypeError("A user Bearer session is required");
  return new PulseClient({baseUrl, token: match[1]});
}

/** Next.js, Nuxt/Nitro and SvelteKit can pass their standard Request object. */
export function pulseFromRequest(baseUrl: string, request: Pick<Request, "headers">) {
  return pulseFromAuthorization(baseUrl, request.headers.get("authorization"));
}

/** Read-only route adapter for Next.js, Nuxt/Nitro and SvelteKit. */
export async function handleTaskList(baseUrl: string, request: Request): Promise<Response> {
  if (request.method !== "GET") return Response.json({error: "method_not_allowed"}, {status: 405, headers: {Allow: "GET"}});
  if (!/^Bearer [^\s]+$/i.test(request.headers.get("authorization") ?? "")) {
    return Response.json({error: "user_session_required"}, {status: 401});
  }
  const projectId = new URL(request.url).searchParams.get("project_id");
  if (!projectId) return Response.json({error: "project_id_required"}, {status: 400});
  try {
    const client = pulseFromRequest(baseUrl, request);
    const query = new URLSearchParams({project_id: projectId, limit: "20"});
    const result = await client.request("GET", `/api/v1/work/tasks?${query}`, undefined, {signal: request.signal});
    return Response.json(result, {headers: {"Cache-Control": "private, no-store"}});
  } catch (error) {
    const status = error instanceof PulseError && error.status >= 400 ? error.status : 502;
    return Response.json({error: "pulse_request_failed"}, {status, headers: {"Cache-Control": "private, no-store"}});
  }
}
