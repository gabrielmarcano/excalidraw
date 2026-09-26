import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { useI18n } from "@excalidraw/excalidraw/i18n";

import { BoardsList } from "./BoardsList";

import "./BoardsDialog.scss";

type BoardsDialogProps = {
  activeBoardId: string | null;
  onCloseRequest(): void;
  onOpenBoard(id: string): void | Promise<void>;
  onCreateBoard(name?: string): void | Promise<void>;
  onRenameBoard(id: string, name: string): void | Promise<void>;
  onDeleteBoard(id: string): void | Promise<void>;
};

export const BoardsDialog = (props: BoardsDialogProps) => {
  const { t } = useI18n();

  return (
    <Dialog
      title={t("boards.title")}
      size="small"
      onCloseRequest={props.onCloseRequest}
      closeOnClickOutside
      className="boards-dialog"
    >
      <BoardsList
        activeBoardId={props.activeBoardId}
        onOpenBoard={props.onOpenBoard}
        onCreateBoard={props.onCreateBoard}
        onRenameBoard={props.onRenameBoard}
        onDeleteBoard={props.onDeleteBoard}
        closeAfterAction
        onAction={props.onCloseRequest}
      />
      <div className="boards-dialog__footer">
        <button
          type="button"
          className="boards-dialog__button"
          onClick={props.onCloseRequest}
        >
          {t("buttons.close")}
        </button>
      </div>
    </Dialog>
  );
};
