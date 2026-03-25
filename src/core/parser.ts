/**
 * Template Parser — walks the DOM, detects which state each node references,
 * stamps data-scope automatically, and wires scoped reactive bindings.
 *
 * Supported syntax:
 *   {{ expr }}         — text interpolation
 *   :attr="expr"       — attribute binding
 *   :class="expr"      — class binding
 *   :style="expr"      — style object binding
 *   :model="expr"      — two-way input binding
 *   :show="expr"       — visibility (display toggle)
 *   :html="expr"       — inner HTML (sanitized)
 *   @event="statement" — event handler
 *
 * Performance model:
 *   - State-name regexes are compiled once per name and reused across all nodes.
 *   - Each DOM node is bound only to the states it actually references.
 *   - collectExprs + detectNodeScope are merged into a single pass so each node's
 *     attributes and text content are scanned exactly once.
 *   - parseInterpolations returns [] on plain strings (no regex cost).
 *   - Expression compilation uses destructured parameters instead of `with()`,
 *     allowing V8 to optimise the generated function body.
 *   - Expressions are cached by (scopeKeys + expr) so each unique combination
 *     compiles exactly once.
 *   - Live NodeList / NamedNodeMap iteration avoids Array.from() allocations.
 *
 * SEO:
 *   The initial HTML is left intact — {{ }} expressions are resolved on
 *   DOMContentLoaded, so server-rendered content is visible before JS runs.
 *
 * Security:
 *   - Expressions run inside new Function() with a sandboxed destructured scope.
 *   - No eval(), no global access beyond the registered state names.
 *   - :html uses the existing sanitizeHtml pipeline from bind.ts.
 *   - Event handlers receive only the state scope + $event.
 */

import { bindText, bindAttr, bindStyles, bindHTML, bindInput } from "./bind";
import { bindAction } from "./action";
import { effect } from "./effect";
import { evaluate, execute, parseInterpolations } from "./expression";
import {
  buildScope,
  getStateNames,
  registerState,
  discoverWindowStates,
} from "./registry";

// ── Constants ────────────────────────────────────────────────────────────────

const SCOPE_ATTR = "data-scope";

// ── Regex cache ───────────────────────────────────────────────────────────────

/**
 * Pre-compiled word-boundary regexes, one per registered state name.
 * Built once in walkTree and reused for every node in the subtree.
 * Avoids constructing `new RegExp(...)` inside the hot per-node loop.
 */
function buildNameRegexes(names: string[]): Map<string, RegExp> {
  const map = new Map<string, RegExp>();
  for (const name of names) {
    map.set(name, new RegExp(`\\b${name}\\b`));
  }
  return map;
}

// ── Scope detection ──────────────────────────────────────────────────────────

/**
 * Given a list of expression strings and the pre-compiled name regexes,
 * return which state names are referenced.
 */
function extractRefs(
  exprs: string[],
  names: string[],
  nameRegexes: Map<string, RegExp>,
): string[] {
  if (exprs.length === 0) return [];
  const refs = new Set<string>();
  for (const name of names) {
    const re = nameRegexes.get(name)!;
    for (const expr of exprs) {
      if (re.test(expr)) {
        refs.add(name);
        break; // no need to test remaining exprs for this name
      }
    }
  }
  return Array.from(refs).sort();
}

/**
 * Collect all expression strings from a node's text content and attributes.
 * Single-pass — used both for ref detection and for binding setup.
 */
function collectExprs(node: Element | Text): string[] {
  const exprs: string[] = [];

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    const parts = parseInterpolations(text);
    for (const p of parts) {
      if (p.type === "expr") exprs.push(p.value);
    }
    return exprs;
  }

  const el = node as Element;

  // Text content interpolations in direct child text nodes
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i];
    if (child.nodeType === Node.TEXT_NODE) {
      const parts = parseInterpolations(child.textContent ?? "");
      for (const p of parts) {
        if (p.type === "expr") exprs.push(p.value);
      }
    }
  }

  // Attribute expressions — iterate live NamedNodeMap directly (no Array.from)
  const attrs = el.attributes;
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i];
    if (attr.name.startsWith("@") || attr.name.startsWith(":")) {
      exprs.push(attr.value);
    } else {
      const parts = parseInterpolations(attr.value);
      for (const p of parts) {
        if (p.type === "expr") exprs.push(p.value);
      }
    }
  }

  return exprs;
}

// ── Node processors ──────────────────────────────────────────────────────────

function processTextNode(
  node: Text,
  scope: Record<string, any>,
): (() => void) | null {
  const raw = node.textContent ?? "";
  const parts = parseInterpolations(raw);
  if (parts.length === 0) return null;

  if (parts.length === 1 && parts[0].type === "expr") {
    const expr = parts[0].value;
    return bindText(node as unknown as Element, () => evaluate(expr, scope));
  }

  return effect(() => {
    node.textContent = parts
      .map((p) =>
        p.type === "static" ? p.value : String(evaluate(p.value, scope) ?? ""),
      )
      .join("");
  });
}

