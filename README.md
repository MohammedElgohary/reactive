# Reactive

Lightweight, framework-agnostic reactive state management. Zero dependencies.

## Install

```bash
npm install @mohammed_elgohary/reactive
```

## Usage

```typescript
import { reactive, computed, effect } from "@mohammed_elgohary/reactive";

const state = reactive({ count: 0 });
const doubled = computed(() => state.count * 2);

effect(() => {
  console.log(state.count, doubled.value);
});

state.count++; // triggers effect automatically
```

## API

### Core

#### `reactive(value)`

Creates reactive state. Objects are deeply reactive. Supports plain objects, arrays, `Map`, `Set`, `Date`, `RegExp`, typed arrays, and `ArrayBuffer`.

```typescript
const state = reactive({ count: 0, name: "John" });
state.count = 5; // triggers effects
state.user.age = 30; // nested — also reactive
```

Prefer wrapping primitives in an object:

```typescript
// prefer
const state = reactive({ count: 0 });
state.count = 5;

// works but requires .value
const count = reactive(0);
count.value = 5;
```

#### `computed(() => expr)`

Derived value that updates automatically when dependencies change. Lazy — only recomputes when accessed.

```typescript
const doubled = computed(() => state.count * 2);
console.log(doubled.value);
doubled.dispose(); // stop tracking
```

#### `computedAsync(() => Promise<T>, options?)`

Async derived value. Race-condition safe. Reads inside `await` are not tracked — extract them before the first `await`.

```typescript
const user = computedAsync(
  async () => {
    const id = state.userId; // tracked
    return fetch(`/api/users/${id}`).then((r) => r.json());
  },
  { initialValue: null, onError: (err) => console.error(err) },
);

user.value; // resolved data
user.loading; // true while pending
user.error; // last error or null
user.dispose();
```

#### `effect(fn, options?)`

Runs `fn` immediately and re-runs when dependencies change. Returns a stop function.

```typescript
const stop = effect(() => {
  console.log(state.count);
  return () => console.log("cleanup");
});

stop();
effect(() => riskyOp(), { onError: (err) => report(err) });
```

#### `batch(fn)`

Groups multiple updates into a single notification pass.

```typescript
batch(() => {
  state.a = 1;
  state.b = 2;
  state.c = 3;
}); // one notification instead of three
```

#### `watch(source, callback, options?)`

Observes a reactive source and calls `callback(newValue, oldValue)` on change.

```typescript
const stop = watch(
  () => state.count,
  (newVal, oldVal) => console.log(newVal, oldVal),
  { immediate: true },
);

// Multiple sources
watch([() => state.a, () => state.b], ([newA, newB]) =>
  console.log(newA, newB),
);

// Property shorthand
watch(state, "count", (newVal) => console.log(newVal));
```

#### `watchMultiple(sources, callback, options?)`

```typescript
watchMultiple([() => state.a, () => state.b], ([newA, newB]) =>
  console.log(newA, newB),
);
```

#### `watchProperty(obj, key, callback, options?)`

```typescript
watchProperty(state, "count", (newVal, oldVal) => console.log(newVal));
```

---

### DOM Binding

All binding functions return a cleanup function.

```typescript
bindText("#el", () => state.name);

bindHTML("#el", () => state.html);
bindHTML("#el", () => trustedHtml, { trusted: true });

bindAttr("#el", "disabled", () => state.count === 0);
bindAttr("#el", "href", () => state.url);
bindAttr("#el", "href", () => state.url, { allowDangerousUrls: true });

bindClass("#el", "active", () => state.isActive);

bindStyle("#el", "color", () => (state.isError ? "red" : "black"));

bindStyles("#el", {
  "background-color": () => state.bg,
  "font-size": () => `${state.size}px`,
});
bindStyles("#el", state.styles); // reactive object

bindProp("#el", "scrollTop", () => state.scroll);

// Two-way input
const name = reactive("");
bindInput("#input", name);

const state = reactive({ name: "", age: 0 });
bindInput("#name-input", state, "name");
bindInput("#age-input", state, "age");

bindMultiple([
  { selector: "#title", type: "text", target: "", source: () => state.title },
  { selector: "#box", type: "class", target: "active", source: () => state.on },
]);

render("#list", () => items.map((i) => `<li>${i}</li>`).join(""));
render("#app", () => template(), { trusted: true });

// Unified bind
bind("#el", () => state.text);
bind("#el", "class:active", () => state.on);
bind("#el", "style:color", () => state.color);
bind("#el", "styles", state.styles);
bind("#el", "prop:scrollTop", () => state.scroll);
bind("#el", "href", () => state.url);
```

---

### Event Binding

All event functions return a cleanup function. Selectors accept `string`, `Element`, `Document`, or `Window`.

