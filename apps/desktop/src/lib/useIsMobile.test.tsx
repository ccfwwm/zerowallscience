import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DESKTOP_WIDTH, PHONE_WIDTH, setViewportWidth } from "@/test/viewport";
import { useIsMobile } from "./useIsMobile";

/** Stands in for every layout that branches on the viewport (sidebar drawer,
 *  single-pane live surface, no split controls). */
function Layout() {
  return <span>{useIsMobile() ? "phone layout" : "desktop layout"}</span>;
}

describe("phone-width detection", () => {
  it("uses the desktop layout in a normal window", () => {
    render(<Layout />);
    expect(screen.getByText("desktop layout")).toBeInTheDocument();
  });

  it("uses the phone layout on a 390px phone screen", () => {
    setViewportWidth(PHONE_WIDTH);
    render(<Layout />);
    expect(screen.getByText("phone layout")).toBeInTheDocument();
  });

  it("switches layout the moment the window is resized or the phone rotated", () => {
    render(<Layout />);
    expect(screen.getByText("desktop layout")).toBeInTheDocument();

    act(() => setViewportWidth(PHONE_WIDTH));
    expect(screen.getByText("phone layout")).toBeInTheDocument();

    act(() => setViewportWidth(DESKTOP_WIDTH));
    expect(screen.getByText("desktop layout")).toBeInTheDocument();
  });

  it("keeps a 768px viewport on the phone layout and 769px on the desktop one", () => {
    // The breakpoint is inclusive — a tablet portrait at exactly 768 still gets
    // the drawer sidebar rather than a squeezed two-column shell.
    setViewportWidth(768);
    const { unmount } = render(<Layout />);
    expect(screen.getByText("phone layout")).toBeInTheDocument();
    unmount();

    setViewportWidth(769);
    render(<Layout />);
    expect(screen.getByText("desktop layout")).toBeInTheDocument();
  });
});
