import { loadPartials } from "./boot/loadPartials.js";

await loadPartials();
await import("./app.js");
