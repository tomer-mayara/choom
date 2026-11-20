import { assert, exact, oneOf, strings, text } from './record-checks.ts';
import type { BoundaryRole } from '@choom/baseline-model/contracts';

const useRoles: readonly BoundaryRole[] =
  ['production', 'test', 'development', 'build', 'ci', 'benchmark', 'example', 'environment', 'unknown'];

export const isUseRole = (role: unknown): role is BoundaryRole => oneOf(useRoles, role);

// File purpose describes the selector. A use describes a site at which it was reached.
// Return all cited evidence so Stage 1 can resolve it against the supplied packet.
export function validateUnitUseReview(review: unknown): string[] {
  assert(exact(review, ['unitScope', 'basis', 'uses', 'evidenceRefs', 'limits']) &&
    oneOf([...useRoles, 'mixed'], review.unitScope) && oneOf(['declaration', 'complete-review', 'partial-review'], review.basis) &&
    strings(review.evidenceRefs) && Array.isArray(review.uses) && Array.isArray(review.limits) && review.limits.every(text),
  'Each file purpose needs a unit use review, its evidence and limits.');
  const cited = new Set(review.evidenceRefs);
  const observed = new Set<unknown>();
  for (const use of review.uses) {
    assert(exact(use, ['role', 'evidenceRefs']) && isUseRole(use.role) && strings(use.evidenceRefs),
      'Each observed use needs a role and evidence.');
    observed.add(use.role);
    for (const ref of use.evidenceRefs) cited.add(ref);
  }
  assert(review.basis !== 'partial-review' || review.limits.length, 'State the limits of a partial review.');
  assert(review.basis !== 'complete-review' || !review.limits.length, 'An incomplete search cannot support a complete review.');
  if (review.unitScope !== 'unknown' && review.unitScope !== 'mixed' && review.unitScope !== 'production') {
    assert(review.basis !== 'partial-review', 'An exclusive non-production unit needs a declaration or complete review.');
    assert([...observed].every(role => role === review.unitScope), 'The exclusive unit scope conflicts with its observed uses.');
  }
  if (review.unitScope === 'mixed') assert(observed.has('production') &&
    [...observed].some(role => role !== 'production' && role !== 'unknown'), 'Mixed scope needs production and non-production uses.');
  return [...cited];
}
