<script lang="ts">
type Props = {
  title: string;
  description: string;
};

let { title, description }: Props = $props();
</script>

<section class="app-shell-placeholder" data-testid={`app-shell-placeholder-${title.toLowerCase()}`}>
  <h2 class="app-shell-placeholder__title">{title}</h2>
  <p class="app-shell-placeholder__description">{description}</p>
</section>
