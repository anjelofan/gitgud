<script lang="ts">
    import type { Assignment, Program } from '$lib/server/db/schema';
    import { resolve } from '$app/paths';
    import { type ScoreSource, scoreLabel, summarizeScore } from '$lib/features/assignments/score';

    interface StudentScore extends ScoreSource {
        submissionId: string | null;
        name: string;
        login: string | null;
        avatarUrl: string | null;
    }

    type RefreshReport =
        | {
              ok: true;
              submitted: number;
              recorded: number;
              current: number;
              noScoreFound: number;
              failed: number;
          }
        | { ok: false; message: string };

    type SetScoreReport =
        | { ok: true; submissionId: string; score: string; maxScore: string }
        | { ok: false; message: string };

    interface Props {
        data: {
            assignment: Pick<
                Assignment,
                'name' | 'deadline' | 'inviteToken' | 'templateRepo' | 'gradingMode' | 'maxScore'
            >;
            program: Pick<Program, 'name' | 'id' | 'org'>;
            students: StudentScore[];
        };
        form: { refresh?: RefreshReport; setScore?: SetScoreReport } | null;
    }

    let { data, form }: Props = $props();
    let { assignment, program, students } = $derived(data);
    let refreshReport = $derived(
        form !== null && 'refresh' in form ? (form.refresh ?? null) : null,
    );
    let setScoreReport = $derived(
        form !== null && 'setScore' in form ? (form.setScore ?? null) : null,
    );
</script>

<a href={resolve('/programs/[id]', { id: program.id })}> ← Back to {program.name}</a>

<h1>{assignment.name}</h1>

<p>GitHub organization: <code>{program.org}</code></p>

<p>
    Deadline: {new Date(assignment.deadline).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'UTC',
    })}
</p>

<p>Invite link: /invite/{assignment.inviteToken}</p>
<p>
    Template repo:
    <a href={`https://github.com/${program.org}/${assignment.templateRepo}`}>
        {assignment.templateRepo}</a
    >
</p>

{#if assignment.gradingMode === 'autograding'}
    <form method="POST" action="?/refresh-scores">
        <button type="submit">Refresh scores</button>
    </form>
{:else}
    <p>Manual grading: maximum score {assignment.maxScore}.</p>
{/if}

{#if refreshReport !== null}
    {#if refreshReport.ok}
        <p>
            {refreshReport.submitted} repositories checked: {refreshReport.recorded} updated,
            {refreshReport.current} already current, {refreshReport.noScoreFound} no score found,
            {refreshReport.failed} failed.
        </p>
    {:else}
        <p role="alert">{refreshReport.message}</p>
    {/if}
{/if}

{#if setScoreReport !== null}
    {#if setScoreReport.ok}
        <p>Score saved: {setScoreReport.score} / {setScoreReport.maxScore}.</p>
    {:else}
        <p role="alert">{setScoreReport.message}</p>
    {/if}
{/if}

{#each students as student, idx (idx)}
    <div class="flex items-center justify-between">
        <div class="flex items-center justify-start">
            {#if student.avatarUrl !== null}
                <img src={student.avatarUrl} alt={`${student.login}'s avatar`} class="size-15" />
            {/if}
            <div class="flex flex-col items-start justify-center">
                <p>{student.name}</p>
                {#if student.login !== null}
                    <a
                        href={`https://github.com/${student.login}`}
                        class="text-sm text-gray-400"
                        target="_blank"
                        rel="noopener noreferrer">@{student.login}</a
                    >
                {/if}
            </div>
        </div>
        <span>{scoreLabel(summarizeScore(student), assignment.gradingMode)}</span>
        {#if assignment.gradingMode === 'manual' && student.submissionId !== null}
            <form method="POST" action="?/set-score" class="flex items-center gap-2">
                <input type="hidden" name="submissionId" value={student.submissionId} />
                <input
                    type="number"
                    name="score"
                    step="0.01"
                    min="0"
                    value={student.score ?? ''}
                    aria-label="Score"
                    class="w-24 rounded-sm border px-2 py-1"
                    required
                />
                <button type="submit">Save score</button>
            </form>
        {/if}
        {#if student.repoName !== null}
            <a
                href={`https://github.com/${program.org}/${student.repoName}`}
                target="_blank"
                rel="noopener noreferrer">See repository</a
            >
        {/if}
    </div>
{/each}
