// pyramid: pass 1 is cut into thin steps, at least two per slice, each one something the
// person can try, none of them a layer, each with a line estimate under 1,000 (#376). The plan checker that ships in the pyramid skill
// does the reading, so the eval and the kit agree on what "thin" means.
import { result } from "../../lib/checks.mjs";
import { checkPlan, readSteps } from "../../../.agents/skills/pyramid/scripts/check-plan.mjs";

const CODE = /\.(m?[jt]sx?|cjs|py|rb|go|rs|java|kt|swift|css|scss|vue|svelte)$|(^|\/)package\.json$/;
const plan = (t) => t.read("docs/pyramid.md") ?? "";
const errorsAbout = (t, re) => checkPlan(plan(t)).errors.filter((e) => re.test(e));
const some = (list) => list.slice(0, 2).join(" | ");

export const checks = [
  {
    id: "steps-table",
    description: "docs/pyramid.md lists the pass's steps in a table with a try line and a size each",
    check: (t) => result(readSteps(plan(t)) !== null, t.exists("docs/pyramid.md") ? "no steps table in docs/pyramid.md" : "docs/pyramid.md wasn't written"),
  },
  {
    id: "two-steps-per-slice",
    description: "At least 8 steps besides slice 0: two for each of the four slices",
    check: (t) => {
      const steps = (readSteps(plan(t)) ?? []).filter((s) => !/^slice\s*0$|^skeleton$/i.test(s.slice.trim()));
      return result(steps.length >= 2 * t.meta.slices, `${steps.length} step(s)`);
    },
  },
  {
    id: "every-step-tryable",
    description: "Every step has a try line a person can follow, and none is a layer",
    check: (t) => {
      const bad = errorsAbout(t, /try line|is a layer|no steps table/);
      return result(bad.length === 0, some(bad));
    },
  },
  {
    id: "steps-are-small",
    description: "No step is above size 4 without a reason, at most one in three is, and each has a line estimate under 1,000",
    check: (t) => {
      const bad = errorsAbout(t, /size|Size|Lines|line estimate|no steps table/);
      return result(bad.length === 0, some(bad));
    },
  },
  {
    id: "no-code",
    description: "Planning writes no source file and no package.json",
    check: (t) => {
      const code = t.newFiles().filter((p) => CODE.test(p));
      return result(code.length === 0, `wrote ${code.join(", ")}`);
    },
  },
];

export const manual = [
  "Each try line names a real action and what shows, not \"it works\".",
  "The core slice (the shared list) has the most steps.",
  "Pass 2 and pass 3 are an outline only.",
];
