const LEMON_SQUEEZY_CHECKOUT_URL = "https://zustand-devtools-app.lemonsqueezy.com/checkout/buy/2e844294-f46f-4786-b425-2b0245b58f3b";
const LEMON_SQUEEZY_ACTIVATE_URL = "https://api.lemonsqueezy.com/v1/licenses/activate";

document.documentElement.dataset.theme =
  chrome.devtools.panels.themeName === "dark" ? "dark" : "light";

const statusEl = document.getElementById("status");
const dotEl = document.getElementById("live-indicator");
const searchEl = document.getElementById("search");
const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const actionsListEl = document.getElementById("actions-list");
const actionsEmptyEl = document.getElementById("actions-empty");
const actionsToolbarEl = document.getElementById("actions-toolbar");
const exportBtn = document.getElementById("export-btn");
const paywallEl = document.getElementById("actions-paywall");
const licenseStatusEl = document.getElementById("license-status");
const buyBtn = document.getElementById("buy-btn");
const licenseInput = document.getElementById("license-input");
const activateBtn = document.getElementById("activate-btn");

const tabId = chrome.devtools.inspectedWindow.tabId;
const port = chrome.runtime.connect({ name: "zdt-panel-" + tabId });

let lastComponents = [];
const actionsByStore = new Map(); // store name -> [{actionName, state, timestamp}]
let licensed = false;
// Tracks which component names the user has manually collapsed. Without
// this, renderComponents() rebuilds the whole list from scratch on every
// STATE_UPDATE (which can fire many times a second for a live app), always
// defaulting back to expanded — the collapse affordance would self-undo
// almost immediately for anything that updates frequently.
const collapsedComponents = new Set();

// ---- Tabs ----
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });
});

// ---- Live State ----
searchEl.addEventListener("input", () => renderComponents());

function renderValue(value, container) {
  if (value === null || value === undefined) {
    const s = document.createElement("span");
    s.className = "v-null";
    s.textContent = "null";
    container.appendChild(s);
    return;
  }
  const t = typeof value;
  if (t === "string") {
    const s = document.createElement("span");
    s.className = "v-string";
    s.textContent = JSON.stringify(value);
    container.appendChild(s);
    return;
  }
  if (t === "number" || t === "boolean") {
    const s = document.createElement("span");
    s.className = "v-" + t;
    s.textContent = String(value);
    container.appendChild(s);
    return;
  }
  const entries = Array.isArray(value) ? value.map((v, i) => [i, v]) : Object.entries(value);
  const open = Array.isArray(value) ? "[" : "{";
  const close = Array.isArray(value) ? "]" : "}";
  if (!entries.length) {
    const s = document.createElement("span");
    s.className = "v-key";
    s.textContent = open + close;
    container.appendChild(s);
    return;
  }
  const details = document.createElement("details");
  details.open = true;
  const summary = document.createElement("summary");
  summary.textContent = `${open} ${entries.length} ${Array.isArray(value) ? "items" : "keys"} ${close}`;
  details.appendChild(summary);
  for (const [k, v] of entries) {
    const row = document.createElement("div");
    const keyEl = document.createElement("span");
    keyEl.className = "v-key";
    keyEl.textContent = k + ": ";
    row.appendChild(keyEl);
    renderValue(v, row);
    details.appendChild(row);
  }
  container.appendChild(details);
}

function renderComponents() {
  const filter = searchEl.value.trim().toLowerCase();
  const filtered = filter
    ? lastComponents.filter((c) => c.component.toLowerCase().includes(filter))
    : lastComponents;
  listEl.innerHTML = "";
  emptyEl.style.display = filtered.length ? "none" : "block";
  for (const c of filtered) {
    const div = document.createElement("div");
    div.className = "component";
    if (collapsedComponents.has(c.component)) div.classList.add("collapsed");
    const nameEl = document.createElement("div");
    nameEl.className = "component-name";
    nameEl.textContent = c.component;
    nameEl.addEventListener("click", () => {
      div.classList.toggle("collapsed");
      if (div.classList.contains("collapsed")) collapsedComponents.add(c.component);
      else collapsedComponents.delete(c.component);
    });
    const tree = document.createElement("div");
    tree.className = "value-tree";
    c.values.forEach((v, i) => {
      const row = document.createElement("div");
      const keyEl = document.createElement("span");
      keyEl.className = "v-key";
      keyEl.textContent = "#" + i + ": ";
      row.appendChild(keyEl);
      renderValue(v, row);
      tree.appendChild(row);
    });
    div.appendChild(nameEl);
    div.appendChild(tree);
    listEl.appendChild(div);
  }
}

