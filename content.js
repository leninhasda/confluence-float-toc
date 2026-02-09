(function () {
  "use strict";

  // ── Constants ──────────────────────────────────────────────────────────
  const TOC_SELECTORS = [
    'div.toc-macro',
    'div[data-macro-name="toc"]',
    'div.table-of-contents',
    'div.toc',
    'nav.toc',
  ];

  const COLLAPSE_DELAY_MS = 500;
  const RETRY_INTERVAL_MS = 2000;
  const MAX_RETRIES = 10;

  // ── State ──────────────────────────────────────────────────────────────
  let collapseTimer = null;
  let floatContainer = null;
  let isExpanded = false;

  // ── TOC Detection ─────────────────────────────────────────────────────
  /**
   * Try each known selector pattern and return the first TOC element found.
   * Returns null when the page has no table-of-contents macro.
   */
  function detectTocElement() {
    for (const selector of TOC_SELECTORS) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  // ── TOC Parsing ───────────────────────────────────────────────────────
  /**
   * Walk the TOC element tree and extract an array of { text, href, level }.
   * `level` is the nesting depth (1-based) so the UI can indent sub-items.
   */
  function parseTocItems(tocElement) {
    const items = [];

    // Confluence TOC macros render nested <ul> / <ol> lists with <a> links.
    const links = tocElement.querySelectorAll("a");
    if (links.length === 0) return items;

    links.forEach((link) => {
      const text = link.textContent.trim();
      const href = link.getAttribute("href");
      if (!text || !href) return;

      // Determine nesting level by counting ancestor <ul> / <ol> inside the TOC
      let level = 0;
      let parent = link.parentElement;
      while (parent && parent !== tocElement) {
        if (parent.tagName === "UL" || parent.tagName === "OL") {
          level++;
        }
        parent = parent.parentElement;
      }
      // Normalise so the outermost list starts at level 1
      items.push({ text, href, level: Math.max(level, 1) });
    });

    // Normalise levels so the minimum is always 1
    if (items.length > 0) {
      const minLevel = Math.min(...items.map((i) => i.level));
      if (minLevel > 1) {
        items.forEach((i) => (i.level -= minLevel - 1));
      }
    }

    return items;
  }

  // ── Floating UI Construction ──────────────────────────────────────────
  /**
   * Build the floating TOC container and append it to <body>.
   */
  function createFloatingToc(tocItems) {
    // Prevent duplicate injection
    if (document.getElementById("cftoc-container")) return;

    // Wrapper
    const container = document.createElement("div");
    container.id = "cftoc-container";
    container.className = "cftoc-collapsed";
    container.setAttribute("role", "navigation");
    container.setAttribute("aria-label", "Table of Contents");

    // Minimal bar indicator (visible when collapsed)
    const bar = document.createElement("div");
    bar.id = "cftoc-bar";
    bar.title = "Table of Contents";

    // Small label rotated vertically
    const barLabel = document.createElement("span");
    barLabel.id = "cftoc-bar-label";
    barLabel.textContent = "TOC";
    bar.appendChild(barLabel);
    container.appendChild(bar);

    // Expanded panel
    const panel = document.createElement("div");
    panel.id = "cftoc-panel";

    // Panel header
    const header = document.createElement("div");
    header.id = "cftoc-header";
    header.textContent = "Table of Contents";
    panel.appendChild(header);

    // List of links
    const list = document.createElement("ul");
    list.id = "cftoc-list";

    tocItems.forEach((item) => {
      const li = document.createElement("li");
      li.className = "cftoc-item cftoc-level-" + item.level;

      const a = document.createElement("a");
      a.href = item.href;
      a.textContent = item.text;
      a.title = item.text;
      // Let the browser handle native navigation – no preventDefault

      li.appendChild(a);
      list.appendChild(li);
    });

    panel.appendChild(list);
    container.appendChild(panel);

    // ── Event Listeners ────────────────────────────────────────────────
    container.addEventListener("mouseenter", handleMouseEnter);
    container.addEventListener("mouseleave", handleMouseLeave);

    document.body.appendChild(container);
    floatContainer = container;
  }

  // ── Hover / Expand / Collapse Logic ───────────────────────────────────
  function expand() {
    if (!floatContainer || isExpanded) return;
    isExpanded = true;
    floatContainer.classList.remove("cftoc-collapsed");
    floatContainer.classList.add("cftoc-expanded");
  }

  function collapse() {
    if (!floatContainer || !isExpanded) return;
    isExpanded = false;
    floatContainer.classList.remove("cftoc-expanded");
    floatContainer.classList.add("cftoc-collapsed");
  }

  function handleMouseEnter() {
    clearTimeout(collapseTimer);
    collapseTimer = null;
    expand();
  }

  function handleMouseLeave() {
    clearTimeout(collapseTimer);
    collapseTimer = setTimeout(collapse, COLLAPSE_DELAY_MS);
  }

  // ── Initialisation ───────────────────────────────────────────────────
  function init() {
    const tocElement = detectTocElement();
    if (!tocElement) return false;

    const items = parseTocItems(tocElement);
    if (items.length === 0) return false;

    createFloatingToc(items);
    return true;
  }

  /**
   * Confluence may load content dynamically (SPA navigation), so we retry
   * a few times with a delay before giving up.
   */
  function initWithRetry(attempt) {
    if (attempt > MAX_RETRIES) return;
    if (init()) return; // Success

    setTimeout(() => initWithRetry(attempt + 1), RETRY_INTERVAL_MS);
  }

  // Also watch for SPA-style page transitions that Confluence Cloud uses
  // by observing URL changes and re-initialising when needed.
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // Remove old float if present
      const existing = document.getElementById("cftoc-container");
      if (existing) existing.remove();
      floatContainer = null;
      isExpanded = false;
      initWithRetry(0);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Kick off
  initWithRetry(0);
})();
