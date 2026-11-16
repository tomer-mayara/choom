// Types for run-layout.mjs, so that TypeScript helpers can import it. The
// JavaScript file stays unchanged until a ticket changes it (rule 5).
export declare const localRunExclusion: string;
export declare function pathsOverlap(first: string, second: string): boolean;
export declare function runLayout(work: string, tools: string): "checkout-local" | "separate";
