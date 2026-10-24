// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolState } from "../../shared/tools.ts";
import { testInputs } from "../../shared/take-home/test-inputs.ts";

const { getState, putState } = vi.hoisted(() => ({
  getState: vi.fn<typeof import("../api.ts").getState>(),
  putState: vi.fn<typeof import("../api.ts").putState>(),
}));
vi.mock("../api.ts", () => ({ getState, putState }));

type State = ToolState<"take-home">;

const initial: State = { inputs: testInputs({ salary: 40_000 }), whatIf: null };

function withSalary(state: State, pounds: number): State {
  return {
    ...state,
    inputs: { ...state.inputs, salary: (pounds * 100) as State["inputs"]["salary"] },
  };
}

/**
 * Stands in for BroadcastChannel, which jsdom doesn't have: a message is delivered, a moment
 * later, to every other channel with the same name, as it would be to other tabs.
 */
class FakeBroadcastChannel {
  static open = new Set<FakeBroadcastChannel>();
  readonly name: string;
  readonly #listeners = new Set<(event: MessageEvent) => void>();

  constructor(name: string) {
    this.name = name;
    FakeBroadcastChannel.open.add(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (type !== "message") throw new Error(`unexpected ${type} listener`);
    this.#listeners.add(listener);
  }

  postMessage(data: unknown) {
    for (const other of FakeBroadcastChannel.open) {
      if (other === this || other.name !== this.name) continue;
      const message = new MessageEvent("message", { data: structuredClone(data) });
      queueMicrotask(() => {
        for (const listener of other.#listeners) listener(message);
      });
    }
  }
}

/**
 * A fresh copy of the app's modules, as another tab would have: its own stores and channel, but
 * the same localStorage.
 */
async function openTab() {
  vi.resetModules();
  const hook = await import("./useToolState.ts");
  const store = await import("./tool-store.ts");
  return { ...hook, ...store };
}
type Tab = Awaited<ReturnType<typeof openTab>>;

let tab: Tab;

/** A PUT that stays in flight until the test settles it. */
function pendingPut() {
  let settle: { resolve: () => void; reject: (error: Error) => void } | undefined;
  const promise = new Promise<void>((resolve, reject) => {
    settle = { resolve, reject };
  });
  putState.mockImplementationOnce(async (_tool, state) => {
    await promise;
    return { state, updatedAt: "2026-10-24T12:00:00.000Z" };
  });
  return {
    resolve: async () => {
      settle?.resolve();
      await act(async () => {
        await promise;
      });
    },
    reject: async (message: string) => {
      settle?.reject(new Error(message));
      await act(async () => {
        await promise.catch(() => undefined);
      });
    },
  };
}

/** A GET that stays in flight until the test settles it. */
function pendingGet() {
  let settle: { resolve: (state: State) => void; reject: (error: Error) => void } | undefined;
  const promise = new Promise<State>((resolve, reject) => {
    settle = { resolve, reject };
  });
  getState.mockImplementationOnce(async () => ({
    state: await promise,
    updatedAt: "2026-10-24T11:00:00.000Z",
  }));
  return {
    resolve: async (state: State) => {
      settle?.resolve(state);
      await act(async () => {
        await promise;
      });
    },
    reject: async (message: string) => {
      settle?.reject(new Error(message));
      await act(async () => {
        await promise.catch(() => undefined);
      });
    },
  };
}

function savedSalaries(): number[] {
  return putState.mock.calls.map(([, state]) => state.inputs.salary / 100);
}

function unsaved(from: Tab = tab) {
  return from.unsavedNotices("take-home", "Take-home pay");
}

function render(from: Tab = tab) {
  return renderHook(() => from.useToolState("take-home", () => initial));
}

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function mounted(from: Tab = tab) {
  const hook = render(from);
  await settle();
  return hook;
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
  FakeBroadcastChannel.open.clear();
  localStorage.clear();
  getState.mockReset().mockResolvedValue({ state: initial, updatedAt: "2026-10-24T11:00:00.000Z" });
  putState
    .mockReset()
    .mockImplementation((_tool, state) =>
      Promise.resolve({ state, updatedAt: "2026-10-24T12:00:00.000Z" }),
    );
  tab = await openTab();
});

afterEach(() => {
  cleanup();
  setVisibility("visible");
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("saving", () => {
  it("keeps one save in flight, then saves the latest edits after it", async () => {
    const { result } = await mounted();
    const first = pendingPut();
    act(() => {
      result.current.setState((s) => withSalary(s, 41_000));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(savedSalaries()).toEqual([41_000]);
    expect(result.current.status.kind).toBe("saving");

    const second = pendingPut();
    act(() => {
      result.current.setState((s) => withSalary(s, 42_000));
    });
    act(() => {
      result.current.setState((s) => withSalary(s, 43_000));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    // The second save waits for the first, so it can't land before it.
    expect(savedSalaries()).toEqual([41_000]);

    await first.resolve();
    expect(savedSalaries()).toEqual([41_000, 43_000]);
    expect(result.current.status.kind).toBe("saving");
    await second.resolve();
    expect(result.current.status.kind).toBe("saved");
    expect(unsaved()).toEqual([]);
  });

  it("doesn't stay on saving when an edit lands mid-save and its delay is still running", async () => {
    const { result } = await mounted();
    const first = pendingPut();
    act(() => {
      result.current.setState((s) => withSalary(s, 41_000));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    act(() => {
      result.current.setState((s) => withSalary(s, 42_000));
    });
    const second = pendingPut();
    await first.resolve();
    expect(savedSalaries()).toEqual([41_000]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(savedSalaries()).toEqual([41_000, 42_000]);
    await second.resolve();
    expect(result.current.status.kind).toBe("saved");
  });

  it("keeps edits when a save fails, and tries again", async () => {
    const { result } = await mounted();
    const failing = pendingPut();
    act(() => {
      result.current.setState((s) => withSalary(s, 41_000));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    await failing.reject("The laptop is asleep");
    expect(result.current.status).toEqual({ kind: "unsaved", message: "The laptop is asleep" });
    expect(unsaved()).toMatchObject([{ id: "take-home:unsaved", dismissible: false }]);

    const retry = pendingPut();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(savedSalaries()).toEqual([41_000, 41_000]);
    await retry.resolve();
    expect(result.current.status.kind).toBe("saved");
    expect(unsaved()).toEqual([]);
  });

  it("stores state in the shape the server would", async () => {
    const { result } = await mounted();
    act(() => {
      result.current.setState((s) => ({ ...s, inputs: { ...s.inputs, taxCode: " 1100l " } }));
    });
    expect(result.current.state?.inputs.taxCode).toBe("1100L");
  });
});

describe("loading", () => {
  it("ignores what the server had if an edit was saved while it was being fetched", async () => {
    const { result } = await mounted();
    const get = pendingGet();
    act(() => {
      setVisibility("visible");
    });
    act(() => {
      result.current.setState((s) => withSalary(s, 41_000));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(savedSalaries()).toEqual([41_000]);
    expect(result.current.status.kind).toBe("saved");

    await get.resolve(withSalary(initial, 39_000));
    expect(result.current.state?.inputs.salary).toBe(4_100_000);
    expect(result.current.status.kind).toBe("saved");
  });

  it("only uses the answer to the latest load", async () => {
    const first = pendingGet();
    const second = pendingGet();
    const { result } = render();
    act(() => {
      setVisibility("visible");
    });
    await second.resolve(withSalary(initial, 42_000));
    await first.resolve(withSalary(initial, 39_000));
    expect(result.current.state?.inputs.salary).toBe(4_200_000);
  });

  it("ignores a failed load that's out of date", async () => {
    const { result } = await mounted();
    const get = pendingGet();
    act(() => {
      setVisibility("visible");
    });
    act(() => {
      result.current.setState((s) => withSalary(s, 41_000));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    await get.reject("The laptop is asleep");
    expect(result.current.status.kind).toBe("saved");
  });

  it("ignores a load that finishes after the tool is left", async () => {
    const get = pendingGet();
    const { unmount } = render();
    unmount();
    await get.resolve(withSalary(initial, 39_000));
    expect(localStorage.length).toBe(0);
  });
});

describe("leaving", () => {
  it("saves edits straight away when the tool is left", async () => {
    const { result, unmount } = await mounted();
    const put = pendingPut();
    act(() => {
      result.current.setState((s) => withSalary(s, 41_000));
    });
    // While the tool is open, edits waiting for their delay aren't a problem.
    expect(unsaved()).toEqual([]);
    unmount();
    expect(savedSalaries()).toEqual([41_000]);
    // Until the save lands, the edits are only on this device.
    expect(unsaved()).toMatchObject([{ id: "take-home:unsaved", dismissible: false }]);
    await put.resolve();
    expect(unsaved()).toEqual([]);
  });

  it("keeps saves in order when the tool is left and opened again mid-save", async () => {
    const left = await mounted();
    const first = pendingPut();
    act(() => {
      left.result.current.setState((s) => withSalary(s, 41_000));
    });
    left.unmount();

    const { result } = await mounted();
    const second = pendingPut();
    act(() => {
      result.current.setState((s) => withSalary(s, 42_000));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(savedSalaries()).toEqual([41_000]);

    await first.resolve();
    // The first save landing doesn't mark the newer edits as saved.
    expect(savedSalaries()).toEqual([41_000, 42_000]);
    expect(result.current.status.kind).toBe("saving");
    await second.resolve();
    expect(result.current.status.kind).toBe("saved");
    expect(unsaved()).toEqual([]);
  });

  it("saves edits straight away when the app is hidden", async () => {
    const { result } = await mounted();
    pendingPut();
    act(() => {
      result.current.setState((s) => withSalary(s, 41_000));
    });
    act(() => {
      setVisibility("hidden");
    });
    expect(savedSalaries()).toEqual([41_000]);
  });
});

function cachedSalary(): number {
  const raw = localStorage.getItem("almanac:state:take-home");
  if (raw === null) throw new Error("nothing cached");
  return (JSON.parse(raw) as { state: State }).state.inputs.salary / 100;
}

describe("sharing in a tab", () => {
  it("gives everything using the tool one copy, saved once", async () => {
    const a = await mounted();
    const b = await mounted();
    act(() => {
      a.result.current.setState((s) => withSalary(s, 41_000));
    });
    expect(b.result.current.state?.inputs.salary).toBe(4_100_000);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(savedSalaries()).toEqual([41_000]);
    expect(a.result.current.status.kind).toBe("saved");
    expect(b.result.current.status.kind).toBe("saved");
  });

  it("doesn't let one opening replace another's edits that aren't saved yet", async () => {
    const a = await mounted();
    act(() => {
      a.result.current.setState((s) => withSalary(s, 41_000));
    });
    const loads = getState.mock.calls.length;
    const b = await mounted();
    // The edits are saved rather than replaced by what the server has.
    expect(getState.mock.calls.length).toBe(loads);
    expect(savedSalaries()).toEqual([41_000]);
    expect(a.result.current.state?.inputs.salary).toBe(4_100_000);
    expect(b.result.current.state?.inputs.salary).toBe(4_100_000);
    expect(cachedSalary()).toBe(41_000);
  });

  it("doesn't let a load started by one replace another's later edits", async () => {
    const a = await mounted();
    const get = pendingGet();
    const b = render();
    act(() => {
      a.result.current.setState((s) => withSalary(s, 41_000));
    });
    await get.resolve(withSalary(initial, 39_000));
    expect(b.result.current.state?.inputs.salary).toBe(4_100_000);
    expect(cachedSalary()).toBe(41_000);
  });

  it("keeps edits whose save failed when something else opens, and saves them", async () => {
    const a = await mounted();
    const failing = pendingPut();
    act(() => {
      a.result.current.setState((s) => withSalary(s, 41_000));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    await failing.reject("The laptop is asleep");
    expect(a.result.current.status).toEqual({ kind: "unsaved", message: "The laptop is asleep" });

    const retry = pendingPut();
    const b = await mounted();
    expect(b.result.current.state?.inputs.salary).toBe(4_100_000);
    expect(savedSalaries()).toEqual([41_000, 41_000]);
    expect(b.result.current.status.kind).toBe("saving");
    await retry.resolve();
    expect(a.result.current.status.kind).toBe("saved");
    expect(b.result.current.status.kind).toBe("saved");
    expect(unsaved()).toEqual([]);
  });

  it("saves edits rather than refreshing them away when the app comes back", async () => {
    const { result } = await mounted();
    const failing = pendingPut();
    act(() => {
      result.current.setState((s) => withSalary(s, 41_000));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    await failing.reject("The laptop is asleep");
    const loads = getState.mock.calls.length;
    act(() => {
      setVisibility("visible");
    });
    await settle();
    expect(getState.mock.calls.length).toBe(loads);
    expect(savedSalaries()).toEqual([41_000, 41_000]);
    expect(result.current.state?.inputs.salary).toBe(4_100_000);
  });

  it("saves edits straight away when one of them is left, and the other carries on", async () => {
    const a = await mounted();
    const b = await mounted();
    const put = pendingPut();
    act(() => {
      a.result.current.setState((s) => withSalary(s, 41_000));
    });
    a.unmount();
    expect(savedSalaries()).toEqual([41_000]);
    // The tool is still open, so there's nothing to warn about.
    expect(unsaved()).toEqual([]);
    expect(b.result.current.status.kind).toBe("saving");
    await put.resolve();
    expect(b.result.current.status.kind).toBe("saved");
    expect(b.result.current.state?.inputs.salary).toBe(4_100_000);
  });
});

describe("sharing across tabs", () => {
  it("shows edits made in another tab", async () => {
    const a = await mounted();
    const other = await openTab();
    const b = await mounted(other);
    act(() => {
      a.result.current.setState((s) => withSalary(s, 41_000));
    });
    await settle();
    expect(b.result.current.state?.inputs.salary).toBe(4_100_000);
  });

  it("doesn't let a load in another tab replace edits that aren't saved yet", async () => {
    const a = await mounted();
    const other = await openTab();
    const get = pendingGet();
    const b = render(other);
    act(() => {
      a.result.current.setState((s) => withSalary(s, 41_000));
    });
    await get.resolve(withSalary(initial, 39_000));
    expect(b.result.current.state?.inputs.salary).toBe(4_100_000);
    expect(a.result.current.state?.inputs.salary).toBe(4_100_000);
    expect(cachedSalary()).toBe(41_000);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(savedSalaries()).toEqual([41_000]);
  });

  it("doesn't let a load in another tab undo edits saved while it was in flight", async () => {
    const a = await mounted();
    const other = await openTab();
    const get = pendingGet();
    const b = render(other);
    act(() => {
      a.result.current.setState((s) => withSalary(s, 41_000));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(a.result.current.status.kind).toBe("saved");
    await get.resolve(withSalary(initial, 40_000));
    expect(b.result.current.state?.inputs.salary).toBe(4_100_000);
    expect(cachedSalary()).toBe(41_000);
  });

  it("saves another tab's edits that aren't saved yet, rather than loading over them", async () => {
    const a = await mounted();
    act(() => {
      a.result.current.setState((s) => withSalary(s, 41_000));
    });
    const loads = getState.mock.calls.length;
    const other = await openTab();
    const b = await mounted(other);
    expect(getState.mock.calls.length).toBe(loads);
    expect(b.result.current.state?.inputs.salary).toBe(4_100_000);
    expect(savedSalaries()).toEqual([41_000]);
    // The first tab sees they're saved, so doesn't save them again.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(savedSalaries()).toEqual([41_000]);
    expect(a.result.current.status.kind).toBe("saved");
  });

  it("raises the unsaved notice in a tab without the tool open", async () => {
    const a = await mounted();
    const failing = pendingPut();
    act(() => {
      a.result.current.setState((s) => withSalary(s, 41_000));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    await failing.reject("The laptop is asleep");
    const other = await openTab();
    expect(unsaved(other)).toMatchObject([{ id: "take-home:unsaved", dismissible: false }]);
  });
});

describe("the copy on this device", () => {
  it("reads a copy cached before tabs shared their edits", async () => {
    localStorage.setItem(
      "almanac:state:take-home",
      JSON.stringify({ state: withSalary(initial, 41_000), dirty: true, error: null }),
    );
    tab = await openTab();
    const { result } = await mounted();
    expect(result.current.state?.inputs.salary).toBe(4_100_000);
    expect(savedSalaries()).toEqual([41_000]);
  });

  it("reads a copy cached in the shape from before what-if scenarios", async () => {
    localStorage.setItem(
      "almanac:state:take-home",
      JSON.stringify({ state: withSalary(initial, 41_000).inputs, dirty: true, error: null }),
    );
    tab = await openTab();
    const { result } = await mounted();
    expect(result.current.state).toEqual(withSalary(initial, 41_000));
    expect(putState.mock.calls[0]?.[1]).toEqual(withSalary(initial, 41_000));
  });
});
