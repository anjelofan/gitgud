import { describe, expect, it } from 'vitest';

import { scoreLabel, summarizeScore } from './score';

const UNSUBMITTED = {
    repoName: null,
    score: null,
    maxScore: null,
    gradedAt: null,
    gradingConclusion: null,
};

const GRADED_AT = new Date('2026-09-16T10:00:00.000Z');

describe('summarizeScore', () => {
    it('reports a roster entry with no repository as not submitted', () => {
        expect(summarizeScore(UNSUBMITTED)).toEqual({ status: 'not-submitted' });
    });

    it('reports a submitted repository that no run has graded yet', () => {
        expect(summarizeScore({ ...UNSUBMITTED, repoName: 'hw1-alice' })).toEqual({
            status: 'awaiting-grading',
        });
    });

    it('reports the points a graded run earned', () => {
        expect(
            summarizeScore({
                ...UNSUBMITTED,
                repoName: 'hw1-alice',
                score: '8.00',
                maxScore: '10.00',
                gradedAt: GRADED_AT,
                gradingConclusion: 'success',
            }),
        ).toEqual({ status: 'scored', score: '8.00', maxScore: '10.00' });
    });

    it('reports a graded run that awarded no points', () => {
        expect(
            summarizeScore({
                ...UNSUBMITTED,
                repoName: 'hw1-alice',
                gradedAt: GRADED_AT,
                gradingConclusion: 'failure',
            }),
        ).toEqual({ status: 'no-score', conclusion: 'failure' });
    });

    it('treats a roster entry as not submitted even when a grade is left behind', () => {
        expect(
            summarizeScore({
                ...UNSUBMITTED,
                score: '8.00',
                maxScore: '10.00',
                gradedAt: GRADED_AT,
                gradingConclusion: 'success',
            }),
        ).toEqual({ status: 'not-submitted' });
    });

    it('reports no score when the graded run recorded no maximum', () => {
        expect(
            summarizeScore({
                ...UNSUBMITTED,
                repoName: 'hw1-alice',
                score: '8.00',
                gradedAt: GRADED_AT,
                gradingConclusion: 'success',
            }),
        ).toEqual({ status: 'no-score', conclusion: 'success' });
    });
});

describe('scoreLabel', () => {
    it('labels an unsubmitted roster entry', () => {
        expect(scoreLabel({ status: 'not-submitted' }, 'autograding')).toBe('Not submitted');
    });

    it('labels a submission no run has graded yet', () => {
        expect(scoreLabel({ status: 'awaiting-grading' }, 'autograding')).toBe(
            'Awaiting autograding',
        );
    });

    it('labels a manual submission awaiting grading', () => {
        expect(scoreLabel({ status: 'awaiting-grading' }, 'manual')).toBe('Awaiting grading');
    });

    it('shows earned points over the maximum', () => {
        expect(
            scoreLabel({ status: 'scored', score: '8.00', maxScore: '10.00' }, 'autograding'),
        ).toBe('8.00 / 10.00');
    });

    it('shows a manually entered score the same way', () => {
        expect(scoreLabel({ status: 'scored', score: '8.50', maxScore: '12.00' }, 'manual')).toBe(
            '8.50 / 12.00',
        );
    });

    it('explains a failed autograding run', () => {
        expect(scoreLabel({ status: 'no-score', conclusion: 'failure' }, 'autograding')).toBe(
            'Autograding failed',
        );
    });

    it('does not invent a reason for a conclusion it does not recognise', () => {
        expect(scoreLabel({ status: 'no-score', conclusion: 'neutral' }, 'autograding')).toBe(
            'No score reported',
        );
        expect(scoreLabel({ status: 'no-score', conclusion: null }, 'autograding')).toBe(
            'No score reported',
        );
    });
});
