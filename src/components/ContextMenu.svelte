<script lang="ts">
  let {
    visible = false,
    x = 0,
    y = 0,
    address = "",
    onCopy,
  }: {
    visible?: boolean;
    x?: number;
    y?: number;
    address?: string;
    onCopy: () => void;
  } = $props();

  function clickCopy() {
    onCopy();
  }
</script>

{#if visible}
  <div
    class="context-menu"
    style="left: {x}px; top: {y}px;"
    data-testid="context-menu"
  >
    <div class="context-menu-item" onclick={clickCopy} data-testid="ctx-copy">Copy</div>
  </div>
{/if}
