// A one-file repo for the harness tests.
import { repo } from "../../../lib/fixture.mjs";

export function build(dir) {
  repo(dir, { "README.md": "# demo\n" });
  return { greeting: "Recommended" };
}
