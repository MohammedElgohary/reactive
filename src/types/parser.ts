/**
 * Types for the template parser and expression evaluator.
 */

/** A single part of a parsed interpolation template string. */
export type InterpolationPart =
  | { type: "static"; value: string }
  | { type: "expr"; value: string };

/**
 * The merged scope object passed to expression evaluation.
 * Keys are registered state names, values are reactive state objects.
 *
 * @example
 * // Given:
 * const counter = reactive({ count: 0 });
 * const user    = reactive({ name: "Ali" });
 * // Scope is: { counter, user }
 */
export type TemplateScope = Record<string, Record<string, any>>;

/**
 * A compiled expression function — takes a scope and returns a value.
 */
export type CompiledExpression = (scope: TemplateScope) => any;

/**
 * A compiled statement function — takes a scope and optional event, returns void.
 */
export type CompiledStatement = (scope: TemplateScope, event?: Event) => void;
