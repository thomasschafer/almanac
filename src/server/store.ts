import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { type PresetState, type ToolId, type ToolState, toolSchemas } from "../shared/tools.ts";

export interface SavedState<T extends ToolId> {
  state: ToolState<T>;
  updatedAt: string;
}

export interface Preset<T extends ToolId> {
  id: string;
  name: string;
  state: PresetState<T>;
  createdAt: string;
  updatedAt: string;
}

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

const stateRow = z.object({ state: z.string(), updated_at: z.string() });
const presetRow = z.object({
  id: z.string(),
  name: z.string(),
  state: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

/**
 * Stored state is validated on the way out as well as in, so a row that no longer matches its
 * schema fails loudly rather than reaching the client half-understood.
 */
// TypeScript can't relate a schema looked up by a generic tool id to that tool's type, so these
// assert what the lookup guarantees.
function parseState<T extends ToolId>(tool: T, json: string): ToolState<T> {
  return toolSchemas[tool].storedState.parse(JSON.parse(json)) as ToolState<T>;
}

function parsePreset<T extends ToolId>(tool: T, json: string): PresetState<T> {
  return toolSchemas[tool].preset.parse(JSON.parse(json)) as PresetState<T>;
}

function toPreset<T extends ToolId>(tool: T, row: unknown): Preset<T> {
  const r = presetRow.parse(row);
  return {
    id: r.id,
    name: r.name,
    state: parsePreset(tool, r.state),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}

export function createStore(db: DatabaseSync, now: () => Date) {
  /** Changes a preset's name, and its figures if given, failing if it's missing or the name taken. */
  function changePreset(
    tool: ToolId,
    id: string,
    change: { readonly name: string; readonly state?: string },
  ): void {
    const at = now().toISOString();
    let changes: number | bigint;
    try {
      ({ changes } =
        change.state === undefined
          ? db
              .prepare("update presets set name = ?, updated_at = ? where tool = ? and id = ?")
              .run(change.name, at, tool, id)
          : db
              .prepare(
                "update presets set name = ?, state = ?, updated_at = ? where tool = ? and id = ?",
              )
              .run(change.name, change.state, at, tool, id));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(`a preset called "${change.name}" exists`);
      }
      throw error;
    }
    if (Number(changes) === 0) throw new NotFoundError(`no preset ${id}`);
  }

  function getPreset<T extends ToolId>(tool: T, id: string): Preset<T> {
    const row = db
      .prepare(
        "select id, name, state, created_at, updated_at from presets where tool = ? and id = ?",
      )
      .get(tool, id);
    if (row === undefined) throw new NotFoundError(`no preset ${id}`);
    return toPreset(tool, row);
  }

  return {
    getState<T extends ToolId>(tool: T): SavedState<T> | null {
      const row = db.prepare("select state, updated_at from tool_state where tool = ?").get(tool);
      if (row === undefined) return null;
      const r = stateRow.parse(row);
      return { state: parseState(tool, r.state), updatedAt: r.updated_at };
    },

    putState<T extends ToolId>(tool: T, state: ToolState<T>): SavedState<T> {
      const updatedAt = now().toISOString();
      db.prepare(
        `insert into tool_state (tool, state, updated_at) values (?, ?, ?)
         on conflict (tool) do update set state = excluded.state, updated_at = excluded.updated_at`,
      ).run(tool, JSON.stringify(state), updatedAt);
      return { state, updatedAt };
    },

    listPresets<T extends ToolId>(tool: T): Preset<T>[] {
      return db
        .prepare(
          "select id, name, state, created_at, updated_at from presets where tool = ? order by name collate nocase",
        )
        .all(tool)
        .map((row) => toPreset(tool, row));
    },

    createPreset<T extends ToolId>(tool: T, name: string, state: PresetState<T>): Preset<T> {
      const id = randomUUID();
      const at = now().toISOString();
      try {
        db.prepare(
          "insert into presets (id, tool, name, state, created_at, updated_at) values (?, ?, ?, ?, ?, ?)",
        ).run(id, tool, name, JSON.stringify(state), at, at);
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError(`a preset called "${name}" exists`);
        throw error;
      }
      return { id, name, state, createdAt: at, updatedAt: at };
    },

    updatePreset<T extends ToolId>(
      tool: T,
      id: string,
      name: string,
      state: PresetState<T>,
    ): Preset<T> {
      changePreset(tool, id, { name, state: JSON.stringify(state) });
      return getPreset(tool, id);
    },

    /** Renames a preset, leaving its figures as they are, whatever they've been changed to. */
    renamePreset<T extends ToolId>(tool: T, id: string, name: string): Preset<T> {
      changePreset(tool, id, { name });
      return getPreset(tool, id);
    },

    deletePreset(tool: ToolId, id: string): void {
      const { changes } = db.prepare("delete from presets where tool = ? and id = ?").run(tool, id);
      if (Number(changes) === 0) throw new NotFoundError(`no preset ${id}`);
    },
  };
}

export type Store = ReturnType<typeof createStore>;
