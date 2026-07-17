import { createStore } from "zustand4/vanilla";
import { runBridgeSuite } from "./suite";

runBridgeSuite("zustand 4 (vanilla createStore)", createStore as never);
