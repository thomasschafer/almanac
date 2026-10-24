// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolState } from "../../shared/tools.ts";
import { testInputs } from "../../shared/take-home/test-inputs.ts";
import { getState, putState } from "../api.ts";
import { unsavedNotices, useToolState } from "./useToolState.ts";

vi.mock("../api.ts", () => ({ getState: vi.fn(), putState: vi.fn() }));

type State = ToolState<"take-home">;

const initial: State = { inputs: testInputs({ salary: 40_000 }), whatIf: null };

function withSalary(state: State, pounds: number): State {
  return {
    ...state,
    inputs: { ...state.inputs, salary: (pounds * 100) as State["inputs"]["salary"] },
  };
}

/** A PUT that stays in flight until the test settles it. */
function pendingPut() {
  let settle: { resolve: () => void; reject: (error: Error) => void } | undefined;
  const promise = new Promise<void>((resolve, reject) => {
    settle = { resolve, reject };
  });
  vi.mocked(putState).mockImplementationOnce(async (_tool, state) => {
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

function savedSalaries(): number[] {
  return vi.mocked(putState).mock.calls.map(([, state]) => state.inputs.salary / 100);
}

async function mounted() {
  const hook = renderHook(() => useToolState("take-home", () => initial));
  await act(async () => {
    await Promise.resolve();
  });
  return hook;
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  vi.mocked(getState).mockResolvedValue({ state: initial, updatedAt: "2026-10-24T11:00:00.000Z" });
  vi.mocked(putState)
    .mockReset()
    .mockImplementation((_tool, state) =>
      Promise.resolve({ state, updatedAt: "2026-10-24T12:00:00.000Z" }),
    );
});

afterEach(() => {
  cleanup();
  setVisibility("visible");
  vi.useRealTimers();
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
    expect(unsavedNotices("take-home", "Take-home pay")).toEqual([]);
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
    expect(unsavedNotices("take-home", "Take-home pay")).toMatchObject([
      { id: "take-home:unsaved", dismissible: false },
    ]);

    const retry = pendingPut();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(savedSalaries()).toEqual([41_000, 41_000]);
    await retry.resolve();
    expect(result.current.status.kind).toBe("saved");
    expect(unsavedNotices("take-home", "Take-home pay")).toEqual([]);
  });

  it("stores state in the shape the server would", async () => {
    const { result } = await mounted();
    act(() => {
      result.current.setState((s) => ({ ...s, inputs: { ...s.inputs, taxCode: " 1100l " } }));
    });
    expect(result.current.state?.inputs.taxCode).toBe("1100L");
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
    expect(unsavedNotices("take-home", "Take-home pay")).toEqual([]);
    unmount();
    expect(savedSalaries()).toEqual([41_000]);
    // Until the save lands, the edits are only on this device.
    expect(unsavedNotices("take-home", "Take-home pay")).toMatchObject([
      { id: "take-home:unsaved", dismissible: false },
    ]);
    await put.resolve();
    expect(unsavedNotices("take-home", "Take-home pay")).toEqual([]);
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
    expect(unsavedNotices("take-home", "Take-home pay")).toEqual([]);
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
