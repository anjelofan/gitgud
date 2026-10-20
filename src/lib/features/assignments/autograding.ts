/** Titles whose check run annotations carry an autograding score. */
const SCORE_TITLES = ['Autograding complete', 'GitGud autograding'] as const;

/** The message the GitHub Classroom autograding reporter emits, e.g. `Points 8/10`. */
const SCORE_MESSAGE_PATTERN = /^Points (?<earned>\d+(?:\.\d+)?)\/(?<max>\d+(?:\.\d+)?)$/u;

/**
 * Reads a score out of a single check run annotation. GitHub Classroom's
 * reporter emits `Points 8/10` as a notice titled `Autograding complete`;
 * GitGud's own marker is that same message under the `GitGud autograding`
 * title. Most annotations carry no score at all, so `null` is the ordinary
 * result rather than a failure.
 */
export function parseAutogradingScore(title: string | null, message: string) {
    if (title === null) return null;
    if (!SCORE_TITLES.some((scoreTitle) => scoreTitle === title)) return null;

    const match = SCORE_MESSAGE_PATTERN.exec(message);
    if (match === null) return null;

    const { groups } = match;
    if (!groups) return null;

    return { score: Number(groups.earned), maxScore: Number(groups.max) };
}
