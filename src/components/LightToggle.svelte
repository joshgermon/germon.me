<script>
    function toggleColorScheme() {
        if (document.documentElement.classList.contains('light')) {
            document.documentElement.classList.remove('light');
            localStorage.setItem('lightMode', false);
        } else {
            localStorage.setItem('lightMode', true);
            document.documentElement.classList.add('light');
        }
    }
</script>

<button class="toggle-color-scheme icon-button" on:click={toggleColorScheme} aria-label="Toggle Color Scheme">
    <slot />
</button>