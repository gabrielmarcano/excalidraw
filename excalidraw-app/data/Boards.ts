import { createStore, del, entries, get, set } from "idb-keyval";

import {
  getNonDeletedElements,
  isInitializedImageElement,
} from "@excalidraw/element";

import type { ExcalidrawElement, FileId } from "@excalidraw/element/types";

import { STORAGE_KEYS } from "../app_constants";

export type BoardRecord = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  elements: readonly ExcalidrawElement[];
};

export type BoardSummary = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  elementCount: number;
};

export type ActiveBoard = Pick<BoardRecord, "id" | "name" | "createdAt">;

export type BoardsBackend = {
  get: (id: string) => Promise<BoardRecord | undefined>;
  set: (id: string, record: BoardRecord) => Promise<void>;
  remove: (id: string) => Promise<void>;
  list: () => Promise<BoardRecord[]>;
};

export const createMemoryBoardsBackend = (): BoardsBackend => {
  const store = new Map<string, BoardRecord>();
  return {
    get: (id) => Promise.resolve(store.get(id)),
    set: (id, record) => {
      store.set(id, record);
      return Promise.resolve();
    },
    remove: (id) => {
      store.delete(id);
      return Promise.resolve();
    },
    list: () => Promise.resolve([...store.values()]),
  };
};

const idbStore = createStore(
  `${STORAGE_KEYS.IDB_BOARDS}-db`,
  `${STORAGE_KEYS.IDB_BOARDS}-store`,
);

const idbBoardsBackend: BoardsBackend = {
  get: (id) => get<BoardRecord>(id, idbStore),
  set: (id, record) => set(id, record, idbStore),
  remove: (id) => del(id, idbStore),
  list: async () => {
    const all = await entries<string, BoardRecord>(idbStore);
    return all.map(([, record]) => record);
  },
};

const generateBoardId = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `board-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export class Boards {
  private backend: BoardsBackend;
  private activeBoard: ActiveBoard | null = null;
  private listeners = new Set<() => void>();

  constructor(backend: BoardsBackend) {
    this.backend = backend;
  }

  getActive = (): ActiveBoard | null => this.activeBoard;

  setActive = (board: ActiveBoard | null) => {
    this.activeBoard = board;
    // `setActive` is also called from module-level `initializeScene`, which
    // cannot touch component state, so notify subscribers instead
    this.listeners.forEach((listener) => listener());
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getActiveIdSnapshot = (): string | null => this.activeBoard?.id ?? null;

  getStoredActiveId = (): string | null => {
    try {
      return localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_ACTIVE_BOARD);
    } catch (error) {
      console.error(error);
      return null;
    }
  };

  persistActiveId = () => {
    if (!this.activeBoard) {
      return;
    }
    try {
      localStorage.setItem(
        STORAGE_KEYS.LOCAL_STORAGE_ACTIVE_BOARD,
        this.activeBoard.id,
      );
    } catch (error) {
      console.error(error);
    }
  };

  list = async (): Promise<BoardSummary[]> => {
    const records = await this.backend.list();
    return records
      .map((record) => ({
        id: record.id,
        name: record.name,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        elementCount: getNonDeletedElements(record.elements).length,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  };

  get = async (id: string): Promise<BoardRecord | null> => {
    const record = await this.backend.get(id);
    return record || null;
  };

  getReferencedFileIds = async (): Promise<FileId[]> => {
    const records = await this.backend.list();
    const fileIds = new Set<FileId>();
    for (const record of records) {
      for (const element of record.elements) {
        if (isInitializedImageElement(element)) {
          fileIds.add(element.fileId);
        }
      }
    }
    return [...fileIds];
  };

  create = async (opts: {
    name: string;
    elements: readonly ExcalidrawElement[];
  }): Promise<BoardRecord> => {
    const now = Date.now();
    const record: BoardRecord = {
      id: generateBoardId(),
      name: opts.name,
      createdAt: now,
      updatedAt: now,
      elements: getNonDeletedElements(opts.elements),
    };
    await this.backend.set(record.id, record);
    return record;
  };

  saveSnapshot = async (elements: readonly ExcalidrawElement[]) => {
    const active = this.activeBoard;
    if (!active) {
      return;
    }
    const next = getNonDeletedElements(elements);
    const current = await this.backend.get(active.id);
    if (
      current &&
      current.elements.length === next.length &&
      JSON.stringify(current.elements) === JSON.stringify(next)
    ) {
      return;
    }
    const record: BoardRecord = {
      ...active,
      updatedAt: Date.now(),
      elements: next,
    };
    await this.backend.set(active.id, record);
  };

  rename = async (id: string, name: string): Promise<BoardRecord | null> => {
    const record = await this.backend.get(id);
    if (!record) {
      return null;
    }
    const next: BoardRecord = { ...record, name, updatedAt: Date.now() };
    await this.backend.set(id, next);
    if (this.activeBoard?.id === id) {
      this.activeBoard = { ...this.activeBoard, name };
    }
    return next;
  };

  remove = async (id: string) => {
    await this.backend.remove(id);
    if (this.activeBoard?.id === id) {
      this.activeBoard = null;
    }
  };
}

export const boards = new Boards(idbBoardsBackend);
