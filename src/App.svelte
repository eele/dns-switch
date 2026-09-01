<script lang="ts">
  import TitleBar from "./components/TitleBar.svelte";
  import DnsRow from "./components/DnsRow.svelte";
  import ContextMenu from "./components/ContextMenu.svelte";
  import ConfirmDialog from "./components/ConfirmDialog.svelte";
  import {
    listAdapters,
    getCurrentDns,
    setDns,
    resetDnsToDhcp,
  } from "./api";
  import type { Adapter, DnsGroup, DnsInfo } from "./types";

  // ── State ──────────────────────────────────────────────────
  let adapters = $state<Adapter[]>([]);
  let selectedAdapter = $state("");
  let currentDns = $state<DnsInfo>({ primary: "", secondary: "", isDhcp: true });
  let dnsGroups = $state<DnsGroup[]>([
    { name: "AliDNS", primary: "223.5.5.5", secondary: "223.6.6.6" },
    { name: "Google DNS", primary: "8.8.8.8", secondary: "8.8.4.4" },
    { name: "DNSPod", primary: "1.12.12.12", secondary: "1.12.0.0" },
  ]);
  let selectedGroup = $state("");
  let statusText = $state("Loading…");
  let statusClass = $state("loading");
  let editingGroup = $state("");
  let adaptersLoaded = $state(false);

  // Context menu state
  let ctxVisible = $state(false);
  let ctxX = $state(0);
  let ctxY = $state(0);
  let ctxAddress = $state("");
  let ctxAddrId = $state("");

  // Confirm dialog state
  let confirmVisible = $state(false);
  let confirmGroup = $state("");
  let confirmMessage = $state("");

  // ── Helpers ────────────────────────────────────────────────
  function isValidIPv4(ip: string): boolean {
    const trimmed = ip.trim();
    if (!trimmed) return true; // allow empty for secondary
    const parts = trimmed.split(".");
    if (parts.length !== 4) return false;
    return parts.every((p) => {
      const n = Number(p);
      return Number.isInteger(n) && n >= 0 && n <= 255 && String(n) === p;
    });
  }

  function isDuplicateName(name: string, ignoreName?: string): boolean {
    const t = name.trim().toLowerCase();
    if (t === "automatic (dhcp)") return true;
    return dnsGroups.some(
      (g) => g.name !== ignoreName && g.name.trim().toLowerCase() === t
    );
  }

  function setStatus(msg: string, cls: "success" | "error" | "loading" | "" = "") {
    statusText = msg;
    statusClass = cls;
  }

  // ── Init ───────────────────────────────────────────────────
  async function init() {
    try {
      const list = await listAdapters();
      adapters = list;
      if (list.length > 0) {
        selectedAdapter = list[0].name;
        await loadDns();
      }
      adaptersLoaded = true;
      setStatus("Ready.");
    } catch (e) {
      setStatus("Failed to load adapters.", "error");
    }
  }

  async function loadDns() {
    setStatus("Loading…", "loading");
    try {
      const info = await getCurrentDns(selectedAdapter);
      currentDns = info;
      // Determine which radio should be checked
      if (info.isDhcp || (!info.primary && !info.secondary)) {
        selectedGroup = "Automatic (DHCP)";
      } else {
        const match = dnsGroups.find(
          (g) => g.primary === info.primary && g.secondary === info.secondary
        );
        selectedGroup = match ? match.name : "";
      }
      setStatus("Ready.");
    } catch {
      setStatus("Failed to load DNS.", "error");
    }
  }

  // ── Event handlers ─────────────────────────────────────────
  async function onAdapterChange() {
    await loadDns();
  }

  async function onRefresh() {
    setStatus("Refreshing…", "loading");
    try {
      adapters = await listAdapters();
      // keep selection if still exists
      if (!adapters.find((a) => a.name === selectedAdapter)) {
        selectedAdapter = adapters[0]?.name ?? "";
      }
      await loadDns();
      setStatus("Adapters refreshed.");
    } catch {
      setStatus("Failed to refresh.", "error");
    }
  }

  async function onToggleGroup(name: string) {
    if (name === "Automatic (DHCP)") {
      setStatus(`Applying DHCP to "${selectedAdapter}"…`, "loading");
      try {
        await resetDnsToDhcp(selectedAdapter);
        currentDns = { primary: "", secondary: "", isDhcp: true };
        selectedGroup = "Automatic (DHCP)";
        setStatus(`DNS on "${selectedAdapter}" reset to DHCP.`, "success");
      } catch {
        setStatus("Failed to reset DNS.", "error");
      }
      return;
    }

    const group = dnsGroups.find((g) => g.name === name);
    if (!group) return;

    setStatus(`Applying "${name}" to "${selectedAdapter}"…`, "loading");
    try {
      await setDns(selectedAdapter, [group.primary, group.secondary]);
      currentDns = { primary: group.primary, secondary: group.secondary, isDhcp: false };
      selectedGroup = name;
      setStatus(`DNS on "${selectedAdapter}" updated successfully.`, "success");
    } catch {
      setStatus(`Failed to apply "${name}".`, "error");
    }
  }

  function onEdit(name: string) {
    editingGroup = name;
  }

  function onSave(name: string, primary: string, secondary: string) {
    const trimmedName = name.trim();
    const trimmedPrimary = primary.trim();
    const trimmedSecondary = secondary.trim();

    if (!trimmedName) {
      setStatus("Group name cannot be empty.", "error");
      return;
    }
    if (isDuplicateName(trimmedName, editingGroup)) {
      setStatus(`Group name "${trimmedName}" already exists or is reserved.`, "error");
      return;
    }
    if (!isValidIPv4(trimmedPrimary)) {
      setStatus("Invalid primary IPv4 address.", "error");
      return;
    }
    if (trimmedSecondary && !isValidIPv4(trimmedSecondary)) {
      setStatus("Invalid secondary IPv4 address.", "error");
      return;
    }

    const idx = dnsGroups.findIndex((g) => g.name === editingGroup);
    if (idx >= 0) {
      dnsGroups = dnsGroups.map((g, i) =>
        i === idx ? { name: trimmedName, primary: trimmedPrimary, secondary: trimmedSecondary } : g
      );
    }
    editingGroup = "";
    setStatus(`Group "${trimmedName}" saved.`, "success");
  }

  function onAdd() {
    const newGroup: DnsGroup = { name: "New Group", primary: "", secondary: "" };
    dnsGroups = [...dnsGroups, newGroup];
    editingGroup = newGroup.name;
    setStatus(`Added "${newGroup.name}". Edit and save to set addresses.`);
  }

  function onDelete(name: string) {
    confirmGroup = name;
    confirmMessage = `Delete DNS group "${name}"? This cannot be undone.`;
    confirmVisible = true;
  }

  function onConfirmDelete() {
    dnsGroups = dnsGroups.filter((g) => g.name !== confirmGroup);
    if (selectedGroup === confirmGroup) {
      selectedGroup = dnsGroups.length > 0 ? dnsGroups[0].name : "";
    }
    confirmVisible = false;
    confirmGroup = "";
    setStatus(`Deleted "${confirmGroup || "group"}.`, "success");
  }

  function onCancelDelete() {
    confirmVisible = false;
    confirmGroup = "";
  }

  // ── Context menu ───────────────────────────────────────────
  function onContext(e: MouseEvent, addr: string, addrId: string) {
    e.preventDefault();
    e.stopPropagation();
    ctxX = e.clientX;
    ctxY = e.clientY;
    ctxAddress = addr;
    ctxAddrId = addrId;
    ctxVisible = true;
  }

  function onCopy(full: boolean) {
    const text = full ? ctxAddress : (window.getSelection()?.toString() || ctxAddress);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setStatus(`Copied ${text}`, "success");
      });
    } else {
      setStatus(`Copied ${text}`, "success");
    }
    ctxVisible = false;
  }

  function hideContextMenu() {
    ctxVisible = false;
  }

  // ── Lifecycle ──────────────────────────────────────────────
  $effect(() => {
    init();
  });

  // Dismiss context menu on click or right-click elsewhere
  $effect(() => {
    if (ctxVisible) {
      const handler = () => hideContextMenu();
      document.addEventListener("click", handler);
      document.addEventListener("contextmenu", handler);
      return () => {
        document.removeEventListener("click", handler);
        document.removeEventListener("contextmenu", handler);
      };
    }
  });
