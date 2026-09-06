<script lang="ts">
    import type { Classroom, RosterEntry } from '$lib/server/db/schema';
    import { resolve } from '$app/paths';

    interface Props {
        data: {
            classroom: Pick<Classroom, 'name' | 'org'>;
            students: Pick<RosterEntry, 'id' | 'name'>[];
        };
    }

    let { data }: Props = $props();
    let { classroom, students } = $derived(data);
</script>

<div>
    <a href={resolve('/')}>← Back to dashboard</a>
    <h1>{classroom.name}</h1>
    <p>GitHub organization: <code>{classroom.org}</code></p>

    <h2>Student roster</h2>
    {#if students.length === 0}
        <p>No students in this classroom yet.</p>
    {:else}
        <ul>
            {#each students as student (student.id)}
                <li>{student.name}</li>
            {/each}
        </ul>
    {/if}
</div>
