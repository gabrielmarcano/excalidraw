import { DurableObject } from "cloudflare:workers";

export interface Env {
  CANVAS_HUB: DurableObjectNamespace<CanvasHub>;
  SYNC_TOKEN: string;
  ALLOWED_ORIGIN?: string;
}

const FILE_CHUNK_SIZE = 512 * 1024; // 512 KB per SQLite row

type BoardRow = {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  elements: string;
};

type BoardRecord = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  elements: unknown[];
};

type WsIncomingMessage =
  | { type: "ping" }
  | {
      type: "board:sync";
      boardId: string;
      name?: string;
      createdAt?: number;
      updatedAt?: number;
      elements: unknown[];
    }
  | {
      type: "file:ready";
      boardId: string;
      fileIds: string[];
    };

const corsHeaders = (env: Env, request: Request): Record<string, string> => {
  const configured = env.ALLOWED_ORIGIN?.trim() || "*";
  const requestOrigin = request.headers.get("Origin");
  const allowOrigin =
    configured === "*" ? requestOrigin || "*" : configured;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
};

const jsonResponse = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });

const timingSafeEqual = (a: string, b: string): boolean => {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < bufA.byteLength; i++) {
    diff |= bufA[i] ^ bufB[i];
  }
  return diff === 0;
};

const isAuthorized = (request: Request, env: Env): boolean => {
  if (!env.SYNC_TOKEN) {
    return false;
  }
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) {
    return timingSafeEqual(auth.slice(7).trim(), env.SYNC_TOKEN);
  }
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");
  if (queryToken) {
    return timingSafeEqual(queryToken, env.SYNC_TOKEN);
  }
  return false;
};

const rowToBoard = (row: BoardRow): BoardRecord => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  elements: JSON.parse(row.elements),
});

