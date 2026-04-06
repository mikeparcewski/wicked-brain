import { test } from "node:test";
import assert from "node:assert/strict";
import { Writable, Readable } from "node:stream";
import { writeMessage, MessageReader, RpcClient } from "../lib/lsp-protocol.mjs";

// --- Task 1: writeMessage and MessageReader ---

test("writeMessage encodes JSON-RPC with Content-Length header", () => {
  const chunks = [];
  const stream = new Writable({
    write(chunk, enc, cb) { chunks.push(chunk); cb(); }
  });

  writeMessage(stream, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });

  const output = Buffer.concat(chunks).toString();
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  assert.ok(output.startsWith(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`));
  assert.ok(output.endsWith(body));
});

test("MessageReader parses a single message", (t, done) => {
  const readable = new Readable({ read() {} });
  const messages = [];
  const reader = new MessageReader(readable, (msg) => {
    messages.push(msg);
    assert.equal(msg.id, 1);
    assert.equal(msg.method, "test");
    done();
  });

  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "test" });
  readable.push(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
});

test("MessageReader handles chunked input", (t, done) => {
  const readable = new Readable({ read() {} });
  const reader = new MessageReader(readable, (msg) => {
    assert.equal(msg.id, 42);
    done();
  });

  const body = JSON.stringify({ jsonrpc: "2.0", id: 42, result: "ok" });
  const full = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
  // Split in the middle of the body
  const mid = Math.floor(full.length / 2);
  readable.push(full.slice(0, mid));
  readable.push(full.slice(mid));
});

test("MessageReader handles multiple messages in one chunk", (t, done) => {
  const readable = new Readable({ read() {} });
  const messages = [];
  const reader = new MessageReader(readable, (msg) => {
    messages.push(msg);
    if (messages.length === 2) {
      assert.equal(messages[0].id, 1);
      assert.equal(messages[1].id, 2);
      done();
    }
  });

  const body1 = JSON.stringify({ jsonrpc: "2.0", id: 1, result: "a" });
  const body2 = JSON.stringify({ jsonrpc: "2.0", id: 2, result: "b" });
  const combined =
    `Content-Length: ${Buffer.byteLength(body1)}\r\n\r\n${body1}` +
    `Content-Length: ${Buffer.byteLength(body2)}\r\n\r\n${body2}`;
  readable.push(combined);
});

// --- Task 2: RpcClient ---

test("RpcClient sends request and resolves on response", async () => {
  const sent = [];
  const stdin = new Writable({
    write(chunk, enc, cb) { sent.push(chunk.toString()); cb(); }
  });
  const stdout = new Readable({ read() {} });
  const client = new RpcClient(stdin, stdout);

  const promise = client.request("initialize", { capabilities: {} });

  // Simulate server response
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } });
  stdout.push(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);

  const result = await promise;
  assert.deepEqual(result, { capabilities: {} });
  client.dispose();
});

test("RpcClient rejects on LSP error response", async () => {
  const stdin = new Writable({ write(c, e, cb) { cb(); } });
  const stdout = new Readable({ read() {} });
  const client = new RpcClient(stdin, stdout);

  const promise = client.request("textDocument/definition", {});

  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32600, message: "Invalid Request" } });
  stdout.push(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);

  await assert.rejects(promise, /LSP_ERROR: Invalid Request/);
  client.dispose();
});

test("RpcClient routes notifications to handlers", (t, done) => {
  const stdin = new Writable({ write(c, e, cb) { cb(); } });
  const stdout = new Readable({ read() {} });
  const client = new RpcClient(stdin, stdout);

  client.onNotification("textDocument/publishDiagnostics", (params) => {
    assert.equal(params.uri, "file:///test.ts");
    assert.equal(params.diagnostics.length, 1);
    client.dispose();
    done();
  });

  const body = JSON.stringify({
    jsonrpc: "2.0",
    method: "textDocument/publishDiagnostics",
    params: { uri: "file:///test.ts", diagnostics: [{ message: "error" }] }
  });
  stdout.push(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
});
