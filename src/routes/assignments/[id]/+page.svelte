<script lang="ts">
    import type { Assignment, Program } from '$lib/server/db/schema';
    import { resolve } from '$app/paths';

    interface Props {
        data: {
            assignment: Pick<Assignment, 'name' | 'deadline' | 'inviteToken' | 'templateRepo'>;
            program: Pick<Program, 'name' | 'id' | 'org'>;
        };
    }

    let { data }: Props = $props();
    let { assignment, program } = $derived(data);
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
