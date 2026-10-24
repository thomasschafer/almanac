import { serveStatic } from "@hono/node-server/serve-static";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { isToolId, type ToolId, toolSchemas } from "../shared/tools.ts";
import type { AppLink } from "../shared/links.ts";
import { ConflictError, NotFoundError, type Store } from "./store.ts";

export interface AppDeps {
  store: Store;
  /**
   * The only tailnet login allowed to use the API, or null to allow any request. Tailscale Serve
   * sets the Tailscale-User-Login header, so requests reaching the port any other way, such as
   * from another local process, are refused too.
   */
  allowedLogin: string | null;
  /** Directory containing the built client, or null to serve the API only. */
  clientDir: string | null;
  links: readonly AppLink[];
}

const presetName = z.string().trim().min(1).max(80);

/**
 * Parses a request body, answering 400 if it's invalid. Other validation failures, such as stored
 * data no longer matching its schema, are server errors rather than the client's fault.
 */
async function parseBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Request body must be valid JSON" });
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new HTTPException(400, {
      res: Response.json(
        { error: "Invalid request", issues: result.error.issues },
        { status: 400 },
      ),
    });
  }
  return result.data;
}

function toolParam(c: Context): ToolId {
  const tool = c.req.param("tool");
  if (tool === undefined || !isToolId(tool)) throw new NotFoundError(`no tool ${String(tool)}`);
  return tool;
}

export function createApp(deps: AppDeps): Hono {
  const { store } = deps;
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof NotFoundError) return c.json({ error: err.message }, 404);
    if (err instanceof ConflictError) return c.json({ error: err.message }, 409);
    if (err instanceof HTTPException) return err.getResponse();
    console.error(err);
    return c.json({ error: "Internal server error" }, 500);
  });

  const api = new Hono();

  api.get("/health", (c) => c.json({ ok: true }));

  api.use("*", async (c, next) => {
    if (deps.allowedLogin !== null && c.req.header("Tailscale-User-Login") !== deps.allowedLogin) {
      return c.json({ error: "Forbidden" }, 403);
    }
    await next();
    return undefined;
  });

  api.get("/links", (c) => c.json({ links: deps.links }));

  api.get("/tools/:tool/state", (c) => c.json({ saved: store.getState(toolParam(c)) }));

  api.put("/tools/:tool/state", async (c) => {
    const tool = toolParam(c);
    const { state } = await parseBody(c, z.object({ state: toolSchemas[tool].state }));
    return c.json({ saved: store.putState(tool, state) });
  });

  api.get("/tools/:tool/presets", (c) => c.json({ presets: store.listPresets(toolParam(c)) }));

  api.post("/tools/:tool/presets", async (c) => {
    const tool = toolParam(c);
    const { name, state } = await parseBody(
      c,
      z.object({ name: presetName, state: toolSchemas[tool].preset }),
    );
    return c.json({ preset: store.createPreset(tool, name, state) }, 201);
  });

  api.put("/tools/:tool/presets/:id", async (c) => {
    const tool = toolParam(c);
    const { name, state } = await parseBody(
      c,
      z.object({ name: presetName, state: toolSchemas[tool].preset }),
    );
    return c.json({ preset: store.updatePreset(tool, c.req.param("id"), name, state) });
  });

  api.delete("/tools/:tool/presets/:id", (c) => {
    store.deletePreset(toolParam(c), c.req.param("id"));
    return c.body(null, 204);
  });

  api.all("*", (c) => c.json({ error: "Not found" }, 404));

  app.route("/api", api);

  const clientDir = deps.clientDir;
  if (clientDir !== null) {
    if (!existsSync(join(clientDir, "index.html"))) {
      throw new Error(`no client build in ${clientDir}; run npm run build`);
    }
    app.use("/*", serveStatic({ root: clientDir }));
    // Client-side routes fall back to the app shell.
    app.get("*", serveStatic({ root: clientDir, path: "index.html" }));
  }

  return app;
}
