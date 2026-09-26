import { queryByText } from "@testing-library/react";

import { Excalidraw } from "../index";

import { fireEvent, GlobalTestState, render } from "./test-utils";

const { h } = window;

describe("zen mode hides the top toolbar", () => {
  afterEach(() => {
    const menu = document.querySelector(".dropdown-menu");
    if (menu) {
      menu.remove();
    }
  });

  const getShapesSection = (container: HTMLElement) =>
    container.querySelector(".shapes-section");

  it("marks the shapes section as zen-hidden only while zen mode is on", async () => {
    const { container } = await render(<Excalidraw />);

    const section = getShapesSection(container);
    expect(section).not.toBe(null);
    // participates in the zen fade regardless of state
    expect(section).toHaveClass("zen-mode-transition");
    expect(section).not.toHaveClass("transition-top");

    await fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      button: 2,
      clientX: 1,
      clientY: 1,
    });
    const contextMenu = document.querySelector(".context-menu")!;
    fireEvent.click(queryByText(contextMenu as HTMLElement, "Zen mode")!);

    expect(h.state.zenModeEnabled).toBe(true);
    expect(getShapesSection(container)).toHaveClass("transition-top");
  });

  it("hides the toolbar wrappers too so the canvas keeps pointer events", async () => {
    const { container } = await render(<Excalidraw />);

    await fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      button: 2,
      clientX: 1,
      clientY: 1,
    });
    const contextMenu = document.querySelector(".context-menu")!;
    fireEvent.click(queryByText(contextMenu as HTMLElement, "Zen mode")!);

    // the inner toolbar container no longer carries the transition itself —
    // the whole shapes section hides, so no invisible wrapper keeps the
    // strip reserved for pointer events
    expect(container.querySelector(".App-toolbar-container")).not.toHaveClass(
      "transition-top",
    );
    expect(getShapesSection(container)).toHaveClass("transition-top");
  });

  it("keeps the zen toggle available so the toolbar can be restored", async () => {
    await render(<Excalidraw zenModeEnabled={true} />);

    expect(h.state.zenModeEnabled).toBe(true);
    // the toolbar is hidden...
    expect(document.querySelector(".shapes-section")).toHaveClass(
      "transition-top",
    );
    // ...but an escape hatch is required, otherwise the toolbar is unreachable
    const toggle = document.querySelector('[data-testid="zen-mode-toggle"]')!;
    expect(toggle).not.toBe(null);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });

  it("toggles zen mode off when the floating toggle is clicked", async () => {
    const { container } = await render(<Excalidraw />);

    await fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      button: 2,
      clientX: 1,
      clientY: 1,
    });
    const contextMenu = document.querySelector(".context-menu")!;
    fireEvent.click(queryByText(contextMenu as HTMLElement, "Zen mode")!);
    expect(h.state.zenModeEnabled).toBe(true);

    fireEvent.click(
      container.querySelector('[data-testid="zen-mode-toggle"]')!,
    );
    expect(h.state.zenModeEnabled).toBe(false);
    expect(getShapesSection(container)).not.toHaveClass("transition-top");
  });
});
