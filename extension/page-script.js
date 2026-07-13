// Runs in the page's MAIN world, injected at document_start — before React
// loads. Installs a minimal object satisfying React's own
// `injectInternals()` contract (see react-reconciler's
// ReactFiberDevToolsHook.js) so React calls `.inject()` and
// `.onCommitFiberRoot()` on it directly, with zero dependency on the real
// React DevTools extension being installed. Confirmed empirically: this
// fires on every commit with a live, current Fiber tree.
(function () {
  if (window.__ZDT_INSTALLED__) return;
  window.__ZDT_INSTALLED__ = true;

  // React's internal hook linked list mixes real application values in with
  // its own plumbing: Effect nodes (useEffect/useLayoutEffect — tagged
  // objects with `create`/`destroy`/`next`), useMemo/useCallback dependency
  // arrays, and a `{current: {hasValue, value}}` ref pattern
  // useSyncExternalStoreWithSelector uses internally to track its last
  // snapshot. None of that is state a developer wants to see — filtering it
  // out is what makes the difference between a usable panel and a wall of
  // React internals. Confirmed empirically against the actual hook shapes
  // Zustand produces (test-app/index.html), not guessed.
  function isEffectListNode(v) {
    return (
      v &&
      typeof v === "object" &&
      "tag" in v &&
      "next" in v &&
      ("create" in v || "destroy" in v)
    );
  }

  function isDepsArrayShape(v) {
    // useMemo/useCallback's memoizedState is [value, depsArray] — but the
    // specific noisy shape we're excluding here is the doubly-nested
    // internal deps-of-deps array useSyncExternalStoreWithSelector builds,
    // recognizable as an array of two arrays with no primitive payload.
    return (
      Array.isArray(v) &&
      v.length === 2 &&
      Array.isArray(v[0]) &&
      Array.isArray(v[1])
    );
  }

  function isSnapshotRefShape(v) {
    return (
      v &&
      typeof v === "object" &&
      Object.keys(v).length === 1 &&
      v.current &&
      typeof v.current === "object" &&
      "hasValue" in v.current
    );
  }

  // Every React element carries `$$typeof: Symbol(react.transitional.element)`.
  // Object.keys() still surfaces "$$typeof" as a normal string key, so without
  // this check its Symbol *value* would flow straight into the rebuilt output
  // below and make window.postMessage throw DataCloneError — permanently,
  // silently killing every future STATE_UPDATE (confirmed: this is what made
  // the panel look completely dead against a real React app).
  function isReactElementLike(v) {
    return typeof v.$$typeof === "symbol";
  }

  function safeValue(v, depth) {
    if (depth > 4) return "[nested]";
    if (v === null || v === undefined) return null;
    const t = typeof v;
    if (t === "function" || t === "symbol") return undefined; // filtered out by caller
    if (t !== "object") return v;
    if (isReactElementLike(v)) return "[react element]";
    try {
      if (Array.isArray(v)) return v.slice(0, 20).map((x) => safeValue(x, depth + 1));
      const out = {};
      for (const k of Object.keys(v).slice(0, 20)) {
        const sv = safeValue(v[k], depth + 1);
        if (sv !== undefined) out[k] = sv;
      }
      return out;
    } catch (e) {
      return "[unserializable]";
    }
  }

  // Walk hook memoizedState linked list for a fiber, returning only the
  // application-relevant values (real state/selector results), with
  // React's own internal hook plumbing filtered out — see above.
  function readHookValues(fiber) {
    const values = [];
    let hook = fiber.memoizedState;
    let guard = 0;
    while (hook && guard < 25) {
      const raw = hook.memoizedState;
      if (!isEffectListNode(raw) && !isDepsArrayShape(raw) && !isSnapshotRefShape(raw)) {
        const sv = safeValue(raw, 0);
        if (sv !== undefined) values.push(sv);
      }
      hook = hook.next;
      guard++;
    }
    return values;
  }

  // Hard cap on top of the existing depth-4/20-item slicing: a pathological
  // tree (thousands of components) shouldn't be able to flood postMessage
  // or make the panel unresponsive.
  const MAX_COMPONENTS = 300;

  function walk(fiber, depth, out) {
    if (!fiber || depth > 40 || out.length >= MAX_COMPONENTS) return;
    const name =
      typeof fiber.type === "function"
        ? fiber.type.displayName || fiber.type.name
        : null;
    if (name) {
      const values = readHookValues(fiber);
      if (values.length) {
        out.push({ component: name, values: values });
      }
    }
    walk(fiber.child, depth + 1, out);
    walk(fiber.sibling, depth + 1, out);
  }

  // Only the fiber-walk itself is gated behind an active DevTools
  // connection — walking + posting on every commit of every page load,
  // forever, even with DevTools closed, was wasted work on every website
  // for every install and the kind of always-on <all_urls> content-script
  // behavior Chrome reviewers scrutinize. The hook registration above stays
  // unconditional since it's a no-op until React actually calls it.
  let active = false;
  let lastRoot = null;
  let rendererVersion;
  let rendererKnown = false;

  function announceRenderer() {
    window.postMessage(
      { source: "zustand-devtools-page", type: "RENDERER_DETECTED", version: rendererVersion },
      "*"
    );
  }

  let pending = false;
  function scheduleReport(root) {
    lastRoot = root;
    if (!active || pending) return;
    pending = true;
    // Report on next microtask so we read post-commit state, not mid-commit.
    Promise.resolve().then(() => {
      pending = false;
      const components = [];
      try {
        walk(root.current, 0, components);
      } catch (e) {
        // fail safe — never let a walking bug break the inspected page
      }
      try {
        window.postMessage(
          { source: "zustand-devtools-page", type: "STATE_UPDATE", components: components },
          "*"
        );
      } catch (e) {
        // fail safe — one unclonable value must not permanently kill every
        // future update (this is the exact failure mode the $$typeof fix
        // above addresses; this catch is the last-resort backstop for
        // whatever shape we haven't seen yet)
      }
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "zustand-devtools-control") return;
    if (data.type === "ACTIVATE") {
      active = true;
      if (rendererKnown) announceRenderer();
      if (lastRoot) scheduleReport(lastRoot);
    } else if (data.type === "DEACTIVATE") {
      active = false;
    }
  });

  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject: function (internals) {
      rendererKnown = true;
      rendererVersion = internals && internals.version;
      if (active) announceRenderer();
      return 1;
    },
    onCommitFiberRoot: function (rendererID, root) {
      scheduleReport(root);
    },
    onCommitFiberUnmount: function () {},
  };
})();
