import { Playground } from "./vendor/playground";

declare global {
  interface Window {
    playground: Playground;
  }
}

export {};
