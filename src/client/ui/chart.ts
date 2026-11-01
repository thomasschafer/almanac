import { useCallback, useState } from "react";

/** Responsive chart sizing and pointer position, shared by the tools' chart renderers. */
export function useChartInteraction() {
  const [width, setWidth] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const ref = useCallback((element: HTMLDivElement | null) => {
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  return { width, scrub, setScrub, ref };
}

export function niceCeiling(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * magnitude >= value) return step * magnitude;
  }
  return 10 * magnitude;
}

export function compactPounds(pence: number): string {
  const pounds = pence / 100;
  if (pounds === 0) return "£0";
  if (Math.abs(pounds) >= 1000) return `£${String(Math.round(pounds / 100) / 10)}k`;
  return `£${String(Math.round(pounds))}`;
}
