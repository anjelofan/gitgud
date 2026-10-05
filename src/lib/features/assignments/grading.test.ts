import { describe, expect, it } from 'vitest';

import { parseAutogradingScore } from './grading.ts';

describe('parseAutogradingScore', () => {
    it('reads an integer score from the GitHub Classroom marker', () => {
        expect(parseAutogradingScore('Autograding complete', 'Points 8/10')).toEqual({
            score: 8,
            maxScore: 10,
        });
    });

    it('reads a fractional score', () => {
        expect(parseAutogradingScore('Autograding complete', 'Points 8.5/10')).toEqual({
            score: 8.5,
            maxScore: 10,
        });
    });

    it("reads the same message under GitGud's own marker", () => {
        expect(parseAutogradingScore('GitGud autograding', 'Points 0/7')).toEqual({
            score: 0,
            maxScore: 7,
        });
    });

    it('ignores an annotation under an unrelated title', () => {
        expect(parseAutogradingScore('Build failed', 'Points 8/10')).toBeNull();
    });

    it('ignores an annotation without a title', () => {
        expect(parseAutogradingScore(null, 'Points 8/10')).toBeNull();
    });

    it('ignores a message that merely contains the score text', () => {
        expect(
            parseAutogradingScore('Autograding complete', 'See Points 8/10 in the log'),
        ).toBeNull();
    });

    it('ignores a message with a trailing suffix', () => {
        expect(parseAutogradingScore('Autograding complete', 'Points 8/10 (late)')).toBeNull();
    });

    it('ignores a message without a maximum score', () => {
        expect(parseAutogradingScore('Autograding complete', 'Points 8')).toBeNull();
    });
});
