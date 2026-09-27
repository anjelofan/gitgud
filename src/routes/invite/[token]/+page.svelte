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

    let rosterClaim = $state('');
</script>

<h1 class="font-bold text-3xl lg:text-4xl mb-4">{assignment.name}</h1>

<p class="mb-4">
    <strong>Deadline</strong>: {new Date(assignment.deadline).toLocaleDateString('en-US', {
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
    {#if claimedEntryName !== null}
        <p>Student: <strong>{claimedEntryName}</strong></p>
    {/if}
    <p>{alreadyAccepted ? 'You have already accepted this assignment.' : 'Assignment accepted!'}</p>
    <p>
        Your assignment repository:
        <a href={repoUrl} class="text-csi-blue underline">{repo?.repoName}</a>
    </p>
{:else if unclaimedEntryNames.length === 0 && claimedEntryName === null}
    <p>All students are already enrolled. Please contact your instructor if you haven't.</p>
{:else}
    <form method="POST" action="?/accept">
        {#if claimedEntryName !== null}
            <p>Student: <strong>{claimedEntryName}</strong></p>
        {:else}
            Choose your name:
            <div class="flex flex-col border mb-4 h-100 bg-csi-grayscale-200 rounded-sm overflow-y-auto">
                {#each unclaimedEntryNames as name (name)}
                    <button type="button" class="py-2 px-4 border-b border-black rounded-sm text-left {rosterClaim === name ? 'bg-csi-blue text-csi-white' : 'bg-csi-white'} hover:bg-csi-blue hover:text-csi-white focus:bg-csi-blue focus:text-csi-white" onclick={() => { rosterClaim = name; }}>{name}</button>
                {/each}
            </div>
        {/if}
        <input type="hidden" name="name" value={rosterClaim} required />
        <button type="submit" class="rounded-sm py-2 px-4 border hover:bg-csi-blue hover:text-csi-white focus:bg-csi-blue focus:text-csi-white">Accept assignment</button>
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
