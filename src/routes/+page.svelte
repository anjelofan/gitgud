<script lang="ts">
    import { resolve } from '$app/paths';
    import type { Role } from '$lib/server/auth/roles';
    import type { User } from '$lib/server/db/schema';

    interface Props {
        user: Pick<User, 'login' | 'avatarUrl'> | null;
        role: Pick<Role, 'kind'> | null;
    }

    let { data } = $props();
    let { user, role }: Props = $derived(data);
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
            {#if role !== null}
                <p>Role: {role.kind}</p>
            {/if}
            <form method="POST" action="/auth/sign-out">
                <button type="submit">Sign out</button>
            </form>
        </div>
    {/if}
</div>
