<script lang="ts">
    import type { Assignment, Program, RosterEntry } from '$lib/server/db/schema';
    import { resolve } from '$app/paths';

    interface Issue {
        path: string;
        message: string;
    }

    interface Props {
        data: {
            program: Pick<Program, 'name' | 'org'>;
            students: Pick<RosterEntry, 'id' | 'name'>[];
            assignments: Pick<Assignment, 'id' | 'name' | 'deadline'>[];
            repositories: string[];
        };
        form: {
            message: string;
            issues: Issue[];
            data: { name: string; deadline: string; templateRepo: string };
        } | null;
    }

    let { data, form }: Props = $props();
    let { program, students, assignments, repositories } = $derived(data);
</script>

<div>
    <a href={resolve('/')}>← Back to dashboard</a>
    <h1>{program.name}</h1>
    <p>GitHub organization: <code>{program.org}</code></p>

    <h2>Create Assignment</h2>

    {#if form !== null}
        <div role="alert">
            <p>{form.message}</p>
            {#if form.issues.length > 0}
                <ul>
                    {#each form.issues as issue (issue.path + issue.message)}
                        <li><code>{issue.path}</code>: {issue.message}</li>
                    {/each}
                </ul>
            {/if}
        </div>
    {/if}

    <form method="POST" action="?/create-assignment">
        <div>
            <label>
                <p>Assignment Name</p>
                <input type="text" name="name" maxlength="120" required />
            </label>
        </div>

        <div>
            <label>
                <p>Deadline</p>
                <input type="datetime-local" name="deadline" required />
            </label>
        </div>

        <div>
            <label>
                <p>Repository Template</p>
                {#if repositories.length === 0}
                    <p>No available repositories in organization</p>
                {:else}
                    <select name="templateRepo" required>
                        {#each repositories as r}
                            <option value={r}> {r} </option>
                        {/each}
                    </select>
                {/if}
            </label>
        </div>
        <button type="submit">Create Assignment</button>
    </form>

    <h2>Assignments</h2>
    {#each assignments as a}
        <p>{a.name}</p>
    {/each}

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