function processElement(
  el: Element,
  scope: Record<string, any>,
): (() => void)[] {
  const cleanups: (() => void)[] = [];

  // Snapshot attribute names+values before we start removing directive attrs.
  // We iterate the snapshot so removals don't shift the live NamedNodeMap indices.
  const attrs = el.attributes;
  const snapshot: { name: string; value: string }[] = [];
  for (let i = 0; i < attrs.length; i++) {
    snapshot.push({ name: attrs[i].name, value: attrs[i].value });
  }

  for (const { name, value } of snapshot) {
    // ── @event ───────────────────────────────────────────────────────────────
    if (name.startsWith("@")) {
      const event = name.slice(1);
      cleanups.push(
        bindAction(el as HTMLElement, event as any, (e: Event) => {
          execute(value, scope, e);
        }),
      );
      el.removeAttribute(name);
      continue;
    }

    // ── :directives ──────────────────────────────────────────────────────────
    if (name.startsWith(":")) {
      const directive = name.slice(1);
      el.removeAttribute(name);

      if (directive === "model") {
        const expr = value.trim();
        const dotIdx = expr.lastIndexOf(".");
        if (dotIdx !== -1) {
          const objExpr = expr.slice(0, dotIdx);
          const key = expr.slice(dotIdx + 1);
          const obj = evaluate(objExpr, scope);
          if (obj && key in obj) {
            cleanups.push(bindInput(el as HTMLInputElement, obj, key as any));
          } else {
            console.warn(`[reactive] :model="${expr}" — could not resolve`);
          }
        } else {
          console.warn(
            `[reactive] :model="${expr}" — use "stateName.key" syntax`,
          );
        }
        continue;
      }

      if (directive === "show") {
        cleanups.push(
          effect(() => {
            (el as HTMLElement).style.display = evaluate(value, scope)
              ? ""
              : "none";
          }),
        );
        continue;
      }

      if (directive === "html") {
        cleanups.push(bindHTML(el, () => evaluate(value, scope)));
        continue;
      }

      if (directive === "class") {
        cleanups.push(
          effect(() => {
            const result = evaluate(value, scope);
            if (typeof result === "string") {
              el.className = result;
            } else if (result && typeof result === "object") {
              Object.entries(result).forEach(([cls, on]) =>
                on ? el.classList.add(cls) : el.classList.remove(cls),
              );
            }
          }),
        );
        continue;
      }

      if (directive === "style") {
        cleanups.push(bindStyles(el, () => evaluate(value, scope)));
        continue;
      }

      // generic :attr
      cleanups.push(bindAttr(el, directive, () => evaluate(value, scope)));
      continue;
    }

    // ── inline {{ }} in attribute values ─────────────────────────────────────
    const parts = parseInterpolations(value);
    if (parts.length > 0) {
      cleanups.push(
        effect(() => {
          el.setAttribute(
            name,
            parts
              .map((p) =>
                p.type === "static"
                  ? p.value
                  : String(evaluate(p.value, scope) ?? ""),
              )
              .join(""),
          );
        }),
      );
    }
  }

  return cleanups;
}

// ── Tree walker ───────────────────────────────────────────────────────────────

/**
 * Walk a DOM subtree, auto-detect which state each node references,
 * stamp data-scope, and wire scoped bindings.
 *
 * @param root        — root element to parse
 * @param scope       — merged state scope { counter: {...}, user: {...} }
 * @param names       — known state names for scope detection
 * @param nameRegexes — pre-compiled word-boundary regexes (one per name)
 */
function walkTree(
  root: Element | Document,
  scope: Record<string, any>,
  names: string[],
  nameRegexes: Map<string, RegExp>,
): () => void {
  const cleanups: (() => void)[] = [];

  const walker = document.createTreeWalker(
    root as Node,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    null,
  );

  let node: Node | null = walker.nextNode();

  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      const exprs = collectExprs(text);
      const refs = extractRefs(exprs, names, nameRegexes);
      if (refs.length > 0) {
        const nodeScope = buildNodeScope(refs, scope);
        const stop = processTextNode(text, nodeScope);
        if (stop) cleanups.push(stop);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const exprs = collectExprs(el);
      const refs = extractRefs(exprs, names, nameRegexes);
      if (refs.length > 0) {
        // Merge with any existing data-scope value so repeated parse() calls
        // on the same element accumulate scope names rather than replacing them.
        const existing = el.getAttribute(SCOPE_ATTR);
        const merged = existing
          ? Array.from(new Set([...existing.split(" "), ...refs]))
              .sort()
              .join(" ")
          : refs.join(" ");
        el.setAttribute(SCOPE_ATTR, merged);
        const nodeScope = buildNodeScope(refs, scope);
        cleanups.push(...processElement(el, nodeScope));
      }
    }
    node = walker.nextNode();
  }

  return () => cleanups.forEach((s) => s());
}

