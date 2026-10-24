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

registerSW({ immediate: true });
