import { getSceneVersion } from "@excalidraw/excalidraw";

import type { ExcalidrawElement, FileId } from "@excalidraw/element/types";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";

import { STORAGE_KEYS } from "../app_constants";

import type { BoardRecord, BoardsBackend } from "./Boards";

export type CloudSyncEvent =
  | {
      type: "board:sync";
      boardId: string;
      name?: string;
      updatedAt?: number;
      elements: readonly ExcalidrawElement[];
    }
  | {
      type: "boards:changed";
      boardId?: string;
      updatedAt?: number;
      deleted?: boolean;
    }
  | {
      type: "file:ready";
      boardId: string;
      fileIds: FileId[];
    };

const normalizeBaseUrl = (url: string | undefined): string | null => {
  if (!url) {
    return null;
  }
  const trimmed = url.trim().replace(/\/+$/, "");
  return trimmed || null;
};

export const getSyncUrl = (): string | null =>
  normalizeBaseUrl(import.meta.env.VITE_APP_SYNC_URL);

export const getSyncToken = (): string | null => {
  try {
    const token = localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_SYNC_TOKEN);
    return token?.trim() || null;
  } catch {
    return null;
  }
};

export const setSyncToken = (token: string | null) => {
  try {
    if (token?.trim()) {
      localStorage.setItem(STORAGE_KEYS.LOCAL_STORAGE_SYNC_TOKEN, token.trim());
    } else {
      localStorage.removeItem(STORAGE_KEYS.LOCAL_STORAGE_SYNC_TOKEN);
    }
  } catch (error) {
    console.error("Failed to store sync token", error);
  }
};

/**
 * Allows pairing a device by visiting `https://your-app/?syncToken=<secret>` once.
 * Saves the token to localStorage and removes it from the address bar.
 */
export const initSyncTokenFromUrl = () => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("syncToken");
    if (token && token.trim()) {
      setSyncToken(token);
      url.searchParams.delete("syncToken");
      window.history.replaceState({}, "", url.toString());
    }
  } catch {
    // Ignore invalid URL environments (e.g. unit tests)
  }
};

export const isCloudSyncConfigured = (): boolean => Boolean(getSyncUrl());

export const isCloudSyncEnabled = (): boolean =>
  Boolean(getSyncUrl() && getSyncToken());

export const verifySyncToken = async (
  token: string,
): Promise<"ok" | "unauthorized" | "offline"> => {
  const baseUrl = getSyncUrl();
  if (!baseUrl) {
    return "offline";
  }
  const trimmed = token.trim();
  if (!trimmed) {
    return "unauthorized";
  }
  try {
    const res = await fetch(`${baseUrl}/api/auth/verify`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${trimmed}`,
      },
    });
    if (res.ok) {
      return "ok";
    }
    if (res.status === 401 || res.status === 403) {
      return "unauthorized";
    }
    return "offline";
  } catch {
    return "offline";
  }
};

const syncFetch = async (
  path: string,
  init: RequestInit = {},
): Promise<Response | null> => {
  const baseUrl = getSyncUrl();
  const token = getSyncToken();
  if (!baseUrl || !token) {
    return null;
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${baseUrl}${path}`, { ...init, headers });
};

export const fetchRemoteBoards = async (): Promise<BoardRecord[] | null> => {
  try {
    const res = await syncFetch("/api/boards");
    if (!res || !res.ok) {
      return null;
    }
    const data = (await res.json()) as { boards?: BoardRecord[] };
    return Array.isArray(data.boards) ? data.boards : null;
  } catch (error) {
    console.warn("CloudSync: failed to list remote boards", error);
    return null;
  }
};

export const fetchRemoteBoard = async (
  id: string,
): Promise<BoardRecord | null> => {
  try {
    const res = await syncFetch(`/api/boards/${encodeURIComponent(id)}`);
    if (!res || !res.ok) {
      return null;
    }
    const data = (await res.json()) as { board?: BoardRecord };
    return data.board ?? null;
  } catch (error) {
    console.warn("CloudSync: failed to fetch remote board", error);
    return null;
  }
};

export const putRemoteBoard = async (record: BoardRecord): Promise<boolean> => {
  try {
    const res = await syncFetch(
      `/api/boards/${encodeURIComponent(record.id)}`,
      {
        method: "PUT",
        body: JSON.stringify(record),
      },
    );
    return Boolean(res?.ok);
  } catch (error) {
    console.warn("CloudSync: failed to save remote board", error);
    return false;
  }
};

export const deleteRemoteBoard = async (id: string): Promise<boolean> => {
  try {
    const res = await syncFetch(`/api/boards/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    return Boolean(res?.ok);
  } catch (error) {
    console.warn("CloudSync: failed to delete remote board", error);
    return false;
  }
};

export const uploadRemoteFile = async (
  id: FileId,
  fileData: BinaryFileData,
): Promise<boolean> => {
  try {
    const res = await syncFetch(`/api/files/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(fileData),
    });
    return Boolean(res?.ok);
  } catch (error) {
    console.warn("CloudSync: failed to upload file", id, error);
    return false;
  }
};

