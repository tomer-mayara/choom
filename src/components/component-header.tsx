import type { SystemEntryCounts } from "../lib/system-entry-points.ts";
import { recordedGaps, recordedQuestions } from "./discovery-records.tsx";

/** The recorded questions and gaps that name a component or one of its fields. */
export interface DiscoveryCount {
  readonly questions: number;
  readonly gaps: number;
}

/** The counts that a component header shows under its name. */
export interface HeaderCounts {
  readonly interfaceCount: number;
  readonly duplicateCount: number;
  readonly discovery?: DiscoveryCount;
  readonly entryCounts?: SystemEntryCounts;
}

// Each count after the interface count adds one line to the header, which has a
// shared height. Entry markers or three lines use compact spacing, and four lines
// keep the name to one line. The full name stays in the title and the details.
function lineCount({ duplicateCount, discovery, entryCounts }: HeaderCounts): number {
  return 1 + Number(duplicateCount > 0) + Number(discovery !== undefined) + Number(entryCounts !== undefined);
}

export function compactHeader(counts: HeaderCounts): boolean {
  return counts.entryCounts !== undefined || lineCount(counts) >= 3;
}

/** The IDs that describe a component control: the inspection hint and the header badges. */
export function headerDescription(id: string, { discovery, entryCounts }: HeaderCounts): string {
  return ["item-inspection-hint", discovery ? `discovery-records-${id}` : "", entryCounts ? `system-entry-markers-${id}` : ""]
    .filter(Boolean).join(" ");
}

// One count fits the header line; its title names questions and gaps apart.
function discoveryBadge({ questions, gaps }: DiscoveryCount): string {
  return gaps === 0 ? recordedQuestions(questions) : questions === 0 ? recordedGaps(gaps) : `${questions + gaps} recorded questions and gaps`;
}

export function ComponentHeaderText({ id, name, counts }: { id: string; name: string; counts: HeaderCounts }) {
  const { interfaceCount, duplicateCount, discovery, entryCounts } = counts;
  const compact = compactHeader(counts);
  // A compact header has no gap between lines: two 20px name lines and three 14px
  // lines use all 82px inside the 88px header. A name line must be at least as high
  // as Inter text at 16px (20px). If it is lower, the clamp cuts the last name line.
  const metadataLine = compact ? "text-xs leading-[14px]" : "text-xs";
  const nameLines = lineCount(counts) >= 4 ? "line-clamp-1" : "line-clamp-2";
  return <>
    <span className={`${nameLines} max-w-full font-semibold wrap-anywhere ${compact ? "leading-[20px]" : "leading-5"}`} title={name}>{name}</span>
    <span className={`${metadataLine} text-muted-foreground`}>{interfaceCount} {interfaceCount === 1 ? "interface" : "interfaces"}</span>
    {duplicateCount > 0 ? <span className={metadataLine}>{duplicateCount} possible {duplicateCount === 1 ? "duplicate" : "duplicates"}</span> : null}
    {discovery ? <span id={`discovery-records-${id}`} className={`${metadataLine} font-medium`}
      title={`${recordedQuestions(discovery.questions)} and ${recordedGaps(discovery.gaps)}`}>{discoveryBadge(discovery)}</span> : null}
    {entryCounts ? <span id={`system-entry-markers-${id}`} className={`flex gap-1 font-medium ${metadataLine}`}>
      {entryCounts.startup > 0 ? <span className="rounded-sm bg-sky-100 px-1 text-sky-900 dark:bg-sky-950 dark:text-sky-200">Startup {entryCounts.startup}</span> : null}
      {entryCounts.external > 0 ? <span className="rounded-sm bg-violet-100 px-1 text-violet-900 dark:bg-violet-950 dark:text-violet-200">External {entryCounts.external}</span> : null}
    </span> : null}
  </>;
}