// ---- Action Log (Phase 2 — requires the zustand-devtools-bridge package
// in the inspected app, and a valid license) ----

// Shallow top-level diff between two state snapshots — cheap and good
// enough since these are already-sanitized, flat-ish Zustand state objects,
// not a reason to pull in a deep-equal dependency.
function diffKeys(prev, next) {
  const before = prev && typeof prev === "object" ? prev : {};
  const after = next && typeof next === "object" ? next : {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes = [];
  for (const k of keys) {
    const a = before[k];
    const b = after[k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (!(k in before)) changes.push({ key: k, type: "added", after: b });
    else if (!(k in after)) changes.push({ key: k, type: "removed" });
    else changes.push({ key: k, type: "changed", before: a, after: b });
  }
  return changes;
}

function renderDiffLine(changes) {
  const line = document.createElement("div");
  line.className = "action-diff";
  if (!changes.length) {
    line.textContent = "(no change)";
    return line;
  }
  changes.forEach((c, i) => {
    if (i > 0) line.appendChild(document.createTextNode("   "));
    const keyEl = document.createElement("span");
    keyEl.className = "v-key";
    if (c.type === "added") {
      keyEl.textContent = "+ " + c.key + ": ";
      line.appendChild(keyEl);
      renderValue(c.after, line);
    } else if (c.type === "removed") {
      keyEl.textContent = "− " + c.key;
      line.appendChild(keyEl);
    } else {
      keyEl.textContent = c.key + ": ";
      line.appendChild(keyEl);
      renderValue(c.before, line);
      const arrow = document.createElement("span");
      arrow.className = "v-key";
      arrow.textContent = " → ";
      line.appendChild(arrow);
      renderValue(c.after, line);
    }
  });
  return line;
}

function flattenActionLog() {
  const flat = [];
  for (const [store, entries] of actionsByStore) {
    for (const e of entries) flat.push({ store, ...e });
  }
  flat.sort((a, b) => a.timestamp - b.timestamp);
  return flat;
}

function renderActionLog() {
  if (!licensed) return; // paywall stays up; nothing to render underneath it
  const flat = flattenActionLog();
  actionsEmptyEl.style.display = flat.length ? "none" : "block";
  actionsListEl.innerHTML = "";
  const lastStateByStore = new Map();
  for (const entry of flat) {
    const row = document.createElement("div");
    row.className = "action-entry";
    row.title = "Click to time-travel to this state";

    const header = document.createElement("div");
    header.className = "action-header";
    const storeEl = document.createElement("span");
    storeEl.className = "action-store";
    storeEl.textContent = entry.store;
    const nameEl = document.createElement("span");
    nameEl.className = "action-name";
    nameEl.textContent = entry.actionName;
    const timeEl = document.createElement("span");
    timeEl.className = "action-time";
    timeEl.textContent = new Date(entry.timestamp).toLocaleTimeString();
    header.append(storeEl, nameEl, timeEl);
    row.appendChild(header);

    if (lastStateByStore.has(entry.store)) {
      row.appendChild(renderDiffLine(diffKeys(lastStateByStore.get(entry.store), entry.state)));
    }
    lastStateByStore.set(entry.store, entry.state);

    row.addEventListener("click", () => {
      try {
        port.postMessage({ type: "TIME_TRAVEL_JUMP", store: entry.store, state: entry.state });
      } catch (e) {
        // Port already disconnected (e.g. the service worker restarted) —
        // nothing to recover into here; the disconnect handler below
        // already reflects this in the status text.
      }
    });
    actionsListEl.appendChild(row);
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch (e2) {
      return false;
    }
  }
}

exportBtn.addEventListener("click", async () => {
  const ok = await copyText(JSON.stringify(flattenActionLog(), null, 2));
  exportBtn.textContent = ok ? "Copied!" : "Copy failed";
  setTimeout(() => {
    exportBtn.textContent = "Export JSON";
  }, 1500);
});

function recordAction(msg) {
  const list = actionsByStore.get(msg.store) || [];
  list.push({ actionName: msg.actionName, state: msg.state, timestamp: msg.timestamp });
  actionsByStore.set(msg.store, list);
  renderActionLog();
}

function recordHistory(msg) {
  // Merge rather than overwrite — a live ACTION message for this store can
  // arrive in the brief window between sending REQUEST_HISTORY and
  // receiving this reply; blindly replacing the array would silently drop
  // it. Dedup by actionName+timestamp and keep chronological order.
  const existing = actionsByStore.get(msg.store) || [];
  const merged = new Map();
  for (const e of existing) merged.set(e.actionName + "@" + e.timestamp, e);
  for (const e of msg.entries || []) merged.set(e.actionName + "@" + e.timestamp, e);
  actionsByStore.set(
    msg.store,
    Array.from(merged.values()).sort((a, b) => a.timestamp - b.timestamp)
  );
  renderActionLog();
}

// ---- Licensing (Lemon Squeezy license-key check, no custom backend) ----
function setLicensedUI(isLicensed) {
  licensed = isLicensed;
  paywallEl.style.display = isLicensed ? "none" : "block";
  actionsToolbarEl.style.display = isLicensed ? "flex" : "none";
  renderActionLog();
}

chrome.storage.local.get("zdtLicense", ({ zdtLicense }) => {
  setLicensedUI(Boolean(zdtLicense && zdtLicense.valid));
});

buyBtn.addEventListener("click", () => {
  if (!LEMON_SQUEEZY_CHECKOUT_URL) {
    licenseStatusEl.textContent = "Checkout isn't set up yet — see MONETIZATION.md.";
    return;
  }
  chrome.tabs.create({ url: LEMON_SQUEEZY_CHECKOUT_URL });
});

activateBtn.addEventListener("click", async () => {
  const key = licenseInput.value.trim();
  if (!key) return;
  licenseStatusEl.textContent = "Validating…";
  try {
    // /activate (not /validate) — this registers a license-key *instance*
    // against Lemon Squeezy's own activation_limit for the product.
    // Calling /validate alone never registers an instance, so
    // activation_usage stays at 0 forever and the same key could be typed
    // into an unlimited number of installs with no enforcement at all.
    const res = await fetch(LEMON_SQUEEZY_ACTIVATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ license_key: key, instance_name: "Zustand DevTools" }),
    });
    const data = await res.json();
    if (data && data.activated) {
      await chrome.storage.local.set({
        zdtLicense: { valid: true, key, instanceId: data.instance && data.instance.id },
      });
      licenseStatusEl.textContent = "License activated.";
      setLicensedUI(true);
    } else {
      licenseStatusEl.textContent = (data && data.error) || "That license key isn't valid.";
    }
  } catch (e) {
    licenseStatusEl.textContent = "Couldn't reach the license server — check your connection.";
  }
});

