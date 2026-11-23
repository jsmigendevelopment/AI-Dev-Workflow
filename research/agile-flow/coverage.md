# Coverage

Options down the side, the questions the brief asks across the top. Each cell names the claims in `claims.csv` that bear on it, or says `gap`. A claim in a cell may count for the option or against it; the dossier says which.

| Option | What the agile sources say | Idle time | Rework risk | The person's attention | Fit for agents | CI/CD fit | Measured here |
|---|---|---|---|---|---|---|---|
| **A. Keep it as it is** | c12, c13, c15, c55, c57 (all against) | c64 as read. How long the loop really waits: `gap` | `gap`: no measure of rework on any onRails project | c64, c70, c71 | c60, c61, c62, c79, c83, c84 | c72, c74, c75 | c145, c146, c147 (the kit-on-main arm) |
| **B. Thin steps and a gate that keeps moving** | c12, c13, c14, c15, c16, c39, c40, c41, c43, c46, c48, c49, c50, c51, c55 | `gap`: not measured. The design is argued from c12, c13, c29, c43 | c26, c95, c106, c109 | c68, c71, c135, c140 | c79, c80, c83, c84, c85, c96, c97, c99, c100, c101 | c41, c125, c126, c127, c128, c129, c136, c137, c139, c140, c141 | c145, c146, c147, c149, and the eval run |
| **C. No passes: one flowing backlog** | c18, c20, c21, c22, c144 | c122 (a vendor's argument). Otherwise `gap` | c15, c118 | `gap` | c120, c123 | c41 | `gap`: not built |
| **D. Gate by the clock** | c1, c2, c11, c17 | `gap` | `gap` | c7, c17 | `gap` | `gap` | `gap`: not built |

## By research question

| Question | Claims | Gaps |
|---|---|---|
| 1. Agile at the source: iterations, work in progress, flow, slicing, feedback, batches, trunk | c1 to c57, c142 to c144 | Beck's own text (c9); *Accelerate*, Reinertsen's and Anderson's books not opened; Cockburn's walking skeleton only secondhand (c56) |
| 1. Which parts assume people | c6, c7, c17, c23, c45, and the reasons in c3, c25, c27, c28, c34 | The sorting into "human" and "any worker" is the author's inference |
| 2. onRails against agile | c60 to c77 | None: the kit was read at `06b0b92` |
| 3. What limits throughput | c64, c70 to c75, c107, c108, c118 to c124 | No timing from any real onRails project. No measured study of CI wait in agent loops, or of agents per supervisor (c124) |
| 3. Designs: continuous pass, rolling gate, flags, previews, batching | c12, c13, c15, c29, c43, c77, c122, c128 to c135 | The rolling gate was not run. No behaviour test for it (c148) |
| 4. Why models plan big | c58, c87 to c92 | Vendor reports only, and they disagree. No independent study found |
| 4. Techniques, and how to measure | c93 to c103, c110 to c115, c142, c145 to c149 | No sweep of step size for coding agents, no study of a plan critic for coding (c103). No source names time between merges as a measure (c131) |
| 5. CI/CD | c27 to c30, c41, c42, c44, c116, c117, c125 to c141 | The pack's CI was not timed (c75). The pack was not changed or run |
| Competing kits | c58, c59 | Superpowers and Task Master were not re-read (c59) |
