import { getFormFactor } from "./editorInterface";

// A 12.7" android tablet (lenovo idea tab pro, 2944x1840 @ dpr 2) reports
// ~1472x920 css px, whose long side is past MQ_MAX_TABLET (1180).
const WIDE = 1472;
const SHORT = 920;

describe("getFormFactor", () => {
  it("keeps phone classification for touch devices below the phone breakpoint", () => {
    expect(getFormFactor(500, 900, true)).toBe("phone");
  });

  it("keeps the width-based tablet classification for ipad-sized viewports", () => {
    expect(getFormFactor(1180, 820, false)).toBe("tablet");
    expect(getFormFactor(1180, 820, true)).toBe("tablet");
  });

  it("classifies a wide touch-primary device as tablet, not desktop", () => {
    expect(getFormFactor(WIDE, SHORT, true)).toBe("tablet");
  });

  it("is orientation-independent for wide touch-primary devices", () => {
    expect(getFormFactor(SHORT, WIDE, true)).toBe("tablet");
  });

  it("still reports desktop for a wide device that is not touch-primary", () => {
    expect(getFormFactor(WIDE, SHORT, false)).toBe("desktop");
  });
});
