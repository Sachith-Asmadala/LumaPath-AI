import { createDemoState } from "./seed";
import type { DemoState } from "./types";

/** Replace this typed local adapter with API-backed repositories when the backend is ready. */
export const demoDataAdapter = {
  load(): DemoState {
    return createDemoState();
  },
  reset(): DemoState {
    return createDemoState();
  },
};
