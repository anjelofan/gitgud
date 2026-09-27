<script lang="ts">
    import type { Assignment } from '$lib/server/db/schema';

    interface Props {
        data: {
            assignment: Pick<Assignment, 'name' | 'deadline'>;
            unclaimedEntryNames: string[];
            claimedEntryName: string | null;
            acceptedRepo: { org: string, repoName: string } | null;
        };
        form?: {
            success?: boolean;
            already?: boolean;
            org?: string;
            repoName?: string;
            message?: string;
            issues?: { path: string; message: string }[];
        } | null;
    }

    let { data, form }: Props = $props();
    let { assignment, unclaimedEntryNames, claimedEntryName, acceptedRepo } = $derived(data);
    let formRepo = $derived(
        form?.success === true && typeof form.repoName === 'string' && typeof form.org === 'string'
            ? { org: form.org, repoName: form.repoName }
            : null,
    );
    let repo = $derived(formRepo ?? acceptedRepo);
    let repoUrl = $derived(
        repo === null ? null : `https://github.com/${repo.org}/${repo.repoName}`,
    );
    let alreadyAccepted = $derived(formRepo === null || form?.already === true);
</script>

<a href={resolve('/')}>← Back to dashboard</a>

<h1>{assignment.name}</h1>

<p>Program: {program.name} (GitHub organization <code>{program.org}</code>)</p>

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

{#if repoUrl !== null}
    <p>{form?.already ? 'You have already accepted this assignment.' : 'Assignment accepted!'}</p>
    <p>
        Your assignment repository:
        <a href={repoUrl}>{form?.repoName}</a>
    </p>
{:else if unclaimedEntryNames.length === 0 && claimedEntryName === null}
    <p>No roster entries are available to claim. Contact your instructor.</p>
{:else}
    <form method="POST" action="?/accept">
        {#if claimedEntryName !== null}
            <p>Accepting as the roster entry <strong>{claimedEntryName}</strong>.</p>
        {:else}
            <label>
                Choose your name:
                <select name="name" required>
                    {#each unclaimedEntryNames as name (name)}
                        <option value={name}>{name}</option>
                    {/each}
                </select>
            </label>
        {/if}
        <button type="submit">Accept assignment</button>
    </form>
    {#if form && form.success !== true}
        <p>{form.message}</p>
        {#if form.issues && form.issues.length > 0}
            <ul>
                {#each form.issues as issue (issue.path)}
                    <li>{issue.message}</li>
                {/each}
            </ul>
        {/if}
    {/if}
{/if}
