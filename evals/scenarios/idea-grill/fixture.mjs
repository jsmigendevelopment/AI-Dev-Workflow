// An empty project folder with a one-line README: the start of /idea.
import { repo } from "../../lib/fixture.mjs";

export function build(dir) {
  repo(dir, { "README.md": "# flatshare\n" });
}
