import { vi } from "vitest";

export interface Captured {
  messages: Record<string, unknown>[];
  ofType(type: string): Record<string, unknown>[];
  last(type: string): Record<string, unknown> | undefined;
  clear(): void;
  dispose(): void;
}

/** Capture every message the bridge posts to window. */
export function captureBridgeMessages(): Captured {
  const messages: Record<string, unknown>[] = [];
  const handler = (event: MessageEvent) => {
    const d = event.data;
    if (d && d.source === "zustand-devtools-bridge") messages.push(d);
  };
  window.addEventListener("message", handler);
  return {
    messages,
    ofType: (type) => messages.filter((m) => m.type === type),
    last: (type) => [...messages].reverse().find((m) => m.type === type),
    clear: () => {
      messages.length = 0;
    },
    dispose: () => window.removeEventListener("message", handler),
  };
}

/** Send a control message the way the extension's content script would.
 * jsdom's window.postMessage delivers events with source: null, which the
 * bridge's (deliberate, production-correct) same-window check rejects — so
 * tests dispatch a fully-formed MessageEvent with source: window instead. */
export function sendControl(message: Record<string, unknown>): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { source: "zustand-devtools-control", ...message },
      source: window,
      origin: window.location.origin,
    })
  );
}

/** jsdom delivers postMessage asynchronously — flush the task queue. */
export async function flush(ms = 0): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export { vi };
