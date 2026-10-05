<script lang="ts">
    import type { Assignment, Program } from '$lib/server/db/schema';
    import { resolve } from '$app/paths';
    import { type ScoreSource, scoreLabel, summarizeScore } from '$lib/features/assignments/score';

    interface StudentScore extends ScoreSource {
        name: string;
        login: string | null;
        avatarUrl: string | null;
    }

    type RefreshReport =
        | { ok: true; submitted: number; recorded: number; current: number; failed: number }
        | { ok: false; message: string };

    interface Props {
        data: {
            assignment: Pick<Assignment, 'name' | 'deadline' | 'inviteToken' | 'templateRepo'>;
            program: Pick<Program, 'name' | 'id' | 'org'>;
            students: StudentScore[];
        };
        form: { refresh: RefreshReport } | null;
    }

    let { data, form }: Props = $props();
    let { assignment, program, students } = $derived(data);
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

<form method="POST" action="?/refresh-scores">
    <button type="submit">Refresh scores</button>
</form>

{#if form !== null}
    {#if form.refresh.ok}
        <p>
            {form.refresh.submitted} repositories checked: {form.refresh.recorded} updated,
            {form.refresh.current} already current, {form.refresh.failed} failed.
        </p>
    {:else}
        <p role="alert">{form.refresh.message}</p>
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
        <span>{scoreLabel(summarizeScore(student))}</span>
        {#if student.repoName !== null}
            <a
                href={`https://github.com/${program.org}/${student.repoName}`}
                target="_blank"
                rel="noopener noreferrer">See repository</a
            >
        {/if}
    </div>
{/each}
