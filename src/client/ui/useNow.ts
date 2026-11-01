import { useEffect, useState } from "react";

/**
 * The current time, brought up to date whenever the page comes back into view, so an app left
 * open moves on to a new tax year or interest year when it's next looked at.
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") setNow(new Date());
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return now;
}
