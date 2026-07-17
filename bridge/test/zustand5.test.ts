import { createStore } from "zustand5/vanilla";
import { runBridgeSuite } from "./suite";

runBridgeSuite("zustand 5 (vanilla createStore)", createStore as never);
