// Compile-only type tests. Run twice: against zustand 5 (tsconfig.typetest.json)
// and zustand 4 (tsconfig.typetest4.json) via `paths` mapping. Any regression
// in inference or the actionName argument fails `npm run test:types`.
import { createStore } from "zustand/vanilla";
import { devtools } from "zustand/middleware";
import { withDevtoolsBridge, type BridgeOptions } from "zustand-devtools-bridge";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;
type Expect<T extends true> = T;

interface CartState {
  items: string[];
  total: number;
  addItem: (item: string) => void;
  reset: () => void;
}

// --- 1. Full generic inference through the middleware (curried form) -------
const cartStore = createStore<CartState>()(
  withDevtoolsBridge(
    (set, get) => ({
      items: [],
      total: 0,
      // the third actionName argument must type-check on the inner set
      addItem: (item) =>
        set((s) => ({ items: [...s.items, item], total: get().total + 1 }), false, "addItem"),
      reset: () => set({ items: [], total: 0 }, false, "reset"),
    }),
    { name: "cart", enabled: true, redact: ["token", /secret/i], maxHistory: 100 }
  )
);

type InferredState = ReturnType<typeof cartStore.getState>;
type _stateIsExact = Expect<Equal<InferredState, CartState>>;
type _itemsIsStringArray = Expect<Equal<InferredState["items"], string[]>>;

// --- 2. Direct setState accepts the actionName third argument --------------
cartStore.setState({ total: 5 }, false, "manualBump");
cartStore.setState((s) => ({ items: [...s.items, "x"] }), false, "push");

// --- 3. Wrong types are rejected -------------------------------------------
// @ts-expect-error actionName must be a string
cartStore.setState({ total: 5 }, false, 123);
// @ts-expect-error unknown state key
cartStore.setState({ nope: true }, false, "bad");
// @ts-expect-error unknown option
withDevtoolsBridge((set) => ({ a: 1 }), { name: "x", telemetry: true });

// --- 4. Options are properly typed ------------------------------------------
const opts: BridgeOptions = { name: "s", enabled: false, redact: ["password"], maxHistory: 50 };
// @ts-expect-error redact takes strings/RegExps only
const badOpts: BridgeOptions = { redact: [42] };

// --- 5. Middleware composition (bridge wrapping zustand's own devtools) ----
const composed = createStore<CartState>()(
  withDevtoolsBridge(
    devtools((set) => ({
      items: [],
      total: 0,
      // zustand 4's devtools typing requires an explicit replace argument;
      // passing it keeps this composition case valid on both majors.
      addItem: (item) => set((s) => ({ items: [...s.items, item] }), false),
      reset: () => set({ items: [], total: 0 }, false),
    })),
    { name: "composed" }
  )
);
type _composedState = Expect<Equal<ReturnType<typeof composed.getState>, CartState>>;

// --- 6. Nothing collapsed to any --------------------------------------------
type _notAny = Expect<Equal<InferredState extends never ? true : false, false>>;
declare const probablyAny: InferredState["total"];
type _totalIsNumber = Expect<Equal<typeof probablyAny, number>>;

export {};
