# Reactive Examples

## Run

```bash
npx serve examples -p 4321
```

Then open `http://localhost:4321`

## Structure

```
examples/
├── index.html              # Gallery
├── 01-basics/              # reactive, computed, effect, batch
├── 02-dom-binding/         # bindText, bindHTML, bindInput, bindClass, bindStyle, bind
├── 03-watch/               # watch, watchMultiple, watchProperty
├── 04-utilities/           # ref, toRaw, markRaw, readonly, debug tools
├── 05-real-world/          # counter, todo, shopping cart, async computed
├── 06-integration/         # all features combined
└── 07-parser/              # template parser examples
    ├── index.html          # overview + live demo
    ├── counter.html        # {{ }}, :show, :class, @click
    ├── form.html           # :model, :disabled, live preview
    ├── list.html           # :html, filters, event delegation
    └── scoped.html         # multi-state, data-scope stamping
```

## Parser Examples

The `07-parser/` examples use `new Function()` for expression evaluation.
Serve over HTTP — they won't work on `file://`.

Each page loads `../dist/reactive.iife.min.js` and calls `mount()` at the bottom of `<body>`.
The library injects `body { opacity: 0 }` automatically — no flash of unresolved `{{ }}`.

### Pattern

```html
<script src="../dist/reactive.iife.min.js"></script>
<!-- ... HTML with {{ }}, :attr, @event ... -->
<script>
  const { reactive, mount } = Reactive;
  const counter = reactive({ count: 0 });
  mount({ counter });
</script>
```
