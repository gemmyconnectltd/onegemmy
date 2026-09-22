import { useEffect, useState } from "react";

/** Returns `value`, but only after it has stopped changing for `delayMs`.
 *  Used to hold off firing a server search request on every keystroke —
 *  the input itself stays instant (bound to local state), only the value
 *  passed to the query is debounced. */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
