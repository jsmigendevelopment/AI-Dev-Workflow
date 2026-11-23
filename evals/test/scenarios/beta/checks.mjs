// Two simple checks for the harness tests.
import { result } from "../../../lib/checks.mjs";

export const checks = [
  { id: "recommends", description: "The reply recommends", check: (t) => result(t.finalText.includes(t.meta.greeting), "no recommendation") },
  { id: "no-app-file", description: "No app.js", check: (t) => !t.exists("app.js") },
];

export const manual = ["The tone is friendly."];
