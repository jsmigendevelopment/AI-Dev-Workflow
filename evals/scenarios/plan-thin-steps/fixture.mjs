// A kickoff at step 9 of /idea: four MVP slices, approved wireframes, and a profile and a
// decision that say which model plans. The plan is the only thing asked for.
import { flatshareDocs } from "../../lib/flatshare.mjs";
import { repo } from "../../lib/fixture.mjs";

export function build(dir) {
  repo(dir, flatshareDocs());
  return { slices: 4 };
}
