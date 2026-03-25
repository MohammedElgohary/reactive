/**
 * Expression evaluator — safely evaluates template expressions against a state scope.
 * Used by the template parser to resolve {{ expr }} and directive values.
 *
 * Performance notes:
 *   - Compiled functions are cached by expression string — each unique expression
 *     is compiled exactly once via `new Function`, regardless of how many nodes use it.
 *   - Destructured-parameter style is used instead of `with()` so V8 can optimise
 *     the generated function body normally.
 *   - `parseInterpolations` returns [] when there are no {{ }} tokens, so callers
 *     can skip further work with a single `.length` check.
 */

// ── Cache ────────────────────────────────────────────────────────────────────

// Two separate maps avoid the fragile "__stmt__" prefix key-collision risk.
const exprCache = new Map<string, (state: Record<string, any>) => any>();
const stmtCache = new Map<
  string,
  (state: Record<string, any>, event?: Event) => void
>();

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a sandboxed function for an expression (read-only evaluation).
 *
 * Uses destructured parameters so V8 can optimise the generated function body.
 * e.g. keys = ["counter","user"]  →  ({ counter, user }) => (expr)
 *
 * Destructuring is safe for expressions because they only read values.
 */
function buildExprFn(
  keys: string[],
  expr: string,
): (state: Record<string, any>) => any {
  const param = keys.length ? `{ ${keys.join(", ")} }` : "_";
  return new Function(param, `return (${expr})`) as (
    state: Record<string, any>,
  ) => any;
}

/**
 * Build a sandboxed function for a statement (may mutate scope).
 *
 * Passes the scope as a single object parameter and uses explicit
 * property access so mutations write back to the reactive proxy.
 * e.g. "counter.count++" → (__s, $event) => { __s.counter.count++; }
 *
 * For bare-name assignments like "last = $event", we rewrite them to
 * "__s.last = $event" so they write back to the scope object.
 * This avoids `with()` entirely — safe on file:// and in strict mode.
 */
function buildStmtFn(
  keys: string[],
  body: string,
): (state: Record<string, any>, event?: Event) => void {
  // Rewrite bare-name references to __s.name so reads/writes go through scope
  let rewritten = body;
  for (const key of keys) {
    // Replace word-boundary occurrences of key not preceded by a dot
    rewritten = rewritten.replace(
      new RegExp(`(?<![.\\w])\\b${key}\\b`, "g"),
      `__s.${key}`,
    );
  }
  return new Function("__s", "$event", `${rewritten};`) as (
    state: Record<string, any>,
    event?: Event,
  ) => void;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compile an expression string into a reusable function.
 * The function accepts the full scope object and returns the expression value.
 *
 * Compilation is cached — the same expression string always returns the same fn.
 *
 * @example
 * compileExpression("counter.count + 1", ["counter"])
 * // → ({ counter }) => counter.count + 1
 */
export function compileExpression(
  expr: string,
  scopeKeys: string[] = [],
): (state: Record<string, any>) => any {
  const trimmed = expr.trim();
  const cacheKey = `${scopeKeys.join(",")}|${trimmed}`;

  if (exprCache.has(cacheKey)) return exprCache.get(cacheKey)!;

  let fn: (state: Record<string, any>) => any = () => undefined;
  try {
    fn = buildExprFn(scopeKeys, trimmed);
  } catch {
    console.warn(`[reactive] Failed to compile expression: "${trimmed}"`);
  }

  exprCache.set(cacheKey, fn);
  return fn;
}

/**
 * Evaluate an expression string against a state object.
 * Returns undefined and warns on runtime error.
 */
export function evaluate(expr: string, state: Record<string, any>): any {
  try {
    return compileExpression(expr, Object.keys(state))(state);
  } catch (e) {
    console.warn(`[reactive] Error evaluating expression "${expr}":`, e);
    return undefined;
  }
}

/**
 * Compile a statement (no return value) — used for @event handlers like "count++".
 * Cached separately from expressions to avoid key collisions.
 */
export function compileStatement(
  expr: string,
  scopeKeys: string[] = [],
): (state: Record<string, any>, event?: Event) => void {
  const trimmed = expr.trim();
  const cacheKey = `${scopeKeys.join(",")}|${trimmed}`;

  if (stmtCache.has(cacheKey)) return stmtCache.get(cacheKey)!;

  let fn: (state: Record<string, any>, event?: Event) => void = () => {};
  try {
    fn = buildStmtFn(scopeKeys, trimmed);
  } catch {
    console.warn(`[reactive] Failed to compile statement: "${trimmed}"`);
  }

  stmtCache.set(cacheKey, fn);
  return fn;
}

/**
 * Execute a statement expression against state (for event handlers).
 */
export function execute(
  expr: string,
  state: Record<string, any>,
  event?: Event,
): void {
  try {
    compileStatement(expr, Object.keys(state))(state, event);
  } catch (e) {
    console.warn(`[reactive] Error executing statement "${expr}":`, e);
  }
}

/**
 * Parse a template string and extract all {{ expr }} interpolations.
 * Returns an empty array when there are no {{ }} tokens — callers should
 * check `.length` before doing further work.
 *
 * @example
 * parseInterpolations("Hello {{ name }}, you have {{ count }} items")
 * // → [{ type:"static", value:"Hello " }, { type:"expr", value:"name" }, ...]
 *
 * parseInterpolations("plain text") // → []
 */
export type InterpolationPart =
  | { type: "static"; value: string }
  | { type: "expr"; value: string };

export function parseInterpolations(template: string): InterpolationPart[] {
  // Fast-path: avoid regex overhead when there are no {{ tokens.
  if (!template.includes("{{")) return [];

  const parts: InterpolationPart[] = [];
  const regex = /\{\{\s*([\s\S]+?)\s*\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(template)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: "static",
        value: template.slice(lastIndex, match.index),
      });
    }
    parts.push({ type: "expr", value: match[1].trim() });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < template.length) {
    parts.push({ type: "static", value: template.slice(lastIndex) });
  }

  return parts;
}

/**
 * Returns true if a string contains at least one {{ }} interpolation.
 * Uses a plain string check first to avoid regex overhead on most nodes.
 */
export function hasInterpolation(str: string): boolean {
  return str.includes("{{") && /\{\{[\s\S]+?\}\}/.test(str);
}

/** Clear both expression caches (useful for testing). */
export function clearExpressionCache(): void {
  exprCache.clear();
  stmtCache.clear();
}