</script>

<svelte:window on:click={hideContextMenu} />

<div id="root" data-testid="app-root">
  <TitleBar title="DNS Switch" />

  <div class="window-body">
    <!-- Adapter selector -->
    <div class="card adapter-row" data-testid="adapter-section">
      <label for="adapter-select">Adapter:</label>
      <div class="select-wrap">
        <select
          id="adapter-select"
          bind:value={selectedAdapter}
          onchange={onAdapterChange}
          data-testid="adapter-select"
        >
          {#each adapters as a (a.name)}
            <option value={a.name}>{a.name}</option>
          {/each}
        </select>
        <div class="select-chevron btn btn-primary" aria-hidden="true">
          <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
            <path
              d="M2 3.5 L5 6.5 L8 3.5"
              fill="none"
              stroke="#ffffff"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
      </div>
      <button class="btn" onclick={onRefresh} data-testid="btn-refresh">
        Refresh
      </button>
    </div>

    <!-- Current DNS -->
    <div class="card current-dns-row" data-testid="current-dns-section">
      <span class="label">Current DNS:</span>
      {#if currentDns.isDhcp || (!currentDns.primary && !currentDns.secondary)}
        <span class="addr-dhcp" data-testid="current-dns">Automatic (DHCP)</span>
      {:else}
        <!-- Each address is individually copyable via the right-click
             context menu; the wrapper keeps the "current-dns" test id. -->
        <span class="current-dns-addr" data-testid="current-dns">
          <span
            class="addr"
            data-testid="current-dns-primary"
            oncontextmenu={(e) => onContext(e, currentDns.primary, "current-primary")}
            >{currentDns.primary}</span
          >
          <span class="addr-sep" aria-hidden="true">/</span>
          <span
            class="addr"
            data-testid="current-dns-secondary"
            oncontextmenu={(e) => onContext(e, currentDns.secondary, "current-secondary")}
            >{currentDns.secondary}</span
          >
        </span>
      {/if}
    </div>

    <!-- DNS groups -->
    <div class="card dns-list" data-testid="dns-list">
      {#each dnsGroups as group (group.name)}
        <DnsRow
          group={group}
          isEditing={editingGroup === group.name}
          isSelected={selectedGroup === group.name}
          onToggle={onToggleGroup}
          onEdit={onEdit}
          onSave={onSave}
          onDelete={onDelete}
          onContext={onContext}
        />
      {/each}
      <!-- Automatic (DHCP) fixed row -->
      <DnsRow
        group={{ name: "Automatic (DHCP)", primary: "Automatic", secondary: "—" }}
        isDhcp={true}
        isSelected={selectedGroup === "Automatic (DHCP)"}
        onToggle={onToggleGroup}
        onEdit={() => {}}
        onSave={() => {}}
        onDelete={() => {}}
        onContext={() => {}}
      />
    </div>

    <!-- Bottom: Add + Status -->
    <div class="bottom-section">
      <button class="btn btn-primary add-btn" onclick={onAdd} data-testid="btn-add">
        + Add
      </button>
      <div class="status-bar {statusClass}" data-testid="status">{statusText}</div>
    </div>
  </div>
</div>

<!-- Context menu -->
<ContextMenu
  visible={ctxVisible}
  x={ctxX}
  y={ctxY}
  address={ctxAddress}
  onCopy={onCopy}
/>

<!-- Confirm dialog -->
<ConfirmDialog
  visible={confirmVisible}
  message={confirmMessage}
  onConfirm={onConfirmDelete}
  onCancel={onCancelDelete}
/>
