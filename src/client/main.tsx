import "@fontsource-variable/geist";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import { StrictMode, Suspense } from "react";
import { registerSW } from "virtual:pwa-register";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router";
import { IndexPage } from "./shell/IndexPage.tsx";
import { NoticesProvider } from "./shell/notices.tsx";
import { PageHeader } from "./shell/PageHeader.tsx";
import { tools } from "./tools/registry.tsx";

function NotFound() {
  return (
    <main className="page">
      <PageHeader title="Not found" />
      <p className="empty">
        There's nothing here. <Link to="/">Back to Almanac</Link>
      </p>
    </main>
  );
}

const root = document.getElementById("root");
if (root === null) throw new Error("no #root element");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <NoticesProvider>
        <Suspense fallback={<main className="page" aria-busy />}>
          <Routes>
            <Route path="/" element={<IndexPage />} />
            {tools.map((tool) => (
              <Route key={tool.id} path={`${tool.path}/*`} element={<tool.Page />} />
            ))}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </NoticesProvider>
    </BrowserRouter>
  </StrictMode>,
);

const UPDATE_CHECK_MS = 60 * 60 * 1000;

// The service worker only looks for a new version when the app loads, and an app on a phone's
// home screen can stay open for days, so it also checks when the app comes back to the front and
// every so often while it's open. A new version reloads the app; unsaved edits are kept on the
// device and saved after it reloads.
registerSW({
  immediate: true,
  onRegisteredSW(url, registration) {
    if (registration === undefined) {
      throw new Error(`no service worker registration for ${url}`);
    }
    const check = () => {
      if (!navigator.onLine) return;
      registration.update().catch((error: unknown) => {
        console.error("couldn't check for a new version", error);
      });
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") check();
    });
    setInterval(check, UPDATE_CHECK_MS);
  },
  onRegisterError(error: unknown) {
    console.error("couldn't register the service worker", error);
  },
});
