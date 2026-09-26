import { Excalidraw } from "../index";

import { API } from "./helpers/api";

import { act, fireEvent, render } from "./test-utils";

const { h } = window;

const CLEAR_BUTTON = "toolbar-clear-canvas";

const clickClearButton = (container: HTMLElement) =>
  fireEvent.click(container.querySelector(`[data-testid="${CLEAR_BUTTON}"]`)!);

const getConfirmButton = () => {
  const buttons = document.querySelectorAll<HTMLElement>(
    ".confirm-dialog-buttons button",
  );
  return buttons[buttons.length - 1];
};

describe("toolbar clear canvas button", () => {
  it("renders a one-tap clear button in the toolbar", async () => {
    const { container } = await render(<Excalidraw />);
    expect(container.querySelector(`[data-testid="${CLEAR_BUTTON}"]`)).not.toBe(
      null,
    );
  });

  it("asks for confirmation rather than clearing immediately", async () => {
    const { container } = await render(<Excalidraw />);
    act(() => {
      h.elements = [API.createElement({ type: "rectangle" })];
    });

    clickClearButton(container);

    expect(document.querySelector(".confirm-dialog")).not.toBe(null);
    // still on the canvas while the dialog is open
    expect(h.elements.some((el) => !el.isDeleted)).toBe(true);
  });

  it("clears the scene once the confirmation is accepted", async () => {
    const { container } = await render(<Excalidraw />);
    act(() => {
      h.elements = [API.createElement({ type: "rectangle" })];
    });

    clickClearButton(container);
    const confirmButton = getConfirmButton();
    expect(confirmButton).not.toBe(undefined);
    fireEvent.click(confirmButton);

    expect(h.elements.some((el) => !el.isDeleted)).toBe(false);
  });

  it("hides the button when the host disables canvas clear", async () => {
    const { container } = await render(
      <Excalidraw UIOptions={{ canvasActions: { clearCanvas: false } }} />,
    );
    expect(container.querySelector(`[data-testid="${CLEAR_BUTTON}"]`)).toBe(
      null,
    );
  });
});
