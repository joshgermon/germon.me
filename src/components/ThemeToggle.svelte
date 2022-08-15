<script>
    import { onMount } from 'svelte';
	onMount(async () => {
        const selectedTheme = localStorage.getItem('theme');
        if(selectedTheme) {
            document.querySelector(`[data-theme="${selectedTheme}"]`).dataset.active = true;
        }else {
            document.querySelector(`[data-theme="default"]`).dataset.active = true;
        }
	});

    function handleThemeSwitch(e) {
        if(e.target.classList.contains('theme-option')) {
            document.body.classList.remove(e.currentTarget.querySelector('[data-active="true"]').dataset.theme);
            delete e.currentTarget.querySelector('[data-active="true"]').dataset.active;
            localStorage.setItem('theme', e.target.dataset.theme);
            document.body.classList.add(e.target.dataset.theme);
            e.target.dataset.active = true;
        }
    }
</script>

<div class="theme-selector" on:click={handleThemeSwitch}>
    <div class="theme-option" data-theme="default">Default</div>
    <div class="theme-option" data-theme="warm">Warm</div>
</div>

<style lang="scss">
    .theme-selector {
        display: flex;
        border-radius: 4px;
        border: 1px solid var(--border-color);
        .theme-option {
            cursor: pointer;
            border-radius: 4px;
            padding: 0 0.75rem;
            color: rgba(var(--hover-color), 0.5);
            transition: background-color 300ms ease;
        }
    }
</style>