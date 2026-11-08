import {test} from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {PulseClient, PulseError} from "../dist/index.js";

test("wire protocol, lifecycle, escaped IDs, no redirects or write retries", async () => {
  const seen = [];
  const server = createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    seen.push({url: req.url, method: req.method, auth: req.headers.authorization, body: raw && JSON.parse(raw)});
    if (req.url === "/api/v1/error") {res.writeHead(503, {"X-Request-ID": "request-123"}); res.end("private response body"); return;}
    if (req.url === "/api/v1/redirect") {res.writeHead(307, {Location: "/api/v1/leak"}); res.end(); return;}
    if (req.method === "DELETE") {res.writeHead(204); res.end(); return;}
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(req.url === "/api/v1/auth/login" ? {access_token: "test-session", expires_in: 60} : {task_id: "task-one", status: "pending_approval", tasks: {items: [], total: 0}}));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const client = new PulseClient({baseUrl: `http://127.0.0.1:${server.address().port}`});
    assert.deepEqual(await client.login("guest@example.test", "test-only-password"), {expiresIn: 60});
    await client.listTasks("project", {search: "Сайт & чат", archived: true});
    assert.equal(new URL(seen.at(-1).url, "http://localhost").searchParams.get("search"), "Сайт & чат");
    assert.equal(seen.at(-1).auth, "Bearer test-session");
    await client.createTask({project_id: "project", title: "Пример", priority: "high"});
    assert.equal(seen.at(-1).body.priority, "high");
    await client.archiveTask("a/b?"); assert.equal(seen.at(-1).url, "/api/v1/work/tasks/a%2Fb%3F");
    await client.restoreTask("task-one"); assert.equal(seen.at(-1).method, "POST");
    const before = seen.length;
    await client.sendMessage("project", "session", {body: "Создай задачу"});
    assert.equal(seen.length, before + 1); // No automatic approval.
    await assert.rejects(client.request("POST", "/api/v1/error", {}), e => e instanceof PulseError && e.status === 503 && e.requestId === "request-123" && !String(e).includes("private"));
    assert.equal(seen.filter(r => r.url === "/api/v1/error").length, 1);
    await assert.rejects(client.request("POST", "/api/v1/redirect", {}), e => e.status === 307);
    assert.equal(seen.filter(r => r.url === "/api/v1/leak").length, 0);
    for (const path of ["https://example.test/api/v1/me", "//example.test/api/v1/me", "/api/v1/../../../other"]) await assert.rejects(client.request("GET", path), TypeError);
    await client.logout(); await client.me(); assert.equal(seen.at(-1).auth, undefined);
  } finally {server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
});

test("timeouts and caller cancellation stop pending responses", async () => {
  const server = createServer(() => {});
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const client = new PulseClient({baseUrl: `http://127.0.0.1:${server.address().port}`, timeoutMs: 30});
    await assert.rejects(client.me(), e => e.name === "TimeoutError");
    await assert.rejects(client.request("GET", "/api/v1/auth/me", undefined, {signal: AbortSignal.abort()}), e => e.name === "AbortError");
  } finally {server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
});
