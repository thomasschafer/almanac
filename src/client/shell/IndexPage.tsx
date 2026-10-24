import { ArrowUpRight, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { AppLink } from "../../shared/links.ts";
import { getLinks } from "../api.ts";
import { tools } from "../tools/registry.tsx";
import { PageHeader } from "./PageHeader.tsx";

const today = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/London",
});

export function IndexPage() {
  const [links, setLinks] = useState<AppLink[]>([]);
  useEffect(() => {
    getLinks().then(setLinks, (error: unknown) => {
      console.error("couldn't load links", error);
    });
  }, []);

  return (
    <main className="page index-page">
      <PageHeader
        title="Almanac"
        back={false}
        subtitle={<span className="num">{today.format(new Date())}</span>}
      />
      <section aria-labelledby="tools-heading">
        <h2 id="tools-heading" className="section-label">
          Tools
        </h2>
        <ul className="list">
          {tools.map((tool, index) => (
            <li key={tool.id}>
              <Link to={tool.path} className="list-row">
                <span
                  className="tool-icon"
                  style={{ "--accent": tool.color } as React.CSSProperties}
                >
                  <tool.icon size={20} aria-hidden />
                </span>
                <span className="list-text">
                  <span className="list-title">{tool.name}</span>
                  <span className="list-desc">{tool.description}</span>
                </span>
                <span className="list-key num" aria-hidden>
                  {index + 1}
                </span>
                <ChevronRight size={16} className="list-chevron" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>
      {links.length > 0 && (
        <section aria-labelledby="elsewhere-heading">
          <h2 id="elsewhere-heading" className="section-label">
            Elsewhere on this machine
          </h2>
          <ul className="list">
            {links.map((link) => (
              <li key={link.httpsPort}>
                <a
                  className="list-row"
                  href={`https://${window.location.hostname}:${String(link.httpsPort)}/`}
                >
                  <span className="list-text">
                    <span className="list-title">{link.name}</span>
                    <span className="list-desc">{link.description}</span>
                  </span>
                  <ArrowUpRight size={16} className="list-chevron" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
