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

    // TODO: Switch with real repo
    const repositories = ['Repo 1', 'Repo 2', 'Repo 3'];
</script>

<div>
    <a href={resolve('/')}>← Back to dashboard</a>
    <h1>{program.name}</h1>
    <p>GitHub organization: <code>{program.org}</code></p>

    <h2>Create Assignment</h2>

    <form method="POST" action="TODO">
        <div>
            <label>
                <p>Assignment Name</p>
                <input type="text" name="assignment_name" required />
            </label>
        </div>

        <div>
            <label>
                <p>Deadline</p>
                <input type="date" name="deadline" required />
            </label>
        </div>

        <div>
            <label>
                <p>Repository Template</p>
                <!-- TODO: Switch with repo -->
                <select name="template_repo" required>
                    {#each repositories as r}
                        <option value={r}> {r} </option>
                    {/each}
                </select>
            </label>
        </div>
    </form>

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
