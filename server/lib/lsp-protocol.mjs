/**
 * LSP JSON-RPC protocol over stdio.
 * Handles Content-Length framing, request/response matching, and notifications.
 */

/** Default timeout for LSP requests in milliseconds. */
const REQUEST_TIMEOUT_MS = 30000;

/**
 * Write a JSON-RPC message with Content-Length header to a stream.
 */
export function writeMessage(stream, obj) {
  const body = JSON.stringify(obj);
  const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
  stream.write(header + body);
}

/**
 * Reads Content-Length-framed JSON-RPC messages from a stream.
 * Handles chunked reads and partial messages.
 */
export class MessageReader {
  #buffer = Buffer.alloc(0);
  #onMessage;

  constructor(stream, onMessage) {
    this.#onMessage = onMessage;
    stream.on("data", (chunk) => this.#handleData(chunk));
  }

  #handleData(chunk) {
    this.#buffer = Buffer.concat([this.#buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
    while (true) {
      const headerEnd = this.#buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const header = this.#buffer.subarray(0, headerEnd).toString();
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        // Malformed header — skip to after the double CRLF
        this.#buffer = this.#buffer.subarray(headerEnd + 4);
        continue;
      }
      const len = parseInt(match[1], 10);
      const start = headerEnd + 4;
      if (this.#buffer.length < start + len) return; // Incomplete body
      const body = this.#buffer.subarray(start, start + len).toString();
      this.#buffer = this.#buffer.subarray(start + len);
      this.#onMessage(JSON.parse(body));
    }
  }
}

/**
 * JSON-RPC client. Sends requests with auto-incrementing IDs,
 * matches responses, routes notifications.
 */
export class RpcClient {
  #stdin;
  #reader;
  #nextId = 1;
  #pending = new Map(); // id → { resolve, reject, timer }
  #notificationHandlers = new Map(); // method → handler
  #disposed = false;

  constructor(stdin, stdout) {
    this.#stdin = stdin;
    this.#reader = new MessageReader(stdout, (msg) => this.#handleMessage(msg));
  }

  request(method, params = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    if (this.#disposed) return Promise.reject(new Error("RpcClient disposed"));
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`LSP_TIMEOUT: ${method} (${timeoutMs}ms)`));
      }, timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      writeMessage(this.#stdin, { jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method, params = {}) {
    if (this.#disposed) return;
    writeMessage(this.#stdin, { jsonrpc: "2.0", method, params });
  }

  onNotification(method, handler) {
    this.#notificationHandlers.set(method, handler);
  }

  dispose() {
    this.#disposed = true;
    for (const [id, { reject, timer }] of this.#pending) {
      clearTimeout(timer);
      reject(new Error("RpcClient disposed"));
    }
    this.#pending.clear();
  }

  #handleMessage(msg) {
    // Response (has id, has result or error)
    if (msg.id != null && (msg.result !== undefined || msg.error !== undefined)) {
      const pending = this.#pending.get(msg.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.#pending.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(`LSP_ERROR: ${msg.error.message} (${msg.error.code})`));
        } else {
          pending.resolve(msg.result);
        }
      }
      return;
    }
    // Notification (has method, no id)
    if (msg.method && msg.id == null) {
      const handler = this.#notificationHandlers.get(msg.method);
      if (handler) handler(msg.params);
      return;
    }
  }
}
