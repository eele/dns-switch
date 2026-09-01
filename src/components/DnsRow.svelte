<script lang="ts">
  import type { DnsGroup } from "../types";

  let { group, isDhcp = false, isEditing = false, isSelected = false, onToggle, onEdit, onSave, onDelete, onContext } = $props();

  let editName = $state("");
  let editPrimary = $state("");
  let editSecondary = $state("");

  function startEdit() {
    editName = group.name;
    editPrimary = group.primary;
    editSecondary = group.secondary;
    onEdit(group.name);
  }

  function doSave() {
    onSave(editName, editPrimary, editSecondary);
  }

  function handleContext(e: MouseEvent, addr: string, addrId: string) {
    e.preventDefault();
    e.stopPropagation();
    onContext(e, addr, addrId);
  }
</script>

<div class="dns-row" data-testid="row-{group.name}">
  {#if isDhcp}
    <input type="radio" name="dns-group" checked={isSelected} onchange={() => onToggle("Automatic (DHCP)")} data-testid="radio-dhcp" />
    <span class="group-name">Automatic (DHCP)</span>
    <span class="addr-dhcp" data-testid="dhcp-label">Automatic</span>
    <span class="addr-dhcp">—</span>
    <!-- No Edit/Delete for DHCP row -->
    <span></span>
    <span></span>
  {:else}
    <input
      type="radio"
      name="dns-group"
      checked={isSelected}
      onchange={() => onToggle(group.name)}
      data-testid="radio-{group.name}"
    />
    {#if isEditing}
      <input class="group-name-input" bind:value={editName} data-testid="edit-name-{group.name}" />
      <input class="addr-input" bind:value={editPrimary} data-testid="edit-primary-{group.name}" />
      <input class="addr-input" bind:value={editSecondary} data-testid="edit-secondary-{group.name}" />
      <button class="btn btn-primary" onclick={doSave} data-testid="btn-save-{group.name}">Save</button>
    {:else}
      <span class="group-name">{group.name}</span>
      <span class="addr" data-testid="addr-{group.name}-primary" oncontextmenu={(e) => handleContext(e, group.primary, "primary")}>{group.primary}</span>
      <span class="addr" data-testid="addr-{group.name}-secondary" oncontextmenu={(e) => handleContext(e, group.secondary, "secondary")}>{group.secondary}</span>
      <button class="btn" onclick={startEdit} data-testid="btn-edit-{group.name}">Edit</button>
    {/if}
    <button class="btn btn-danger" onclick={() => onDelete(group.name)} data-testid="btn-delete-{group.name}">Del</button>
  {/if}
</div>
