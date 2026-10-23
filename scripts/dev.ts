import { fileURLToPath } from "node:url";

// Development runs on its own port and data directory, so it never touches the deployed copy of
// the app or its data. The e2e tests use 8792.
export const DEV_API_PORT = 8791;
export const DEV_DATA_DIR = fileURLToPath(new URL("../.dev-data", import.meta.url));