/**
 * Build a scope object containing only the referenced state names.
 * Keeps the expression sandbox minimal — no access to unreferenced states.
 */
function buildNodeScope(
  refs: string[],
  fullScope: Record<string, any>,
): Record<string, any> {
  const scope: Record<string, any> = {};
  for (const name of refs) {
    if (name in fullScope) scope[name] = fullScope[name];
  }
  return scope;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * mount() — the recommended single entry point for browser usage.
 *
 * Registers named states and immediately parses the DOM.
 * Replaces the need for stack-trace inference which is unreliable
 * in minified/production builds.
 *
 * @example
 * const counter = reactive({ count: 0 });
 * const user    = reactive({ name: 'Ali' });
 * mount({ counter, user });
 */
export function mount(
  states: Record<string, Record<string, any>>,
  root: Element = document.body,
): () => void {
  _explicitMountCalled = true;
  Object.entries(states).forEach(([name, state]) => registerState(name, state));
  return autoMount(root);
}

/**
 * Parse a DOM subtree against an explicit scope.
 * Low-level — prefer mount() for browser usage.
 */
export function parse(
  root: Element | Document,
  scope: Record<string, any>,
): () => void {
  const names = Object.keys(scope);
  const nameRegexes = buildNameRegexes(names);
  return walkTree(root, scope, names, nameRegexes);
}

/**
 * Auto-mount: reads the global registry, builds the scope,
 * and parses document.body. Called automatically on DOMContentLoaded.
 *
 * This is the zero-config entry point — just define reactive() states
 * and include the script. Nothing else needed.
 *
 * Calling autoMount() while a previous mount is still active will first
 * tear down the previous bindings before re-mounting.
 */
export function autoMount(root: Element = document.body): () => void {
  // Tear down any previous auto-mount before re-mounting.
  if (_autoMountCleanup) {
    _autoMountCleanup();
    _autoMountCleanup = null;
  }

  const scope = buildScope();
  const names = getStateNames();

  if (names.length === 0) {
    console.warn("[reactive] autoMount: no reactive states registered.");
    return () => {};
  }

  const nameRegexes = buildNameRegexes(names);
  const cleanup = walkTree(root, scope, names, nameRegexes);
  _autoMountCleanup = cleanup;
  // Reveal body — also set a hard fallback in case this path is skipped
  if (typeof document !== "undefined") {
    document.body.classList.add("r-ready");
  }
  return cleanup;
}

/**
 * Wire autoMount to run after all synchronous scripts have executed.
 * Uses queueMicrotask so that reactive() calls in the user's <script> tag
 * complete before the parser scans the DOM.
 */
let _autoMountCleanup: (() => void) | null = null;
let _autoMountPending = false;
// Set to true when mount() is called explicitly — prevents the deferred
// scheduleAutoMount microtask from tearing down and re-running the mount.
let _explicitMountCalled = false;

/**
 * Schedule a deferred autoMount. Safe to call multiple times —
 * only one mount will run per microtask checkpoint.
 * Called automatically by reactive() when it registers a state.
 * Skipped if mount() was already called explicitly by the user.
 */
export function scheduleAutoMount(): void {
  if (_autoMountPending || typeof window === "undefined") return;
  _autoMountPending = true;

  // Hard fallback: always reveal body within 300ms even if mount fails
  setTimeout(() => {
    if (typeof document !== "undefined") {
      document.body.classList.add("r-ready");
    }
  }, 300);

  const run = () => {
    _autoMountPending = false;
    // If the user already called mount() explicitly, don't override it.
    if (_explicitMountCalled) return;
    // Discover any reactive() objects assigned to window globals before
    // checking the registry — this is the zero-config auto-registration path.
    discoverWindowStates();
    if (getStateNames().length > 0) {
      _autoMountCleanup = autoMount();
    }
  };

  if (document.readyState === "loading") {
    // Scripts in <head> — wait for DOM
    document.addEventListener("DOMContentLoaded", () => queueMicrotask(run), {
      once: true,
    });
  } else {
    // Scripts at bottom of <body> or deferred — DOM ready, just wait for
    // remaining synchronous script to finish
    queueMicrotask(run);
  }
}

/**
 * Tear down all auto-mounted bindings (useful for SPA navigation or testing).
 */
export function unmount(): void {
  _autoMountCleanup?.();
  _autoMountCleanup = null;
  _explicitMountCalled = false;
}
