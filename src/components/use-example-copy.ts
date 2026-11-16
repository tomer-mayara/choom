import { useEffect, useRef, useState } from "react";

/** The feedback of one copy action: while the clipboard works, after success, and after a failure. */
export interface CopyMessages {
  readonly copying: string;
  readonly copied: string;
  readonly failed: string;
}

const exampleMessages: CopyMessages = {
  copying: "Copying example…", copied: "Example copied.", failed: "Could not copy. Select the example text and copy it manually.",
};

/** Copy feedback belongs to one mounted frame and its current choice, such as an example or a statement. */
export function useExampleCopy(messages: CopyMessages = exampleMessages) {
  const request = useRef(0);
  const [feedback, setFeedback] = useState("");
  useEffect(() => () => { request.current += 1; }, []);

  function reset() {
    request.current += 1;
    setFeedback("");
  }

  async function write(text: string) {
    const current = ++request.current;
    setFeedback(messages.copying);
    let message = messages.copied;
    try { await navigator.clipboard.writeText(text); }
    catch { message = messages.failed; }
    if (current === request.current) setFeedback(message);
  }

  return { feedback, reset, write };
}
