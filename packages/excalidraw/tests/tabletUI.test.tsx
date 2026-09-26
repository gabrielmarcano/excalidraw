import { Excalidraw } from "../index";

import { fireEvent, render, waitFor } from "./test-utils";

const { h } = window;

describe("tablet form factor", () => {
  it("marks the container as tablet when the form factor resolves to tablet", async () => {
    const { container } = await render(
      <Excalidraw UIOptions={{ getFormFactor: () => "tablet" }} />,
    );

    fireEvent.resize(window);
    await waitFor(() =>
      expect(h.app.editorInterface.formFactor).toBe("tablet"),
    );

    expect(container.querySelector(".excalidraw")).toHaveClass(
      "excalidraw--tablet",
    );
  });

  it("does not mark the container as tablet when the host forces desktop", async () => {
    const { container } = await render(
      <Excalidraw UIOptions={{ getFormFactor: () => "desktop" }} />,
    );

    fireEvent.resize(window);
    await waitFor(() =>
      expect(h.app.editorInterface.formFactor).toBe("desktop"),
    );

    expect(container.querySelector(".excalidraw")).not.toHaveClass(
      "excalidraw--tablet",
    );
  });

  it("keeps the tablet marker off phone viewports", async () => {
    const { container } = await render(
      <Excalidraw UIOptions={{ getFormFactor: () => "phone" }} />,
    );

    fireEvent.resize(window);
    await waitFor(() => expect(h.app.editorInterface.formFactor).toBe("phone"));

    const root = container.querySelector(".excalidraw");
    expect(root).toHaveClass("excalidraw--mobile");
    expect(root).not.toHaveClass("excalidraw--tablet");
  });
});
