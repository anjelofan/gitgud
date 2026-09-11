<script lang="ts">
    import type { Program, User } from '$lib/server/db/schema';
    import { resolve } from '$app/paths';

    interface Props {
        user: Pick<User, 'login' | 'avatarUrl'> | null;
        programs: Pick<Program, 'id' | 'name' | 'org'>[];
    }

    let { data } = $props();
    let { user, programs }: Props = $derived(data);
</script>

<div>
    <h1>gitgud</h1>

    {#if user === null}
        <a href={resolve('/auth/sign-in')} data-sveltekit-reload>Sign in with GitHub</a>
    {:else}
        {@const { login, avatarUrl } = user}
        <div>
            {#if avatarUrl !== null}
                <img src={avatarUrl} alt={`${login}'s avatar`} />
            {/if}
            <p>Signed in as {login}</p>
            <form method="POST" action="/auth/sign-out">
                <button type="submit">Sign out</button>
            </form>
        </div>

        <section>
            <h2>Your programs</h2>
            <a href={resolve('/programs/new')}>Create program</a>
            {#if programs.length === 0}
                <p>No programs yet.</p>
            {:else}
                <ul>
                    {#each programs as program (program.id)}
                        <li>
                            <a href={resolve('/programs/[id]', { id: program.id })}>
                                {program.name}
                            </a>
                            in <code>{program.org}</code>
                        </li>
                    {/each}
                </ul>
            {/if}
        </section>
    {/if}
</div>
