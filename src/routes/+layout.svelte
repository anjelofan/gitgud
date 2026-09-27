<script lang="ts">
    import favicon from '$lib/assets/favicon.svg';

    import './layout.css';

    let { children } = $props();
</script>

<svelte:head>
    <link rel="icon" href={favicon} />
</svelte:head>

<main class="mx-20 my-10">
    {@render children()}
</main>
