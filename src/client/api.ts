import { z } from "zod";
import { type AppLink, appLink } from "../shared/links.ts";
import { type PresetState, type ToolId, type ToolState, toolSchemas } from "../shared/tools.ts";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const errorBody = z.object({ error: z.string() });

async function request<S extends z.ZodType>(
  path: string,
  schema: S,
  init: RequestInit = {},
): Promise<z.infer<S>> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const parsed = errorBody.safeParse(body);
    throw new ApiError(res.status, parsed.success ? parsed.data.error : res.statusText);
  }
  if (res.status === 204) return schema.parse(undefined);
  return schema.parse(await res.json());
}

function savedSchema(tool: ToolId) {
  return z.object({ state: toolSchemas[tool].state, updatedAt: z.string() });
}

function presetSchema(tool: ToolId) {
  return z.object({
    id: z.string(),
    name: z.string(),
    state: toolSchemas[tool].preset,
    createdAt: z.string(),
    updatedAt: z.string(),
  });
}

export interface Saved<T extends ToolId> {
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

export async function getState<T extends ToolId>(tool: T): Promise<Saved<T> | null> {
  const body = await request(
    `/tools/${tool}/state`,
    z.object({ saved: savedSchema(tool).nullable() }),
  );
  return body.saved as Saved<T> | null;
}

export async function putState<T extends ToolId>(tool: T, state: ToolState<T>): Promise<Saved<T>> {
  const body = await request(`/tools/${tool}/state`, z.object({ saved: savedSchema(tool) }), {
    method: "PUT",
    body: JSON.stringify({ state }),
  });
  return body.saved as Saved<T>;
}

export async function listPresets<T extends ToolId>(tool: T): Promise<Preset<T>[]> {
  const body = await request(
    `/tools/${tool}/presets`,
    z.object({ presets: z.array(presetSchema(tool)) }),
  );
  return body.presets as Preset<T>[];
}

export async function createPreset<T extends ToolId>(
  tool: T,
  name: string,
  state: PresetState<T>,
): Promise<Preset<T>> {
  const body = await request(`/tools/${tool}/presets`, z.object({ preset: presetSchema(tool) }), {
    method: "POST",
    body: JSON.stringify({ name, state }),
  });
  return body.preset as Preset<T>;
}

export async function updatePreset<T extends ToolId>(
  tool: T,
  id: string,
  name: string,
  state: PresetState<T>,
): Promise<Preset<T>> {
  const body = await request(
    `/tools/${tool}/presets/${encodeURIComponent(id)}`,
    z.object({ preset: presetSchema(tool) }),
    { method: "PUT", body: JSON.stringify({ name, state }) },
  );
  return body.preset as Preset<T>;
}

export async function deletePreset(tool: ToolId, id: string): Promise<void> {
  await request(`/tools/${tool}/presets/${encodeURIComponent(id)}`, z.undefined(), {
    method: "DELETE",
  });
}

export async function getLinks(): Promise<AppLink[]> {
  return (await request("/links", z.object({ links: z.array(appLink) }))).links;
}
