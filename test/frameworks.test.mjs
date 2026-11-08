import {test} from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {handleTaskList, pulseFromAuthorization} from "../dist/frameworks.js";

test("framework adapter keeps concurrent users separate and rejects anonymous writes", async () => {
  const seen = [];
  const server = createServer((req, res) => {seen.push(req.headers.authorization); res.setHeader("Content-Type", "application/json"); res.end('{"tasks":{"items":[]}}');});
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.throws(() => pulseFromAuthorization(base, "Basic test"));
    const route = "https://application.example.test/api/pulse/tasks?project_id=demo";
    const responses = await Promise.all(["alice", "bob"].map(token => handleTaskList(base, new Request(route, {headers: {Authorization: `Bearer ${token}`}}))));
    assert.deepEqual(new Set(seen), new Set(["Bearer alice", "Bearer bob"]));
    assert.ok(responses.every(response => response.status === 200 && response.headers.get("Cache-Control") === "private, no-store"));
    assert.equal((await handleTaskList(base, new Request(route))).status, 401);
    assert.equal((await handleTaskList(base, new Request(route, {method: "POST"}))).status, 405);
    assert.equal(seen.length, 2);
  } finally {server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
});
