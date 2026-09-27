<script lang="ts">
    import favicon from '$lib/assets/favicon.svg';

    import './layout.css';

    let { children } = $props();
</script>

<svelte:head>
    <link rel="icon" href={favicon} />
</svelte:head>

<main class="my-10 mx-20">
    {@render children()}
</main>
