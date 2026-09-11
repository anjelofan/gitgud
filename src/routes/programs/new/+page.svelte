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
    <h1>Create a program</h1>

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

    <form method="POST" action="/programs/new" enctype="multipart/form-data">
        <div>
            <label for="program-name">Program name</label>
            <input
                id="program-name"
                name="name"
                type="text"
                required
                maxlength="120"
                value={form?.data?.name ?? ''}
            />
        </div>

        <div>
            <label for="program-org">GitHub organization</label>
            <input
                id="program-org"
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
                <label for="program-roster-csv">Upload roster CSV</label>
                <input
                    id="program-roster-csv"
                    name="rosterCsv"
                    type="file"
                    accept=".csv,text/csv"
                />
                <p>Student names in the first column.</p>
            </div>
            <div>
                <label for="program-roster-text">Or paste student names</label>
                <textarea id="program-roster-text" name="rosterText" rows="6"></textarea>
                <p>One student name per line.</p>
            </div>
        </fieldset>

        <button type="submit">Create program</button>
    </form>
</div>
