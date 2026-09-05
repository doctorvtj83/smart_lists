// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { ServiceWorkerRegistrar } from "./ServiceWorkerRegistrar";

/** Installs a fake navigator.serviceWorker and hands back its register spy. */
function stubServiceWorker() {
  const register = vi.fn().mockResolvedValue({});
  Object.defineProperty(navigator, "serviceWorker", {
    value: { register },
    configurable: true,
  });
  return register;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ServiceWorkerRegistrar", () => {
  it("registers /sw.js in production", () => {
    const register = stubServiceWorker();
    vi.stubEnv("NODE_ENV", "production");

    render(<ServiceWorkerRegistrar />);

    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("does nothing in development", () => {
    const register = stubServiceWorker();
    vi.stubEnv("NODE_ENV", "development");

    render(<ServiceWorkerRegistrar />);

    expect(register).not.toHaveBeenCalled();
  });

  it("renders nothing at all", () => {
    stubServiceWorker();
    const { container } = render(<ServiceWorkerRegistrar />);
    expect(container.innerHTML).toBe("");
  });
});
