import { useCallback, useEffect, useState } from "react";

import { useI18n } from "@excalidraw/excalidraw/i18n";

import { boards } from "../data/Boards";
import { cloudSync } from "../data/CloudSync";

import "./BoardsList.scss";

import type { BoardSummary } from "../data/Boards";

type BoardsListProps = {
  activeBoardId: string | null;
  onOpenBoard(id: string): void | Promise<void>;
  onCreateBoard(name?: string): void | Promise<void>;
  onRenameBoard(id: string, name: string): void | Promise<void>;
  onDeleteBoard(id: string): void | Promise<void>;
  closeAfterAction?: boolean;
  onAction?: () => void;
};

const formatUpdatedAt = (timestamp: number, langCode: string) => {
  try {
    return new Intl.DateTimeFormat(langCode, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(timestamp);
  } catch (error) {
    return new Date(timestamp).toISOString().slice(0, 16).replace("T", " ");
  }
};

export const BoardsList = (props: BoardsListProps) => {
  const { t, langCode } = useI18n();
  const [summaries, setSummaries] = useState<BoardSummary[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const visibleSummaries = (summaries ?? []).filter((summary) =>
    summary.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const refresh = useCallback(async () => {
    try {
      setSummaries(await boards.list());
    } catch (error) {
      console.error(error);
      setErrorMessage(t("boards.errors.loadFailed"));
    }
  }, [t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    return cloudSync.subscribe((event) => {
      if (event.type === "boards:changed") {
        refresh();
      }
    });
  }, [refresh]);

  const run = async (task: () => void | Promise<void>, close = false) => {
    if (busy) {
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      await task();
      if (close && props.closeAfterAction) {
        props.onAction?.();
      } else {
        await refresh();
      }
    } catch (error) {
      console.error(error);
      setErrorMessage(t("boards.errors.generic"));
    } finally {
      setBusy(false);
    }
  };

  const startRename = (summary: BoardSummary) => {
    setDeletingId(null);
    setRenamingId(summary.id);
    setRenameValue(summary.name);
  };

  const startDelete = (summary: BoardSummary) => {
    setRenamingId(null);
    setDeletingId(summary.id);
  };

  const cancelRowActions = () => {
    setRenamingId(null);
    setDeletingId(null);
  };

  const confirmRename = (id: string) => {
    return run(async () => {
      await props.onRenameBoard(id, renameValue);
      cancelRowActions();
    });
  };

  const confirmDelete = (id: string) => {
    return run(async () => {
      await props.onDeleteBoard(id);
      cancelRowActions();
    });
  };

  const elementLabel = (count: number) =>
    count === 1
      ? t("boards.elementSingular", { count })
      : t("boards.elementPlural", { count });

  return (
    <>
      <div className="boards-dialog__toolbar">
        <button
          type="button"
          className="boards-dialog__button boards-dialog__button--primary"
          disabled={busy}
          onClick={() => run(() => props.onCreateBoard(), true)}
        >
          {t("boards.new")}
        </button>
        <input
          className="boards-dialog__input boards-dialog__search"
          value={query}
          placeholder={t("boards.search")}
          aria-label={t("boards.search")}
          onChange={(event) => setQuery(event.target.value)}
        />
        {errorMessage && (
          <span className="boards-dialog__error" role="alert">
            {errorMessage}
          </span>
        )}
      </div>
      {summaries === null ? (
        <div className="boards-dialog__empty">{t("boards.loading")}</div>
      ) : summaries.length === 0 ? (
        <div className="boards-dialog__empty">{t("boards.empty")}</div>
      ) : visibleSummaries.length === 0 ? (
        <div className="boards-dialog__empty">{t("boards.noResults")}</div>
      ) : (
        <div className="boards-dialog__list">
          {visibleSummaries.map((summary) => {
            const isActive = summary.id === props.activeBoardId;
            const isRenaming = renamingId === summary.id;
            const isDeleting = deletingId === summary.id;

            if (isRenaming) {
              return (
                <div
                  key={summary.id}
                  className="boards-dialog__row boards-dialog__row--editing"
                >
                  <input
                    className="boards-dialog__input"
                    value={renameValue}
                    autoFocus
                    aria-label={t("boards.rename")}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        confirmRename(summary.id);
                      } else if (event.key === "Escape") {
                        cancelRowActions();
                      }
                    }}
                  />
                  <div className="boards-dialog__actions">
                    <button
                      type="button"
                      className="boards-dialog__button boards-dialog__button--primary"
                      disabled={busy}
                      onClick={() => confirmRename(summary.id)}
                    >
                      {t("buttons.done")}
                    </button>
                    <button
                      type="button"
                      className="boards-dialog__button"
                      disabled={busy}
                      onClick={cancelRowActions}
                    >
                      {t("buttons.cancel")}
                    </button>
                  </div>
                </div>
              );
            }

            if (isDeleting) {
              return (
                <div
                  key={summary.id}
                  className="boards-dialog__row boards-dialog__row--editing"
                >
                  <span className="boards-dialog__confirm">
                    {t("boards.deleteConfirm")}
                  </span>
                  <div className="boards-dialog__actions">
                    <button
                      type="button"
                      className="boards-dialog__button boards-dialog__button--danger"
                      disabled={busy}
                      onClick={() => confirmDelete(summary.id)}
                    >
                      {t("boards.delete")}
                    </button>
                    <button
                      type="button"
                      className="boards-dialog__button"
                      disabled={busy}
                      onClick={cancelRowActions}
                    >
                      {t("buttons.cancel")}
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={summary.id}
                className={`boards-dialog__row${
                  isActive ? " boards-dialog__row--active" : ""
                }`}
              >
                <button
                  type="button"
                  className="boards-dialog__open"
                  disabled={busy || isActive}
                  onClick={() => run(() => props.onOpenBoard(summary.id), true)}
                >
                  <span className="boards-dialog__name">{summary.name}</span>
                  <span className="boards-dialog__meta">
                    <span>{elementLabel(summary.elementCount)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatUpdatedAt(summary.updatedAt, langCode)}</span>
                  </span>
                </button>
                <div className="boards-dialog__actions">
                  <button
                    type="button"
                    className="boards-dialog__button"
                    disabled={busy}
                    onClick={() => startRename(summary)}
                  >
                    {t("boards.rename")}
                  </button>
                  <button
                    type="button"
                    className="boards-dialog__button"
                    disabled={busy}
                    onClick={() => startDelete(summary)}
                  >
                    {t("boards.delete")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};
