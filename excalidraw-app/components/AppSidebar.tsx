import { BOARDS_SIDEBAR_TAB } from "@excalidraw/common";
import { DefaultSidebar, Sidebar } from "@excalidraw/excalidraw";
import { gridIcon } from "@excalidraw/excalidraw/components/icons";

import { BoardsList } from "./BoardsList";

import "./AppSidebar.scss";

type AppSidebarProps = {
  activeBoardId: string | null;
  onOpenBoard(id: string): void | Promise<void>;
  onCreateBoard(name?: string): void | Promise<void>;
  onRenameBoard(id: string, name: string): void | Promise<void>;
  onDeleteBoard(id: string): void | Promise<void>;
};

export const AppSidebar = (props: AppSidebarProps) => {
  return (
    <DefaultSidebar>
      <DefaultSidebar.TabTriggers>
        <Sidebar.TabTrigger tab={BOARDS_SIDEBAR_TAB}>
          {gridIcon}
        </Sidebar.TabTrigger>
      </DefaultSidebar.TabTriggers>
      <Sidebar.Tab tab={BOARDS_SIDEBAR_TAB}>
        <div className="app-sidebar-boards">
          <BoardsList
            activeBoardId={props.activeBoardId}
            onOpenBoard={props.onOpenBoard}
            onCreateBoard={props.onCreateBoard}
            onRenameBoard={props.onRenameBoard}
            onDeleteBoard={props.onDeleteBoard}
          />
        </div>
      </Sidebar.Tab>
    </DefaultSidebar>
  );
};
