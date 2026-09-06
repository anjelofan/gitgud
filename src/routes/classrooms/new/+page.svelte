<script lang="ts">
    import { resolve } from '$app/paths';

    interface Issue {
        path: string;
        message: string;
    }

    interface Props {
        form: {
            message: string;
            issues: Issue[];
            data: { name: string; org: string };
        } | null;
    }

    let { form }: Props = $props();
</script>

<div>
    <a href={resolve('/')}>← Back to dashboard</a>
    <h1>Create a classroom</h1>

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

    <form method="POST" action="/classrooms/new" enctype="multipart/form-data">
        <div>
            <label for="classroom-name">Classroom name</label>
            <input
                id="classroom-name"
                name="name"
                type="text"
                required
                maxlength="120"
                value={form?.data?.name ?? ''}
            />
        </div>

        <div>
            <label for="classroom-org">GitHub organization</label>
            <input
                id="classroom-org"
                name="org"
                type="text"
                required
                maxlength="39"
                value={form?.data?.org ?? ''}
            />
            <p>You must be an owner of this organization on GitHub.</p>
        </div>

        <fieldset>
            <legend>Student roster (optional)</legend>
            <div>
                <label for="classroom-roster-csv">Upload roster CSV</label>
                <input
                    id="classroom-roster-csv"
                    name="rosterCsv"
                    type="file"
                    accept=".csv,text/csv"
                />
                <p>Student names in the first column.</p>
            </div>
            <div>
                <label for="classroom-roster-text">Or paste student names</label>
                <textarea id="classroom-roster-text" name="rosterText" rows="6"></textarea>
                <p>One student name per line.</p>
            </div>
        </fieldset>

        <button type="submit">Create classroom</button>
    </form>
</div>
