import { BOARDS_SIDEBAR_TAB, DEFAULT_SIDEBAR } from "@excalidraw/common";
import { Excalidraw } from "@excalidraw/excalidraw";
import { t } from "@excalidraw/excalidraw/i18n";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@excalidraw/excalidraw/tests/test-utils";

import { AppSidebar } from "../components/AppSidebar";
import { boards } from "../data/Boards";

import type { ComponentProps } from "react";

vi.mock("../data/Boards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/Boards")>();
  return {
    ...actual,
    boards: new actual.Boards(actual.createMemoryBoardsBackend()),
  };
});

const renderSidebar = async (
  props: Partial<ComponentProps<typeof AppSidebar>> = {},
) =>
  render(
    <Excalidraw
      initialData={{
        appState: {
          openSidebar: { name: DEFAULT_SIDEBAR.name, tab: BOARDS_SIDEBAR_TAB },
        },
      }}
    >
      <AppSidebar
        activeBoardId={null}
        onOpenBoard={vi.fn()}
        onCreateBoard={vi.fn()}
        onRenameBoard={vi.fn()}
        onDeleteBoard={vi.fn()}
        {...props}
      />
    </Excalidraw>,
  );

describe("AppSidebar boards", () => {
  beforeEach(async () => {
    for (const summary of await boards.list()) {
      await boards.remove(summary.id);
    }
  });

  it("lists boards and opens the one that was clicked", async () => {
    const physics = await boards.create({
      name: "Physics notes",
      elements: [],
    });
    await boards.create({ name: "Shopping", elements: [] });

    const onOpenBoard = vi.fn();
    await renderSidebar({ onOpenBoard });

    expect(await screen.findByText("Physics notes")).toBeTruthy();
    expect(screen.getByText("Shopping")).toBeTruthy();

    fireEvent.click(screen.getByText("Physics notes"));

    await waitFor(() => expect(onOpenBoard).toHaveBeenCalledWith(physics.id));
  });

  it("creates a new board", async () => {
    const onCreateBoard = vi.fn();
    await renderSidebar({ onCreateBoard });

    fireEvent.click(screen.getByText(t("boards.new")));

    await waitFor(() => expect(onCreateBoard).toHaveBeenCalledTimes(1));
  });

  it("renders inside the container that carries the tablet styles", async () => {
    await boards.create({ name: "Anchored", elements: [] });
    await renderSidebar();

    const listRoot = document.querySelector(".app-sidebar-boards");

    expect(listRoot).toBeTruthy();
    expect(listRoot?.closest(".excalidraw")).not.toBeNull();
  });

  it("renames a board inline", async () => {
    const board = await boards.create({ name: "Old name", elements: [] });
    const onRenameBoard = vi.fn();
    await renderSidebar({ onRenameBoard, activeBoardId: board.id });

    fireEvent.click(await screen.findByText(t("boards.rename")));

    const input = await screen.findByRole("textbox", {
      name: t("boards.rename"),
    });
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.click(screen.getByText(t("buttons.done")));

    await waitFor(() =>
      expect(onRenameBoard).toHaveBeenCalledWith(board.id, "Renamed"),
    );
  });

  it("asks for confirmation before deleting a board", async () => {
    const board = await boards.create({ name: "Doomed", elements: [] });
    const onDeleteBoard = vi.fn();
    await renderSidebar({ onDeleteBoard });

    fireEvent.click(await screen.findByText(t("boards.delete")));
    expect(screen.getByText(t("boards.deleteConfirm"))).toBeTruthy();

    fireEvent.click(screen.getByText(t("boards.delete")));

    await waitFor(() => expect(onDeleteBoard).toHaveBeenCalledWith(board.id));
  });

  it("does not label the active board, relying on the row border", async () => {
    const board = await boards.create({ name: "Current one", elements: [] });
    await renderSidebar({ activeBoardId: board.id });

    expect(await screen.findByText("Current one")).toBeTruthy();
    expect(screen.queryByText(t("boards.current"))).toBeNull();
    expect(document.querySelector(".boards-dialog__badge")).toBeNull();
  });

  it("notifies subscribers when the active board changes", async () => {
    const listener = vi.fn();
    const unsubscribe = boards.subscribe(listener);

    boards.setActive(null);
    expect(listener).toHaveBeenCalled();

    listener.mockClear();
    const board = await boards.create({ name: "Subscribed", elements: [] });
    boards.setActive({
      id: board.id,
      name: board.name,
      createdAt: board.createdAt,
    });
    expect(listener).toHaveBeenCalled();
    expect(boards.getActiveIdSnapshot()).toBe(board.id);

    unsubscribe();
    listener.mockClear();
    boards.setActive(null);
    expect(listener).not.toHaveBeenCalled();
    expect(boards.getActiveIdSnapshot()).toBeNull();
  });

  it("filters boards by name as you type", async () => {
    await boards.create({ name: "Physics notes", elements: [] });
    await boards.create({ name: "Shopping", elements: [] });
    await renderSidebar();

    expect(await screen.findByText("Physics notes")).toBeTruthy();
    expect(screen.getByText("Shopping")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(t("boards.search")), {
      target: { value: "phys" },
    });

    expect(screen.getByText("Physics notes")).toBeTruthy();
    expect(screen.queryByText("Shopping")).toBeNull();
  });

  it("shows an empty state when no board matches the search", async () => {
    await boards.create({ name: "Physics notes", elements: [] });
    await renderSidebar();

    fireEvent.change(screen.getByPlaceholderText(t("boards.search")), {
      target: { value: "zzz" },
    });

    expect(await screen.findByText(t("boards.noResults"))).toBeTruthy();
    expect(screen.queryByText("Physics notes")).toBeNull();
  });
});
