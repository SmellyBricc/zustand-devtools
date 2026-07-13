// Filled in once the Lemon Squeezy product exists — see MONETIZATION.md.
// Until then the paywall still renders correctly; "Buy" just has nowhere
// real to send the user yet.
const LEMON_SQUEEZY_CHECKOUT_URL = "";
const LEMON_SQUEEZY_VALIDATE_URL = "https://api.lemonsqueezy.com/v1/licenses/validate";

document.documentElement.dataset.theme =
  chrome.devtools.panels.themeName === "dark" ? "dark" : "light";

const statusEl = document.getElementById("status");
const dotEl = document.getElementById("live-indicator");
const searchEl = document.getElementById("search");
const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const actionsListEl = document.getElementById("actions-list");
const actionsEmptyEl = document.getElementById("actions-empty");
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
    const nameEl = document.createElement("div");
    nameEl.className = "component-name";
    nameEl.textContent = c.component;
    nameEl.addEventListener("click", () => div.classList.toggle("collapsed"));
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
function renderActionLog() {
  if (!licensed) return; // paywall stays up; nothing to render underneath it
  const flat = [];
  for (const [store, entries] of actionsByStore) {
    for (const e of entries) flat.push({ store, ...e });
  }
  flat.sort((a, b) => a.timestamp - b.timestamp);
  actionsEmptyEl.style.display = flat.length ? "none" : "block";
  actionsListEl.innerHTML = "";
  for (const entry of flat) {
    const row = document.createElement("div");
    row.className = "action-entry";
    row.title = "Click to time-travel to this state";
    const storeEl = document.createElement("span");
    storeEl.className = "action-store";
    storeEl.textContent = entry.store;
    const nameEl = document.createElement("span");
    nameEl.className = "action-name";
    nameEl.textContent = entry.actionName;
    const timeEl = document.createElement("span");
    timeEl.className = "action-time";
    timeEl.textContent = new Date(entry.timestamp).toLocaleTimeString();
    row.append(storeEl, nameEl, timeEl);
    row.addEventListener("click", () => {
      port.postMessage({ type: "TIME_TRAVEL_JUMP", store: entry.store, state: entry.state });
    });
    actionsListEl.appendChild(row);
  }
}

function recordAction(msg) {
  const list = actionsByStore.get(msg.store) || [];
  list.push({ actionName: msg.actionName, state: msg.state, timestamp: msg.timestamp });
  actionsByStore.set(msg.store, list);
  renderActionLog();
}

function recordHistory(msg) {
  actionsByStore.set(msg.store, (msg.entries || []).slice());
  renderActionLog();
}

// ---- Licensing (Lemon Squeezy license-key check, no custom backend) ----
function setLicensedUI(isLicensed) {
  licensed = isLicensed;
  paywallEl.style.display = isLicensed ? "none" : "block";
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
    const res = await fetch(LEMON_SQUEEZY_VALIDATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ license_key: key }),
    });
    const data = await res.json();
    if (data && data.valid) {
      await chrome.storage.local.set({ zdtLicense: { valid: true, key } });
      licenseStatusEl.textContent = "License activated.";
      setLicensedUI(true);
    } else {
      licenseStatusEl.textContent = "That license key isn't valid.";
    }
  } catch (e) {
    licenseStatusEl.textContent = "Couldn't reach the license server — check your connection.";
  }
});

renderComponents(); // show the empty state immediately, before any data arrives

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