```typescript
bindAction("#btn", "click", (e) => console.log(e));
bindAction("#form", "submit", handler, { preventDefault: true });

onClick("#btn", (e) => {});
onDblClick("#btn", (e) => {});
onInput("#input", (e) => {});
onChange("#select", (e) => {});
onSubmit("#form", (e) => {}); // preventDefault on by default
onKeyDown("#el", (e) => {});
onKeyUp("#el", (e) => {});
onFocus("#el", (e) => {});
onBlur("#el", (e) => {});
onMouseEnter("#el", (e) => {});
onMouseLeave("#el", (e) => {});
onScroll("#el", (e) => {}); // passive by default

// Event delegation on document
onClick(document, (e) => {
  const btn = e.target.closest(".my-btn");
  if (btn) handle(btn);
});

// Key helpers
onKey("#input", "Enter", () => submit());
onKey("#input", ["Enter", "Tab"], (e) => handle(e));
onKey(
  "#input",
  (e) => e.ctrlKey && e.key === "s",
  () => save(),
);
onEnter("#input", () => submit());
onEscape("#modal", () => close());
```

`bindAction` options:

```typescript
{
  preventDefault?: boolean
  stopPropagation?: boolean
  stopImmediatePropagation?: boolean
  capture?: boolean
  once?: boolean
  passive?: boolean
}
```

---

### Utilities

```typescript
ref(value); // alias for reactive()
readonly(source); // read-only wrapper — warns on write
readonlyObject(obj); // Proxy that throws on write/delete
markRaw(obj); // exclude from reactivity
isRaw(obj); // check if marked raw
toRaw(reactive); // extract raw value from primitive reactive
shallowReactive(obj); // only top-level properties reactive
isReactive(value); // true if reactive primitive wrapper
isComputed(value); // true if computed
isBatchingUpdates(); // true inside batch()
```

---

### Debug

```typescript
setDebug(true);
isDebugEnabled();
trackReactive(state);
trackReactive(myComputed, "computed");
getDebugInfo(state);
logTrackedReactive();
clearDebugTracking();
```

### Security

```typescript
escapeHtmlEntities(str);
sanitizeHtmlContent(html);
isUrlSafe(url);
configureReactiveSecurity({ logWarnings, throwOnViolation });
```

---

## Browser (No Build Step)

```html
<script src="https://unpkg.com/@mohammed_elgohary/reactive/dist/reactive.iife.min.js"></script>
<script>
  const { reactive, mount, bindText, onClick } = Reactive;

  const state = reactive({ count: 0 });
  bindText("#counter", () => state.count);
  onClick("#btn", () => state.count++);
</script>
```

The library automatically injects `body { opacity: 0 }` on load and adds `body.r-ready { opacity: 1 }` after `mount()` completes — preventing flash of unresolved template expressions.

---

## Template Parser

Write reactive UIs directly in HTML. No manual wiring.

```html
<script src="reactive.iife.min.js"></script>

<body>
  <p>{{ counter.count }}</p>
  <button @click="counter.count++">+</button>
  <input :model="user.name" />
  <p :show="counter.count > 0">Positive!</p>

  <script>
    const { reactive, mount } = Reactive;
    const counter = reactive({ count: 0 });
    const user = reactive({ name: "Ali" });
    mount({ counter, user });
  </script>
</body>
```

### Syntax

| Syntax               | Description                               |
| -------------------- | ----------------------------------------- |
| `{{ expr }}`         | Text interpolation                        |
| `:attr="expr"`       | Attribute binding                         |
| `:class="expr"`      | Class binding (string or `{ cls: bool }`) |
| `:style="expr"`      | Style binding (object)                    |
| `:show="expr"`       | Toggle visibility                         |
| `:html="expr"`       | Inner HTML (sanitized)                    |
| `:model="state.key"` | Two-way input binding                     |
| `@event="statement"` | Event handler (`$event` available)        |

### mount({ name: state, ... })

Registers states and parses the DOM. Only nodes referencing a changed state re-evaluate.

```javascript
const counter = reactive({ count: 0 });
const user = reactive({ name: "Ali" });
mount({ counter, user });
```

### parse(root, scope)

Low-level — parse a specific subtree with an explicit scope.

```javascript
const stop = parse(document.querySelector("#app"), { counter, user });
stop(); // tear down bindings
```

### unmount()

Tears down all auto-mounted bindings.

---

## Bundle Sizes

| Build                       | Size (min+gzip) | Use case               |
| --------------------------- | --------------- | ---------------------- |
| `reactive.iife.min.js`      | ~7.1KB          | Browser, full features |
| `reactive.minimal.iife.js`  | ~5.2KB          | Browser, core only     |
| `reactive.min.js` (ESM)     | ~8.8KB          | Bundler, full features |
| `reactive.minimal.js` (ESM) | ~6.5KB          | Bundler, core only     |

---

MIT
