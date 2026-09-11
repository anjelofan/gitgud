<script lang="ts">
    import type { Program, RosterEntry } from '$lib/server/db/schema';
    import { resolve } from '$app/paths';

    interface Props {
        data: {
            program: Pick<Program, 'name' | 'org'>;
            students: Pick<RosterEntry, 'id' | 'name'>[];
        };
    }

    let { data }: Props = $props();
    let { program, students } = $derived(data);
</script>

<div>
    <a href={resolve('/')}>← Back to dashboard</a>
    <h1>{program.name}</h1>
    <p>GitHub organization: <code>{program.org}</code></p>

    <h2>Student roster</h2>
    {#if students.length === 0}
        <p>No students in this program yet.</p>
    {:else}
        <ul>
            {#each students as student (student.id)}
                <li>{student.name}</li>
            {/each}
        </ul>
    {/if}
</div>
