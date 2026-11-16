import { validateQuestionsAndGaps } from '@choom/baseline-model/discovery-result';

// The question and gap contract of the viewer (CR-004), from @choom/baseline-model:
// the exact fields and the limits of each question and gap, at most 5,000 of them
// together, unique IDs, and at most 4 MiB of text. Later stages keep each question
// and gap unchanged, so each stage checks the records where they enter a run: Stage 1
// finish, Stage 2 plan and finish, the Stage 3 finalizer, and the shared record
// checks of Stages 4 to 6. A run then holds no record that Stage 6 must refuse.
// `discovery` holds the questions and gaps that the stage saves.
export function checkQuestionsAndGaps(discovery: unknown): void {
  const check = validateQuestionsAndGaps(discovery);
  if (check.status === 'invalid')
    throw new Error('The questions and gaps do not match the discovery contract of the viewer. ' + check.message);
}
