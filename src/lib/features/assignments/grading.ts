/** Titles whose check run annotations carry an autograding score. */
const SCORE_TITLES: readonly string[] = ['Autograding complete', 'GitGud autograding'];

/** The message the GitHub Classroom autograding reporter emits, e.g. `Points 8/10`. */
const SCORE_MESSAGE_PATTERN = /^Points (?<earned>\d+(?:\.\d+)?)\/(?<max>\d+(?:\.\d+)?)$/u;

export interface AutogradingScore {
    score: number;
    maxScore: number;
}

/**
 * Reads a score out of a single check run annotation. GitHub Classroom's
 * reporter emits `Points 8/10` as a notice titled `Autograding complete`;
 * GitGud's own marker is that same message under the `GitGud autograding`
 * title. Most annotations carry no score at all, so `null` is the ordinary
 * result rather than a failure.
 */
export function parseAutogradingScore(
    title: string | null,
    message: string,
): AutogradingScore | null {
    if (title === null) return null;
    if (!SCORE_TITLES.includes(title)) return null;

    const match = SCORE_MESSAGE_PATTERN.exec(message);
    if (match === null) return null;

    const earned = match.groups?.earned;
    const max = match.groups?.max;
    if (typeof earned !== 'string' || typeof max !== 'string') return null;

    return { score: Number(earned), maxScore: Number(max) };
}
