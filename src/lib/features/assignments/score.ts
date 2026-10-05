/** The submission fields the dashboard's score display is derived from. */
export interface ScoreSource {
    repoName: string | null;
    score: string | null;
    maxScore: string | null;
    gradedAt: Date | null;
    gradingConclusion: string | null;
}

export type ScoreSummary =
    | { status: 'not-submitted' }
    | { status: 'awaiting-grading' }
    | { status: 'scored'; score: string; maxScore: string }
    | { status: 'no-score'; conclusion: string | null };

/**
 * Reduces a submission row to the one thing an instructor needs to know about
 * it. The order is the contract: a roster entry with no repository has not
 * submitted whatever an earlier grade left behind, and a submitted repository
 * is awaiting grading until a run has concluded.
 */
export function summarizeScore(source: ScoreSource): ScoreSummary {
    if (source.repoName === null) return { status: 'not-submitted' };
    if (source.gradedAt === null) return { status: 'awaiting-grading' };
    if (source.score !== null && source.maxScore !== null)
        return { status: 'scored', score: source.score, maxScore: source.maxScore };

    return { status: 'no-score', conclusion: source.gradingConclusion };
}

function assertNever(value: never): never {
    throw new Error(`unhandled score summary: ${JSON.stringify(value)}`);
}

/**
 * Wording for a concluded run that awarded no points. `success` reaching this
 * far means the workflow finished without reporting a score at all, which is
 * not the same failure as a run that errored.
 */
function noScoreLabel(conclusion: string | null) {
    switch (conclusion) {
        case 'failure':
            return 'Autograding failed';
        case 'cancelled':
            return 'Autograding cancelled';
        case 'timed_out':
            return 'Autograding timed out';
        case 'startup_failure':
            return 'Autograding failed to start';
        default:
            return 'No score reported';
    }
}

/** The instructor-facing text for a summary. */
export function scoreLabel(summary: ScoreSummary): string {
    switch (summary.status) {
        case 'not-submitted':
            return 'Not submitted';
        case 'awaiting-grading':
            return 'Awaiting autograding';
        case 'scored':
            return `${summary.score} / ${summary.maxScore}`;
        case 'no-score':
            return noScoreLabel(summary.conclusion);
        default:
            return assertNever(summary);
    }
}
