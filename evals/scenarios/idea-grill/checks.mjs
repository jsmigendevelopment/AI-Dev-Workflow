// /idea's grill asks three questions, each with a recommended answer, and writes no code.
import { questionLines, result } from "../../lib/checks.mjs";

const CODE = /\.(m?[jt]sx?|cjs|py|rb|go|rs|java|kt|swift|html|css|scss|vue|svelte)$|(^|\/)package\.json$/;

export const checks = [
  {
    id: "no-code",
    description: "No source file or package.json is written before the grill is done",
    check: (t) => {
      const code = t.newFiles().filter((p) => CODE.test(p));
      return result(code.length === 0, `wrote ${code.join(", ")}`);
    },
  },
  {
    id: "three-questions",
    description: "The reply asks at least three questions",
    check: (t) => {
      const n = questionLines(t.asked).length;
      return result(n >= 3, `${n} question line(s)`);
    },
  },
  {
    id: "recommended-answers",
    description: "The questions come with a recommended answer",
    check: (t) => result(/\brecommend(ed|ation)?\b/i.test(t.asked), "no recommended answer in the reply"),
  },
];

export const manual = [
  "The questions are in plain words and fit the first grill topic (who and why).",
  "Each recommended answer has a one-line reason.",
];
