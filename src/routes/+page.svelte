<script lang="ts">
    import type { Classroom, User } from '$lib/server/db/schema';
    import { resolve } from '$app/paths';

    interface Props {
        user: Pick<User, 'login' | 'avatarUrl'> | null;
        classrooms: Pick<Classroom, 'id' | 'name' | 'org'>[];
    }

    let { data } = $props();
    let { user, classrooms }: Props = $derived(data);
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
            <h2>Your classrooms</h2>
            <a href={resolve('/classrooms/new')}>Create classroom</a>
            {#if classrooms.length === 0}
                <p>No classrooms yet.</p>
            {:else}
                <ul>
                    {#each classrooms as classroom (classroom.id)}
                        <li>
                            <a href={resolve('/classrooms/[id]', { id: classroom.id })}>
                                {classroom.name}
                            </a>
                            in <code>{classroom.org}</code>
                        </li>
                    {/each}
                </ul>
            {/if}
        </section>
    {/if}
</div>
