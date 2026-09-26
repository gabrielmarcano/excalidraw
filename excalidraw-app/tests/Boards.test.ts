import type { ExcalidrawElement } from "@excalidraw/element/types";

import { Boards, createMemoryBoardsBackend } from "../data/Boards";

const element = (id: string, isDeleted = false) =>
  ({ id, isDeleted } as unknown as ExcalidrawElement);

describe("Boards", () => {
  let boards: Boards;

  beforeEach(() => {
    localStorage.clear();
    boards = new Boards(createMemoryBoardsBackend());
  });

  it("creates a board and lists it with a summary", async () => {
    const record = await boards.create({
      name: "Physics notes",
      elements: [element("a"), element("b", true)],
    });

    const summaries = await boards.list();

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      id: record.id,
      name: "Physics notes",
      elementCount: 1,
    });
    expect(record.elements.map((el) => el.id)).toEqual(["a"]);
  });

  it("sorts boards by most recently updated", async () => {
    const first = await boards.create({ name: "First", elements: [] });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await boards.create({ name: "Second", elements: [] });

    const summaries = await boards.list();

    expect(summaries.map((summary) => summary.id)).toEqual([
      second.id,
      first.id,
    ]);
  });

  it("renames a board and keeps the active board in sync", async () => {
    const board = await boards.create({ name: "Old", elements: [] });
    boards.setActive({
      id: board.id,
      name: board.name,
      createdAt: board.createdAt,
    });

    const renamed = await boards.rename(board.id, "New");

    expect(renamed?.name).toBe("New");
    expect((await boards.get(board.id))?.name).toBe("New");
    expect(boards.getActive()?.name).toBe("New");
  });

  it("removes a board and clears it from active when it is open", async () => {
    const board = await boards.create({ name: "Doomed", elements: [] });
    boards.setActive({
      id: board.id,
      name: board.name,
      createdAt: board.createdAt,
    });

    await boards.remove(board.id);

    expect(await boards.get(board.id)).toBeNull();
    expect(boards.getActive()).toBeNull();
    expect(await boards.list()).toHaveLength(0);
  });

  it("saves snapshots only for the active board", async () => {
    await boards.saveSnapshot([element("orphan")]);
    expect(await boards.list()).toHaveLength(0);

    const board = await boards.create({
      name: "Active",
      elements: [element("old")],
    });
    boards.setActive({
      id: board.id,
      name: board.name,
      createdAt: board.createdAt,
    });

    await boards.saveSnapshot([
      element("one"),
      element("two"),
      element("x", true),
    ]);

    const stored = await boards.get(board.id);
    expect(stored?.elements.map((el) => el.id)).toEqual(["one", "two"]);
    expect(stored?.name).toBe("Active");
    expect(stored?.createdAt).toBe(board.createdAt);
    expect(stored?.updatedAt).toBeGreaterThanOrEqual(board.updatedAt);
  });

  it("persists the active board id for the next session", async () => {
    expect(boards.getStoredActiveId()).toBeNull();

    const board = await boards.create({ name: "Mine", elements: [] });
    boards.setActive({
      id: board.id,
      name: board.name,
      createdAt: board.createdAt,
    });
    boards.persistActiveId();

    expect(boards.getStoredActiveId()).toBe(board.id);
    expect(new Boards(createMemoryBoardsBackend()).getStoredActiveId()).toBe(
      board.id,
    );
  });

  it("keeps the stored active id when no board is active", async () => {
    const board = await boards.create({ name: "Mine", elements: [] });
    boards.setActive({
      id: board.id,
      name: board.name,
      createdAt: board.createdAt,
    });
    boards.persistActiveId();

    boards.setActive(null);
    boards.persistActiveId();

    expect(boards.getStoredActiveId()).toBe(board.id);
  });

  it("collects image file ids referenced by any board", async () => {
    const image = (id: string, fileId: string) =>
      ({
        id,
        type: "image",
        fileId,
        isDeleted: false,
      } as unknown as ExcalidrawElement);

    await boards.create({
      name: "First",
      elements: [image("a", "file-1"), element("b")],
    });
    await boards.create({
      name: "Second",
      elements: [image("c", "file-2"), image("d", "file-1")],
    });

    expect(await boards.getReferencedFileIds()).toEqual(["file-1", "file-2"]);
  });
});
