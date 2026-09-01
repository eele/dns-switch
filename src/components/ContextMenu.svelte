<script lang="ts">
  let { visible = false, x = 0, y = 0, address = "", onCopy } = $props();

  function clickCopy() {
    onCopy(false);
  }
  function clickCopyAll() {
    onCopy(true);
  }
</script>

{#if visible}
  <div
    class="context-menu"
    style="left: {x}px; top: {y}px;"
    data-testid="context-menu"
  >
    <div class="context-menu-item" onclick={clickCopy} data-testid="ctx-copy">Copy</div>
    <div class="context-menu-item" onclick={clickCopyAll} data-testid="ctx-copy-all">Copy All</div>
  </div>
{/if}
