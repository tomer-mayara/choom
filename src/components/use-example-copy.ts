import { useEffect, useRef, useState } from "react";

/** Copy feedback belongs to one mounted frame and its current example choice. */
export function useExampleCopy() {
  const request = useRef(0);
  const [feedback, setFeedback] = useState("");
  useEffect(() => () => { request.current += 1; }, []);

  function reset() {
    request.current += 1;
    setFeedback("");
  }

  async function write(text: string) {
    const current = ++request.current;
    setFeedback("Copying example…");
    let message = "Example copied.";
    try { await navigator.clipboard.writeText(text); }
    catch { message = "Could not copy. Select the example text and copy it manually."; }
    if (current === request.current) setFeedback(message);
  }

  return { feedback, reset, write };
}
