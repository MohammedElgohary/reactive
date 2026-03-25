# Changelog

## [1.0.3] - Unreleased

### Added

- `onClick`, `onChange`, `bindAction` now accept `Document` and `Window` as targets for event delegation
- Library auto-injects `body { opacity: 0 }` + `body.r-ready { opacity: 1 }` on load — prevents flash of unresolved `{{ }}` expressions without any manual CSS

### Changed

- `mount()` is now the required entry point for the template parser — explicit and reliable
- Removed `inferCallerName()` — stack-trace variable name inference never worked in browsers
- Removed `getState()` internal function — use `buildScope()` instead
- Removed `scheduleAutoMount` from public exports — internal implementation detail
- Removed `getRegisteredState` export alias — was a duplicate of the removed `getState`
- Removed `scheduleNotification` from public exports — internal batch detail
- Cleaned unused imports in `reactive.ts`

### Fixed

- Template parser flash of unresolved expressions — body is now hidden by injected CSS until `mount()` completes
- `scheduleAutoMount` timing race — deferred auto-mount no longer overrides an explicit `mount()` call
- `discoverWindowStates` guard — now runs before the registry length check so zero-config auto-mount works correctly

---

## [1.0.2] - 2024

### Added

- Template parser (`mount`, `parse`, `autoMount`, `unmount`)
- `{{ expr }}` text interpolation
- `:attr`, `:class`, `:style`, `:show`, `:html`, `:model` directives
- `@event` handlers with `$event` access
  bind multiple CSS properties at once
- `computedAsync()` — async derived values with loading/error state
- `watchMultiple()`, `watchProperty()` — fine-grained observation
- `shallowReactive()`, `readonly()`, `readonlyObject()`
- Debug utilities: `setDebug`, `trackReactive`, `getDebugInfo`, `logTrackedReactive`
- Security: `escapeHtmlEntities`, `sanitizeHtmlContent`, `isUrlSafe`, `configureReactiveSecurity`
- Unified `bind()` — auto-detects binding type
  ring

---

## [1.0.0] - 2024-01-17

### Added

- Core reactivity: `reactive`, `computed`, `effect`, `batch`, `watch`
- DOM bindings: `bindText`, `bindHTML`, `bindAttr`, `bindClass`, `bindStyle`, `bindInput`, `bindProp`, `bindMultiple`
- Event helpers: `onClick`, `onInput`, `onSubmit`, `onKey`, `onEnter`, `onEscape`, and more
- TypeScript support with full type definitions
- Multiple build formats: ESM, IIFE, minified, minimal
- XSS protection with automatic HTML sanitization
- 527+ tests

---

MIT