renderComponents(); // show the empty state immediately, before any data arrives

// A fresh top-level navigation of the inspected tab is a clean-slate signal
// — without this, Action Log/Live State entries from whatever page was
// open before would stay mixed in with an unrelated new page's entries for
// as long as DevTools itself stays open, since actionsByStore/lastComponents
// are otherwise only ever appended to, never reset. content-script.js's
// ready-handshake (fired on injection into the new page) re-sends
// ACTIVATE + REQUEST_HISTORY shortly after this, so a same-origin reload's
// persisted history correctly repopulates; a different origin correctly
// stays empty.
if (chrome.devtools.network && chrome.devtools.network.onNavigated) {
  chrome.devtools.network.onNavigated.addListener(() => {
    actionsByStore.clear();
    lastComponents = [];
    statusEl.textContent = "Waiting for a React renderer on this page…";
    dotEl.classList.remove("live");
    dotEl.title = "Not connected";
    renderComponents();
    renderActionLog();
  });
}

// ---- Port messages from background (relayed from the inspected page) ----
port.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.type === "RENDERER_DETECTED") {
    statusEl.textContent = "React " + (msg.version || "?") + " detected — live state below.";
    dotEl.classList.add("live");
    dotEl.title = "Connected";
  } else if (msg.type === "STATE_UPDATE") {
    lastComponents = msg.components || [];
    renderComponents();
  } else if (msg.type === "ACTION") {
    recordAction(msg);
  } else if (msg.type === "HISTORY") {
    recordHistory(msg);
  }
});

port.onDisconnect.addListener(() => {
  // The service worker died/restarted or the tab closed — without this the
  // panel would just silently freeze on stale data with no indication
  // anything's wrong. Reopening DevTools reconnects a fresh port.
  statusEl.textContent = "Disconnected — reopen DevTools to reconnect.";
  dotEl.classList.remove("live");
  dotEl.title = "Disconnected";
});
