import { Bookmark, Check, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { TakeHomeInputs } from "../../../shared/take-home/inputs.ts";
import {
  ApiError,
  createPreset,
  deletePreset,
  listPresets,
  type Preset,
  renamePreset,
  updatePreset,
} from "../../api.ts";
import { Sheet } from "../../ui/Sheet.tsx";

export type TakeHomePreset = Preset<"take-home">;

export function samePreset(a: TakeHomeInputs, b: TakeHomeInputs): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The presets on the server, reloaded after every change made here. */
export function usePresets(): {
  presets: TakeHomePreset[] | null;
  error: string | null;
  reload: () => Promise<void>;
} {
  const [presets, setPresets] = useState<TakeHomePreset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const apply = useCallback((load: Promise<TakeHomePreset[]>) => {
    return load.then(
      (loaded) => {
        setPresets(loaded);
        setError(null);
      },
      (e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      },
    );
  }, []);
  const reload = useCallback(() => apply(listPresets("take-home")), [apply]);
  useEffect(() => {
    void apply(listPresets("take-home"));
  }, [apply]);
  return { presets, error, reload };
}

export function PresetsButton({
  inputs,
  presets,
  activeId,
  onLoad,
  onSaved,
  onCompare,
  reload,
  loadError,
}: {
  /** The figures being edited, which saving a preset saves. */
  inputs: TakeHomeInputs;
  presets: TakeHomePreset[] | null;
  /** The preset the figures were loaded from, if any. */
  activeId: string | null;
  onLoad: (preset: TakeHomePreset) => void;
  onSaved: (preset: TakeHomePreset) => void;
  onCompare: (preset: TakeHomePreset) => void;
  reload: () => Promise<void>;
  loadError: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = presets?.find((p) => p.id === activeId) ?? null;
  const modified = active !== null && !samePreset(active.state, inputs);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? "There's already a preset with that name."
          : `Couldn't save: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="header-button"
        onClick={() => {
          setOpen(true);
        }}
      >
        <Bookmark size={15} aria-hidden />
        <span className="header-button-label">
          {active === null ? "Presets" : active.name}
          {modified && (
            <span className="modified" aria-label=", edited">
              {" "}
              •
            </span>
          )}
        </span>
      </button>
      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title="Presets"
      >
        {(loadError ?? error) !== null && <p className="form-error">{error ?? loadError}</p>}
        <form
          className="preset-save"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = name.trim();
            if (trimmed === "") return;
            void run(async () => {
              onSaved(await createPreset("take-home", trimmed, inputs));
              setName("");
            });
          }}
        >
          <div className="input">
            <input
              aria-label="New preset name"
              placeholder="Save these figures as…"
              value={name}
              maxLength={80}
              onChange={(e) => {
                setName(e.currentTarget.value);
              }}
            />
          </div>
          <button type="submit" className="button primary" disabled={busy || name.trim() === ""}>
            Save
          </button>
        </form>
        {presets === null ? (
          <p className="empty">Loading…</p>
        ) : presets.length === 0 ? (
          <p className="empty">
            No presets yet. Save the current figures to come back to them, or to compare against.
          </p>
        ) : (
          <ul className="preset-list">
            {presets.map((preset) => {
              const isActive = preset.id === activeId;
              return (
                <li key={preset.id} className={isActive ? "active" : undefined}>
                  {renaming?.id === preset.id ? (
                    <form
                      className="preset-rename"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const trimmed = renaming.name.trim();
                        if (trimmed === "") return;
                        void run(async () => {
                          await renamePreset("take-home", preset.id, trimmed);
                          setRenaming(null);
                        });
                      }}
                    >
                      <div className="input">
                        <input
                          aria-label="Preset name"
                          autoFocus
                          value={renaming.name}
                          maxLength={80}
                          onChange={(e) => {
                            setRenaming({ id: preset.id, name: e.currentTarget.value });
                          }}
                        />
                      </div>
                      <button type="submit" className="button" disabled={busy}>
                        Rename
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="preset-load"
                      onClick={() => {
                        onLoad(preset);
                        setOpen(false);
                      }}
                    >
                      <span className="preset-name">{preset.name}</span>
                      {isActive && (
                        <span className="preset-status">
                          <Check size={14} aria-hidden />{" "}
                          {modified ? "Loaded, edited since" : "Loaded"}
                        </span>
                      )}
                    </button>
                  )}
                  <div className="preset-actions">
                    {isActive && modified && (
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            updatePreset("take-home", preset.id, preset.name, inputs).then(
                              () => undefined,
                            ),
                          )
                        }
                      >
                        Update with current
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        onCompare(preset);
                        setOpen(false);
                      }}
                    >
                      Compare
                    </button>
                    <button
                      type="button"
                      className="icon-button small"
                      aria-label={`Rename ${preset.name}`}
                      onClick={() => {
                        setRenaming({ id: preset.id, name: preset.name });
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-button small"
                      aria-label={`Delete ${preset.name}`}
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm(`Delete the preset "${preset.name}"?`)) return;
                        void run(async () => {
                          await deletePreset("take-home", preset.id);
                        });
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>
    </>
  );
}
