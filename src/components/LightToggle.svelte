<script>
    function toggleColorScheme() {
        if (document.body.classList.contains('light')) {
            document.body.classList.remove('light');
            localStorage.setItem('lightMode', false);
        } else {
            localStorage.setItem('lightMode', true);
            document.body.classList.add('light');
        }
    }
</script>

<button class="toggle-color-scheme icon-button" on:click={toggleColorScheme} aria-label="Toggle Color Scheme">
    <slot />
</button>