export class CanvasHub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS boards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        elements TEXT NOT NULL
      )
    `);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS file_chunks (
        id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (id, chunk_index)
      )
    `);
  }

  private broadcast(payload: unknown, exclude?: WebSocket) {
    const raw = JSON.stringify(payload);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === exclude) {
        continue;
      }
      try {
        socket.send(raw);
      } catch {
        // Ignore broken sockets; runtime will clean them up
      }
    }
  }

  private upsertBoard(record: BoardRecord) {
    this.ctx.storage.sql.exec(
      `INSERT INTO boards (id, name, created_at, updated_at, elements)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         updated_at = excluded.updated_at,
         elements = excluded.elements`,
      record.id,
      record.name,
      record.createdAt,
      record.updatedAt,
      JSON.stringify(record.elements),
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket upgrade", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (pathname === "/api/boards" && request.method === "GET") {
      const rows = this.ctx.storage.sql
        .exec<BoardRow>(
          `SELECT id, name, created_at, updated_at, elements
           FROM boards
           ORDER BY updated_at DESC`,
        )
        .toArray();
      return jsonResponse({ boards: rows.map(rowToBoard) });
    }

    const boardMatch = pathname.match(/^\/api\/boards\/([^/]+)$/);
    if (boardMatch) {
      const id = decodeURIComponent(boardMatch[1]);

      if (request.method === "GET") {
        const row = this.ctx.storage.sql
          .exec<BoardRow>(
            `SELECT id, name, created_at, updated_at, elements
             FROM boards
             WHERE id = ?`,
            id,
          )
          .toArray()[0];
        if (!row) {
          return jsonResponse({ error: "Not found" }, 404);
        }
        return jsonResponse({ board: rowToBoard(row) });
      }

      if (request.method === "PUT") {
        const body = (await request.json()) as Partial<BoardRecord>;
        const now = Date.now();
        const existing = this.ctx.storage.sql
          .exec<BoardRow>(
            `SELECT id, name, created_at, updated_at, elements
             FROM boards
             WHERE id = ?`,
            id,
          )
          .toArray()[0];

        const record: BoardRecord = {
          id,
          name: body.name ?? existing?.name ?? "Untitled",
          createdAt: body.createdAt ?? existing?.created_at ?? now,
          updatedAt: body.updatedAt ?? now,
          elements: Array.isArray(body.elements)
            ? body.elements
            : existing
              ? JSON.parse(existing.elements)
              : [],
        };

        this.upsertBoard(record);
        this.broadcast({
          type: "boards:changed",
          boardId: id,
          updatedAt: record.updatedAt,
        });
        return jsonResponse({ board: record });
      }

      if (request.method === "DELETE") {
        this.ctx.storage.sql.exec(`DELETE FROM boards WHERE id = ?`, id);
        this.broadcast({
          type: "boards:changed",
          boardId: id,
          deleted: true,
        });
        return jsonResponse({ ok: true });
      }
    }

    const fileMatch = pathname.match(/^\/api\/files\/([^/]+)$/);
    if (fileMatch) {
      const fileId = decodeURIComponent(fileMatch[1]);

      if (request.method === "PUT") {
        const body = await request.text();
        const now = Date.now();
        this.ctx.storage.sql.exec(
          `DELETE FROM file_chunks WHERE id = ?`,
          fileId,
        );
        for (
          let offset = 0, index = 0;
          offset < body.length || index === 0;
          offset += FILE_CHUNK_SIZE, index += 1
        ) {
          const chunk = body.slice(offset, offset + FILE_CHUNK_SIZE);
          this.ctx.storage.sql.exec(
            `INSERT INTO file_chunks (id, chunk_index, data, updated_at)
             VALUES (?, ?, ?, ?)`,
            fileId,
            index,
            chunk,
            now,
          );
        }
        return jsonResponse({ ok: true, id: fileId });
      }

      if (request.method === "GET") {
        const rows = this.ctx.storage.sql
          .exec<{ data: string }>(
            `SELECT data
             FROM file_chunks
             WHERE id = ?
             ORDER BY chunk_index ASC`,
            fileId,
          )
          .toArray();
        if (!rows.length) {
          return jsonResponse({ error: "File not found" }, 404);
        }
        const body = rows.map((row) => row.data).join("");
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }

      if (request.method === "DELETE") {
        this.ctx.storage.sql.exec(
          `DELETE FROM file_chunks WHERE id = ?`,
          fileId,
        );
        return jsonResponse({ ok: true });
      }
    }

    return jsonResponse({ error: "Not found" }, 404);
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") {
      return;
    }

    let parsed: WsIncomingMessage;
    try {
      parsed = JSON.parse(message) as WsIncomingMessage;
    } catch {
      return;
    }

    if (parsed.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
      return;
    }

    if (
      parsed.type === "board:sync" &&
      typeof parsed.boardId === "string" &&
      Array.isArray(parsed.elements)
    ) {
      const now = parsed.updatedAt ?? Date.now();
      const existing = this.ctx.storage.sql
        .exec<BoardRow>(
          `SELECT id, name, created_at, updated_at, elements
           FROM boards
           WHERE id = ?`,
          parsed.boardId,
        )
        .toArray()[0];

      const record: BoardRecord = {
        id: parsed.boardId,
        name: parsed.name ?? existing?.name ?? "Untitled",
        createdAt: parsed.createdAt ?? existing?.created_at ?? now,
        updatedAt: now,
        elements: parsed.elements,
      };

      this.upsertBoard(record);

      this.broadcast(
        {
          type: "board:sync",
          boardId: record.id,
          name: record.name,
          updatedAt: record.updatedAt,
          elements: record.elements,
        },
        ws,
      );
      return;
    }

    if (
      parsed.type === "file:ready" &&
      typeof parsed.boardId === "string" &&
      Array.isArray(parsed.fileIds)
    ) {
      this.broadcast(
        {
          type: "file:ready",
          boardId: parsed.boardId,
          fileIds: parsed.fileIds,
        },
        ws,
      );
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    try {
      ws.close(code, reason);
    } catch {
      // Ignore already-closed sockets
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(env, request);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return jsonResponse({ ok: true }, 200, cors);
    }

    if (!isAuthorized(request, env)) {
      return jsonResponse({ error: "Unauthorized" }, 401, cors);
    }

    if (url.pathname === "/api/auth/verify" && request.method === "GET") {
      return jsonResponse({ ok: true }, 200, cors);
    }

    // Boards, files, & WebSocket live sync via singleton Durable Object (SQLite)
    if (
      url.pathname === "/ws" ||
      url.pathname === "/api/boards" ||
      url.pathname.startsWith("/api/boards/") ||
      url.pathname.startsWith("/api/files/")
    ) {
      const id = env.CANVAS_HUB.idFromName("default");
      const stub = env.CANVAS_HUB.get(id);
      const response = await stub.fetch(request);

      if (response.webSocket) {
        return response;
      }

      const headers = new Headers(response.headers);
      for (const [k, v] of Object.entries(cors)) {
        headers.set(k, v);
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return jsonResponse({ error: "Not found" }, 404, cors);
  },
};
