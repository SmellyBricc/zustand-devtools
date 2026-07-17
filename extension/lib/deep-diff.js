// Deep structural diff over display-encoded state trees (see the bridge's
// encodeForDisplay). Produces dot/bracket paths like "cart.items[3].quantity".
//
// Rules:
// - Plain objects and arrays are descended into.
// - Encoder markers ({__zdt: ...}: dates, maps, sets, functions, redacted,
//   truncation, etc.) are treated as LEAF values compared structurally — a
//   changed Map reports the map's own path, honestly, instead of pretending
//   we can path into a serialized copy.
// - Never uses JSON.stringify for comparison; a structural walk with depth
//   and output caps keeps pathological input from freezing the panel.

const MAX_DEPTH = 12;
const MAX_CHANGES = 500;

export function isMarker(v) {
  return !!v && typeof v === "object" && !Array.isArray(v) && typeof v.__zdt === "string";
}

function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Structural equality for leaf values (primitives, markers, mixed trees).
 * Depth-guarded; anything deeper than the guard is treated as unequal-if-
 * uncertain (returns false) so a change is surfaced rather than hidden. */
export function structuralEqual(a, b, depth = 0) {
  if (Object.is(a, b)) return true;
  if (depth > MAX_DEPTH) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!structuralEqual(a[i], b[i], depth + 1)) return false;
    }
    return true;
  }
  if (isPlainObject(a)) {
    if (!isPlainObject(b)) return false;
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!structuralEqual(a[k], b[k], depth + 1)) return false;
    }
    return true;
  }
  return false;
}

/**
 * Diff two display trees.
 * @returns {{ changes: Array<{path: string, kind: 'added'|'removed'|'changed', before?: unknown, after?: unknown}>, truncated: boolean }}
 */
export function deepDiff(before, after) {
  const changes = [];
  let truncated = false;

  function push(path, kind, b, a) {
    if (changes.length >= MAX_CHANGES) {
      truncated = true;
      return false;
    }
    const change = { path: path || "(root)", kind };
    if (kind !== "added") change.before = b;
    if (kind !== "removed") change.after = a;
    changes.push(change);
    return true;
  }

  function walk(b, a, path, depth) {
    if (changes.length >= MAX_CHANGES) {
      truncated = true;
      return;
    }
    if (Object.is(b, a)) return;

    const bothArrays = Array.isArray(b) && Array.isArray(a);
    const bothObjects = isPlainObject(b) && isPlainObject(a) && !isMarker(b) && !isMarker(a);

    if (depth >= MAX_DEPTH || (!bothArrays && !bothObjects)) {
      if (!structuralEqual(b, a)) push(path, "changed", b, a);
      return;
    }

    if (bothArrays) {
      const max = Math.max(b.length, a.length);
      for (let i = 0; i < max; i++) {
        const p = `${path}[${i}]`;
        if (i >= b.length) {
          if (!push(p, "added", undefined, a[i])) return;
        } else if (i >= a.length) {
          if (!push(p, "removed", b[i], undefined)) return;
        } else {
          walk(b[i], a[i], p, depth + 1);
        }
      }
      return;
    }

    // plain objects
    const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
    for (const k of keys) {
      const p = path ? `${path}.${k}` : k;
      const inB = Object.prototype.hasOwnProperty.call(b, k);
      const inA = Object.prototype.hasOwnProperty.call(a, k);
      if (!inB) {
        if (!push(p, "added", undefined, a[k])) return;
      } else if (!inA) {
        if (!push(p, "removed", b[k], undefined)) return;
      } else {
        walk(b[k], a[k], p, depth + 1);
      }
    }
  }

  walk(before, after, "", 0);
  return { changes, truncated };
}

/** Render a display value as a short single-line text label (no HTML). */
export function shortLabel(v, max = 60) {
  let s;
  if (v === null) s = "null";
  else if (v === undefined) s = "—";
  else if (typeof v === "string") s = JSON.stringify(v);
  else if (typeof v !== "object") s = String(v);
  else if (isMarker(v)) {
    switch (v.__zdt) {
      case "date": s = `Date(${v.v})`; break;
      case "map": s = `Map(${v.size})`; break;
      case "set": s = `Set(${v.size})`; break;
      case "regexp": s = String(v.v); break;
      case "fn": s = `ƒ ${v.name || ""}`.trim(); break;
      case "bigint": s = `${v.v}n`; break;
      case "num": s = String(v.v); break;
      case "undef": s = "undefined"; break;
      case "redacted": s = "•• redacted ••"; break;
      case "cycle": s = "(circular)"; break;
      case "deep": s = "(deeper than capture)"; break;
      case "truncated": s = `(+${(v.total || 0) - (v.kept || 0)} more)`; break;
      case "react": s = "(react element)"; break;
      default: s = `(${v.__zdt})`;
    }
  } else if (Array.isArray(v)) s = `Array(${v.length})`;
  else s = `{${Object.keys(v).slice(0, 3).join(", ")}${Object.keys(v).length > 3 ? ", …" : ""}}`;
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
