import type { z } from "zod";
import type { DuplicationFinding, DuplicationReport } from "./generated/contracts.ts";

function metadataWithinLimit(report: DuplicationReport): boolean {
  const encoder = new TextEncoder();
  const pending: unknown[] = [report];
  let bytes = 0;
  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value === "string") bytes += encoder.encode(value).byteLength;
    else if (value !== null && typeof value === "object") {
      for (const child of Object.values(value)) pending.push(child);
    }
    if (bytes > 4 * 1024 * 1024) return false;
  }
  return true;
}

function reviewIssues(finding: DuplicationFinding): string[] {
  const issues: string[] = [];
  if (finding.status === "needs-review") {
    if (finding.review !== null) issues.push("A pending finding cannot claim completed independent review.");
    return issues;
  }
  if (!finding.review || !finding.rationale) issues.push("A reviewed finding needs independent review and its rationale.");
  if (finding.review?.worker === finding.review?.manager && finding.review !== null) issues.push("The manager and worker must be distinct reviewers.");
  if (finding.review && !Number.isFinite(Date.parse(finding.review.reviewedAt))) issues.push("Review time must be a valid timestamp.");
  if (finding.status === "potential-redundancy" && (!finding.overlap || finding.evidenceRefs.length === 0)) {
    issues.push("Potential redundancy needs a supported overlap and evidence.");
  }
  if (finding.status === "justified-distinction" && (finding.differences.length === 0 || finding.evidenceRefs.length === 0)) {
    issues.push("A justified distinction needs its decisive differences and evidence.");
  }
  if (finding.status === "insufficient-evidence" && finding.gaps.length === 0) issues.push("Insufficient evidence must name the missing facts.");
  return issues;
}

function coverageIssues(report: DuplicationReport): string[] {
  const issues: string[] = [];
  const pending = report.findings.filter((finding) => finding.status === "needs-review").length;
  if (report.review.pending !== pending || report.review.inspected !== report.findings.length - pending) {
    issues.push("Review counts must count each finding once in its actual state.");
  }
  if (report.review.status === "completed" && pending > 0) issues.push("A completed review cannot contain pending findings.");
  if (report.review.status === "pending" && report.review.inspected > 0) issues.push("A pending review cannot count completed reviews.");
  if (report.scan.status === "completed" && (report.scan.counts.examined === 0 || report.scan.scopeRefs.length === 0)) {
    issues.push("An empty scan scope cannot be a completed scan.");
  }
  if (report.scan.status !== "completed" && report.scan.diagnostics.length === 0) issues.push("An incomplete scan needs a diagnostic reason.");
  if (!Number.isFinite(Date.parse(report.createdAt))) issues.push("Report creation time must be a valid timestamp.");
  return issues;
}

export function validateDuplicationSemantics(report: DuplicationReport, context: z.RefinementCtx): void {
  if (!metadataWithinLimit(report)) context.addIssue({
    code: "custom", message: "Report string metadata exceeds 4 MiB.", params: { reportLimit: true },
  });
  for (const message of coverageIssues(report)) context.addIssue({ code: "custom", path: ["review"], message });
  report.findings.forEach((finding, index) => {
    const issue = (message: string) => context.addIssue({ code: "custom", path: ["findings", index], message });
    for (const message of reviewIssues(finding)) issue(message);
    for (const observation of finding.observations) {
      if (observation.origin === "source-review" && (observation.score !== null || observation.toolVersion !== null)) {
        issue("Source review cannot claim a detector score or tool version.");
      }
      if (observation.origin !== "source-review" && (observation.score === null || observation.toolVersion === null)) {
        issue("Detector observations need a structural score and tool version.");
      }
    }
    const refs = new Set<string>();
    for (const source of finding.sources) {
      if (source.snapshotId !== report.snapshot.id) issue("Source references must belong to the recorded snapshot.");
      if (refs.has(source.evidenceRef)) issue("Source evidence references must be unique within a finding.");
      refs.add(source.evidenceRef);
    }
  });
}
