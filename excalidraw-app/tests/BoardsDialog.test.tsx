import { Excalidraw } from "@excalidraw/excalidraw";
import { t } from "@excalidraw/excalidraw/i18n";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@excalidraw/excalidraw/tests/test-utils";

import { BoardsDialog } from "../components/BoardsDialog";
import { boards } from "../data/Boards";

import type { ComponentProps } from "react";

vi.mock("../data/Boards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/Boards")>();
  return {
    ...actual,
    boards: new actual.Boards(actual.createMemoryBoardsBackend()),
  };
});

const renderDialog = async (
  props: Partial<ComponentProps<typeof BoardsDialog>> = {},
) =>
  render(
    <Excalidraw>
      <BoardsDialog
        activeBoardId={null}
        onCloseRequest={vi.fn()}
        onOpenBoard={vi.fn()}
        onCreateBoard={vi.fn()}
        onRenameBoard={vi.fn()}
        onDeleteBoard={vi.fn()}
        {...props}
      />
    </Excalidraw>,
  );

describe("BoardsDialog", () => {
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
    const onCloseRequest = vi.fn();
    await renderDialog({ onOpenBoard, onCloseRequest });

    expect(await screen.findByText("Physics notes")).toBeTruthy();
    expect(screen.getByText("Shopping")).toBeTruthy();

    fireEvent.click(screen.getByText("Physics notes"));

    await waitFor(() => expect(onOpenBoard).toHaveBeenCalledWith(physics.id));
    expect(onCloseRequest).toHaveBeenCalled();
  });

  it("creates a new board and closes", async () => {
    const onCreateBoard = vi.fn();
    const onCloseRequest = vi.fn();
    await renderDialog({ onCreateBoard, onCloseRequest });

    fireEvent.click(screen.getByText(t("boards.new")));

    await waitFor(() => expect(onCreateBoard).toHaveBeenCalledTimes(1));
    expect(onCloseRequest).toHaveBeenCalled();
  });

  it("renders inside the container that carries the tablet styles", async () => {
    await boards.create({ name: "Anchored", elements: [] });
    await renderDialog();

    const dialogRoot = document.querySelector(".boards-dialog");

    expect(dialogRoot).toBeTruthy();
    expect(dialogRoot?.closest(".excalidraw")).not.toBeNull();
  });

  it("renames a board inline", async () => {
    const board = await boards.create({ name: "Old name", elements: [] });
    const onRenameBoard = vi.fn();
    await renderDialog({ onRenameBoard, activeBoardId: board.id });

    fireEvent.click(await screen.findByText(t("boards.rename")));

    const input = await screen.findByRole("textbox");
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.click(screen.getByText(t("buttons.done")));

    await waitFor(() =>
      expect(onRenameBoard).toHaveBeenCalledWith(board.id, "Renamed"),
    );
  });

  it("asks for confirmation before deleting a board", async () => {
    const board = await boards.create({ name: "Doomed", elements: [] });
    const onDeleteBoard = vi.fn();
    await renderDialog({ onDeleteBoard });

    fireEvent.click(await screen.findByText(t("boards.delete")));
    expect(screen.getByText(t("boards.deleteConfirm"))).toBeTruthy();

    fireEvent.click(screen.getByText(t("boards.delete")));

    await waitFor(() => expect(onDeleteBoard).toHaveBeenCalledWith(board.id));
  });
});
