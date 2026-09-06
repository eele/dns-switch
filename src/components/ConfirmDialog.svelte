<script lang="ts">
  let {
    visible = false,
    message = "",
    onConfirm,
    onCancel,
  }: {
    visible?: boolean;
    message?: string;
    onConfirm: () => void;
    onCancel: () => void;
  } = $props();
</script>

{#if visible}
  <div class="confirm-overlay" data-testid="confirm-overlay">
    <div class="confirm-dialog">
      <h3>Confirm Delete</h3>
      <p>{message}</p>
      <div class="btn-group">
        <button class="btn" onclick={onCancel} data-testid="btn-confirm-no">No</button>
        <button class="btn btn-danger" onclick={onConfirm} data-testid="btn-confirm-yes">Yes</button>
      </div>
    </div>
  </div>
{/if}
