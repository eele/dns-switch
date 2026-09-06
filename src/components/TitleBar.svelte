<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";

  interface Props {
    title?: string;
  }
  let { title = "DNS Switch" }: Props = $props();

  const handleClose = () => {
    getCurrentWindow().close();
  };
  const handleMinimize = () => {
    getCurrentWindow().minimize();
  };
  const handleMaximize = () => {
    getCurrentWindow().toggleMaximize();
  };
</script>

<div
  class="title-bar"
  data-testid="title-bar"
  data-tauri-drag-region
  role="toolbar"
  aria-label="Window controls"
>
  <div class="traffic-light-group">
    <button
      class="traffic-dot dot-red"
      onclick={handleClose}
      data-testid="btn-close"
      aria-label="Close"
    >
      <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true">
        <line x1="3" y1="3" x2="7" y2="7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        <line x1="7" y1="3" x2="3" y2="7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
      </svg>
    </button>
    <button
      class="traffic-dot dot-yellow"
      onclick={handleMinimize}
      data-testid="btn-minimize"
      aria-label="Minimize"
    >
      <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true">
        <line x1="2.5" y1="5" x2="7.5" y2="5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
      </svg>
    </button>
    <button
      class="traffic-dot dot-green"
      onclick={handleMaximize}
      data-testid="btn-maximize"
      aria-label="Maximize"
    >
      <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true">
        <line x1="5" y1="2.5" x2="5" y2="7.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        <line x1="2.5" y1="5" x2="7.5" y2="5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
      </svg>
    </button>
  </div>
  <div class="title-bar-title">{title}</div>
</div>

<style>
  /* ── Mac OS X Aqua: brushed-metal title bar ────────────────── */
  .title-bar {
    height: 28px;
    flex-shrink: 0;
    position: relative;
    display: flex;
    align-items: center;
    user-select: none;
    -webkit-app-region: drag;
    /* brushed metal with subtle vertical gradient + faint pinstripe */
    background:
      repeating-linear-gradient(
        0deg,
        rgba(255, 255, 255, 0.02) 0px,
        rgba(255, 255, 255, 0.02) 1px,
        transparent 1px,
        transparent 2px
      ),
      linear-gradient(180deg, #f0f0f0 0%, #e4e4e4 35%, #d8d8d8 70%, #ccc 100%);
    border-bottom: 1px solid #a0a0a0;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
  }

  /* ── Traffic light group ───────────────────────────────────── */
  .traffic-light-group {
    display: flex;
    gap: 6px;
    padding-left: 8px;
    height: 100%;
    align-items: center;
    -webkit-app-region: no-drag;
    z-index: 10;
  }

  /* ── Traffic light dot: Aqua "candy sphere" ──────────────────
     Layered approach:
     1. Base: radial gradient (light center → saturated → dark rim)
     2. Gloss: ::before pseudo — the signature upper-third sheen
     3. Ring: thin 1px border in a deeper shade of the hue
     4. Shadow: subtle outer drop + inner bottom shade for depth */
  .traffic-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1px solid;
    padding: 0;
    cursor: pointer;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: filter 0.1s ease;
    flex-shrink: 0;
  }

  /* Red (close) */
  .dot-red {
    border-color: #c4382f;
    background: radial-gradient(circle at 50% 42%,
      #ff9a92 0%,
      #ff5f56 45%,
      #d9403a 100%
    );
    box-shadow:
      0 1px 1px rgba(0, 0, 0, 0.18),
      inset 0 -1px 2px rgba(0, 0, 0, 0.12);
  }

  /* Yellow (minimize) */
  .dot-yellow {
    border-color: #d4a01a;
    background: radial-gradient(circle at 50% 42%,
      #ffe082 0%,
      #ffbd2e 45%,
      #d99424 100%
    );
    box-shadow:
      0 1px 1px rgba(0, 0, 0, 0.18),
      inset 0 -1px 2px rgba(0, 0, 0, 0.12);
  }

  /* Green (zoom/maximize) */
  .dot-green {
    border-color: #3a9e2a;
    background: radial-gradient(circle at 50% 42%,
      #8ad86e 0%,
      #53c22b 45%,
      #3e9e22 100%
    );
    box-shadow:
      0 1px 1px rgba(0, 0, 0, 0.18),
      inset 0 -1px 2px rgba(0, 0, 0, 0.12);
  }

  /* ── Signature Aqua gloss: crescent highlight on upper third ─ */
  .traffic-dot::before {
    content: "";
    position: absolute;
    top: 1px;
    left: 2px;
    right: 2px;
    height: 45%;
    border-radius: 50% 50% 50% 50% / 80% 80% 20% 20%;
    background: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.9) 0%,
      rgba(255, 255, 255, 0.4) 60%,
      rgba(255, 255, 255, 0.05) 100%
    );
    pointer-events: none;
  }

  /* ── Glyphs: hidden until group hover (classic macOS behavior) ── */
  .traffic-dot svg {
    position: relative;
    z-index: 2;
    opacity: 0;
    transition: opacity 0.1s ease;
  }
  .traffic-light-group:hover .traffic-dot svg {
    opacity: 1;
  }
  .traffic-dot:hover {
    filter: brightness(1.05);
  }
  .dot-red svg { color: #6b1410; }
  .dot-yellow svg { color: #7a5208; }
  .dot-green svg { color: #1a5c12; }

  /* ── Window title ──────────────────────────────────────────── */
  .title-bar-title {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    font-family: -apple-system, "Lucida Grande", "Segoe UI", sans-serif;
    font-size: 12px;
    font-weight: 700;
    color: #4a4a4a;
    letter-spacing: 0.3px;
    text-shadow: 0 1px 0 rgba(255, 255, 255, 0.7);
    pointer-events: none;
    white-space: nowrap;
  }
</style>
