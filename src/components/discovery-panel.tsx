import { useContext } from "react";
import { recordCount } from "../lib/discovery-placement.ts";
import {
  DiscoveryContext, DiscoveryRecordList, noDiscoveryResult, notDefects, recordedGaps, recordedQuestions,
} from "./discovery-records.tsx";

/** The Discovery panel: what the attached result holds, and the records that name no baseline item. */
export function DiscoveryPanel() {
  const discovery = useContext(DiscoveryContext);
  if (!discovery) return <div className="space-y-2 text-sm">
    <p>{noDiscoveryResult}</p>
    <p className="text-muted-foreground">A discovery result holds the questions and gaps that the run which saved this baseline file
      recorded. Attach it to read them beside the items that they name.</p>
  </div>;
  const { result, placement } = discovery;
  const unplaced = recordCount(placement.unplaced);
  return <div className="space-y-5 text-sm wrap-anywhere">
    <section role="region" aria-label="Discovery summary" className="space-y-2">
      <p className="font-semibold">{recordedQuestions(result.questions.length)} and {recordedGaps(result.gaps.length)}.</p>
      <p>{notDefects} A later note can answer an earlier question, and both records stay.</p>
      <p>Baseline: {result.baselineRef}</p>
      <p className="text-xs text-muted-foreground">SHA-256: {result.baselineDigest}</p>
      <p className="text-xs text-muted-foreground">Each question and gap appears on the items that it names. The viewer does not load
        evidence or the files that the result names.</p>
    </section>
    <section role="region" aria-label="Unplaced" className="space-y-3">
      <h3 className="font-semibold">Unplaced ({unplaced})</h3>
      <p className="text-muted-foreground">These questions and gaps name a subject that is not a component, interface, resource or rule
        of this baseline, such as a file.</p>
      {unplaced > 0 ? <DiscoveryRecordList records={placement.unplaced} subjects={placement.unplacedSubjects} />
        : <p>Every question and gap names a baseline item.</p>}
    </section>
  </div>;
}
