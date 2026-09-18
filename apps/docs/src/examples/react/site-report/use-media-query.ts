import { useSyncExternalStore } from "react";

/** Whether a media query matches, kept current. False on the server, where there is no viewport. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}
