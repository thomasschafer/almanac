import { useCallback, useState } from "react";

/** Watches the main figure so phone pages can pin a summary after it leaves the viewport. */
export function useHeroVisibility() {
  const [visible, setVisible] = useState(true);
  const ref = useCallback((element: HTMLElement | null) => {
    if (element === null) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry !== undefined) setVisible(entry.isIntersecting);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  return { visible, ref };
}
