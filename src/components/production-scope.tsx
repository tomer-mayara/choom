import type { Baseline } from "@choom/baseline-model/contracts";
import type { ReadonlyData } from "@choom/baseline-model/readonly-data";

export function ScopeSwitch({ showAll, onChange }: { showAll: boolean; onChange: (value: boolean) => void }) {
  return <label title="Also reveals tests, tools and records with Scope unknown." className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs">
    <input id="production-scope-switch" type="checkbox" role="switch" aria-label="Show non-production" checked={showAll} aria-describedby="scope-help"
      onChange={(event) => { event.currentTarget.focus({ preventScroll: true }); onChange(event.currentTarget.checked); }} />
    Show non-production
    <span id="scope-help" className="sr-only">Includes tests, tools, examples and records with Scope unknown.</span>
  </label>;
}

function scopeNotice(file: ReadonlyData<Baseline>, showAll: boolean): string | undefined {
  if (file.formatVersion !== 6) {
    if (!file.components.length && !file.interfaces.length && !file.resources.length && !file.rules.length) return undefined;
    return showAll ? "Scope unknown" : "Production scope unavailable";
  }
  const review = file.boundaryReview;
  if (review.status === "needs-refresh") return "Needs refresh";
  const unknownScope = review.componentScopes.length < file.components.length
    || [...review.componentScopes, ...review.units, ...review.operations].some((item) => item.roles.includes("unknown"))
    || review.units.some((item) => item.ownerId === null)
    || review.accesses.some((site) => site.callerRole === "unknown" || site.targetRole === "unknown");
  if (unknownScope) return "Production scope partially classified";
  if (!showAll && file.components.length > 0 && !review.componentScopes.some((item) => item.roles.includes("production"))) return "No production components in reviewed scope";
}

export function SourceIdentity({ file, showAll }: { file: ReadonlyData<Baseline>; showAll: boolean }) {
  const identity = file.formatVersion === 6 ? file.boundaryReview.identity : undefined;
  const notice = scopeNotice(file, showAll);
  if (!identity) return <span className="text-xs text-muted-foreground">{notice ?? (showAll ? "All scopes" : "Production")}</span>;
  return <div className="flex shrink-0 flex-wrap gap-x-3 border-b border-border px-4 py-1 text-xs text-muted-foreground">
    {identity && <><strong>{identity.projectKey}</strong><span>{identity.sourceKind === "working-tree"
      ? `Working tree${identity.baseCommit ? ` · ${identity.baseCommit}` : ` · ${identity.snapshotRef}`}`
      : identity.baseCommit ?? identity.snapshotRef}</span></>}
    <span>{showAll ? "All scopes" : "Production"}</span>
    <span>{notice}</span>
  </div>;
}