export const fetchRemoteFile = async (
  id: FileId,
): Promise<BinaryFileData | null> => {
  try {
    const res = await syncFetch(`/api/files/${encodeURIComponent(id)}`);
    if (!res || !res.ok) {
      return null;
    }
    return (await res.json()) as BinaryFileData;
  } catch (error) {
    console.warn("CloudSync: failed to fetch remote file", id, error);
    return null;
  }
};

const REMOTE_SAVE_DEBOUNCE_MS = 1200;
const pendingRemoteSaves = new Map<
  string,
  { record: BoardRecord; timer: ReturnType<typeof setTimeout> }
>();

export const flushRemoteBoardSaves = () => {
  for (const [id, entry] of pendingRemoteSaves) {
    clearTimeout(entry.timer);
    pendingRemoteSaves.delete(id);
    putRemoteBoard(entry.record).catch(() => {});
  }
};

const scheduleRemoteBoardSave = (record: BoardRecord) => {
  const existing = pendingRemoteSaves.get(record.id);
  if (existing) {
    clearTimeout(existing.timer);
  }
  const timer = setTimeout(() => {
    pendingRemoteSaves.delete(record.id);
    putRemoteBoard(record).catch(() => {});
  }, REMOTE_SAVE_DEBOUNCE_MS);
  pendingRemoteSaves.set(record.id, { record, timer });
};

/**
 * Wraps a local BoardsBackend (IndexedDB) with Cloudflare sync when configured.
 * Always writes to local storage first so the app stays responsive offline.
 */
export const createSyncedBoardsBackend = (
  local: BoardsBackend,
): BoardsBackend => ({
  getLocal: (id) => local.get(id),

  get: async (id) => {
    if (isCloudSyncEnabled()) {
      const remote = await fetchRemoteBoard(id);
      if (remote) {
        await local.set(id, remote);
        return remote;
      }
    }
    return local.get(id);
  },

  set: async (id, record) => {
    await local.set(id, record);
    if (isCloudSyncEnabled()) {
      scheduleRemoteBoardSave(record);
    }
  },

  remove: async (id) => {
    const pending = pendingRemoteSaves.get(id);
    if (pending) {
      clearTimeout(pending.timer);
      pendingRemoteSaves.delete(id);
    }
    await local.remove(id);
    if (isCloudSyncEnabled()) {
      await deleteRemoteBoard(id);
    }
  },

  list: async () => {
    const localBoards = await local.list();
    if (!isCloudSyncEnabled()) {
      return localBoards;
    }

    const remoteBoards = await fetchRemoteBoards();
    if (!remoteBoards) {
      return localBoards;
    }

    const merged = new Map<string, BoardRecord>();
    for (const board of remoteBoards) {
      merged.set(board.id, board);
    }

    const localOnlyToUpload: BoardRecord[] = [];
    for (const localBoard of localBoards) {
      const remoteBoard = merged.get(localBoard.id);
      if (!remoteBoard) {
        merged.set(localBoard.id, localBoard);
        localOnlyToUpload.push(localBoard);
      } else if (localBoard.updatedAt > remoteBoard.updatedAt) {
        merged.set(localBoard.id, localBoard);
        localOnlyToUpload.push(localBoard);
      }
    }

    // Update local IDB cache with newer remote boards
    await Promise.all(
      remoteBoards.map(async (remoteBoard) => {
        const localBoard = localBoards.find((b) => b.id === remoteBoard.id);
        if (!localBoard || remoteBoard.updatedAt >= localBoard.updatedAt) {
          await local.set(remoteBoard.id, remoteBoard);
        }
      }),
    );

    // Push any local-only or newer local boards to cloud in background
    if (localOnlyToUpload.length) {
      Promise.all(localOnlyToUpload.map((b) => putRemoteBoard(b))).catch(
        () => {},
      );
    }

    return [...merged.values()];
  },
});

const BROADCAST_THROTTLE_MS = 33; // ~30fps leading+trailing delta streaming
const PING_INTERVAL_MS = 25_000;

class CloudSyncClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<(event: CloudSyncEvent) => void>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 0;
  private intentionalClose = false;

  private lastSceneVersionByBoard = new Map<string, number>();
  private sentElementVersionsByBoard = new Map<string, Map<string, number>>();
  private pendingDeltaByBoard = new Map<
    string,
    Map<string, ExcalidrawElement>
  >();
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;
  private lastFlushAt = 0;

  connect = () => {
    if (!isCloudSyncEnabled()) {
      return;
    }
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const baseUrl = getSyncUrl();
    const token = getSyncToken();
    if (!baseUrl || !token) {
      return;
    }

    this.intentionalClose = false;
    const wsBase = baseUrl.replace(/^http/, "ws");
    const wsUrl = `${wsBase}/ws?token=${encodeURIComponent(token)}`;

    try {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.addEventListener("open", () => {
        this.reconnectAttempt = 0;
        this.startPing();
        this.flushBroadcast();
      });

      ws.addEventListener("message", (event) => {
        if (typeof event.data !== "string") {
          return;
        }
        try {
          const parsed = JSON.parse(event.data) as CloudSyncEvent | { type: "pong" };
          if (parsed.type === "pong") {
            return;
          }
          this.listeners.forEach((listener) => listener(parsed));
        } catch {
          // Ignore malformed messages
        }
      });

      ws.addEventListener("close", () => {
        this.stopPing();
        if (this.ws === ws) {
          this.ws = null;
        }
        if (!this.intentionalClose) {
          this.scheduleReconnect();
        }
      });

      ws.addEventListener("error", () => {
        // Close handler will schedule reconnect
      });
    } catch (error) {
      console.warn("CloudSync: WebSocket connection failed", error);
      this.scheduleReconnect();
    }
  };

  disconnect = () => {
    this.intentionalClose = true;
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  };

  subscribe = (listener: (event: CloudSyncEvent) => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  recordBoardElements = (
    boardId: string,
    elements: readonly ExcalidrawElement[],
  ) => {
    this.lastSceneVersionByBoard.set(boardId, getSceneVersion(elements));
    let versionMap = this.sentElementVersionsByBoard.get(boardId);
    if (!versionMap) {
      versionMap = new Map<string, number>();
      this.sentElementVersionsByBoard.set(boardId, versionMap);
    }
    for (const el of elements) {
      const prev = versionMap.get(el.id) ?? -1;
      if (el.version > prev) {
        versionMap.set(el.id, el.version);
      }
    }
  };

  broadcastBoardElements = (
    boardId: string,
    elements: readonly ExcalidrawElement[],
  ) => {
    if (!isCloudSyncEnabled()) {
      return;
    }
    const sceneVersion = getSceneVersion(elements);
    if (this.lastSceneVersionByBoard.get(boardId) === sceneVersion) {
      return;
    }
    this.lastSceneVersionByBoard.set(boardId, sceneVersion);

    let versionMap = this.sentElementVersionsByBoard.get(boardId);
    if (!versionMap) {
      versionMap = new Map<string, number>();
      this.sentElementVersionsByBoard.set(boardId, versionMap);
    }

    let deltaMap = this.pendingDeltaByBoard.get(boardId);
    let hasChanges = false;
    for (const el of elements) {
      const prevVersion = versionMap.get(el.id) ?? -1;
      if (el.version > prevVersion) {
        versionMap.set(el.id, el.version);
        if (!deltaMap) {
          deltaMap = new Map<string, ExcalidrawElement>();
          this.pendingDeltaByBoard.set(boardId, deltaMap);
        }
        deltaMap.set(el.id, el);
        hasChanges = true;
      }
    }

    if (!hasChanges) {
      return;
    }

    const now = Date.now();
    const elapsed = now - this.lastFlushAt;
    if (elapsed >= BROADCAST_THROTTLE_MS && !this.throttleTimer) {
      // Leading edge: send immediately with 0ms delay on pen-down
      this.flushBroadcast();
    } else if (!this.throttleTimer) {
      this.throttleTimer = setTimeout(() => {
        this.throttleTimer = null;
        this.flushBroadcast();
      }, Math.max(0, BROADCAST_THROTTLE_MS - elapsed));
    }
  };

  sendFileReady = (boardId: string, fileIds: FileId[]) => {
    if (!fileIds.length || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      this.ws.send(
        JSON.stringify({
          type: "file:ready",
          boardId,
          fileIds,
        }),
      );
    } catch {
      // Ignore send errors
    }
  };

  private flushBroadcast = () => {
    if (
      !this.pendingDeltaByBoard.size ||
      !this.ws ||
      this.ws.readyState !== WebSocket.OPEN
    ) {
      return;
    }
    this.lastFlushAt = Date.now();
    for (const [boardId, deltaMap] of this.pendingDeltaByBoard) {
      const changedElements = [...deltaMap.values()];
      if (!changedElements.length) {
        continue;
      }
      try {
        this.ws.send(
          JSON.stringify({
            type: "board:sync",
            boardId,
            elements: changedElements,
          }),
        );
      } catch (error) {
        console.warn("CloudSync: failed to send board update", error);
      }
    }
    this.pendingDeltaByBoard.clear();
  };

  private startPing = () => {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: "ping" }));
        } catch {
          // Ignore
        }
      }
    }, PING_INTERVAL_MS);
  };

  private stopPing = () => {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  };

  private scheduleReconnect = () => {
    if (this.reconnectTimer || !isCloudSyncEnabled()) {
      return;
    }
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 15_000);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  };
}

export const cloudSync = new CloudSyncClient();
