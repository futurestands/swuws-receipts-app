# Initial untracked work inspection

All 30 initially untracked files were read in full by the review harness; JSON files were parsed and traversed. The 17 tracked modifications were inspected through diffs and affected implementations. Their hashes, the untracked files and the original workbook are protected by preservation-before.json and preservation-after.json.

| Path | Bytes | Review purpose |
| --- | ---: | --- |
| lib/decision-support/display.ts | 479 | Source/test/proof script inspected; SQL/business inventory runners not executed |
| lib/decision-support/mps-tps.test.ts | 9385 | Source/test/proof script inspected; SQL/business inventory runners not executed |
| lib/decision-support/mps-tps.ts | 5461 | Source/test/proof script inspected; SQL/business inventory runners not executed |
| lib/decision-support/performance-engine.test.ts | 3421 | Source/test/proof script inspected; SQL/business inventory runners not executed |
| outputs/engineering-basis-review/arithmetic-check.json | 242 | Parsed complete evidence data (5 nodes) |
| outputs/engineering-basis-review/engineering-basis-review.md | 43303 | Review documentation read |
| outputs/engineering-basis-review/formula-review-register.md | 27396 | Review documentation read |
| outputs/engineering-basis-review/workbook-evidence.json | 1159919 | Parsed complete evidence data (35423 nodes) |
| outputs/phase-a-baseline-proposal/isolated-proof-results.json | 5553 | Parsed complete evidence data (144 nodes) |
| outputs/phase-a-baseline-proposal/legacy-capture-draft.sql | 2243 | Static SQL draft; not executed |
| outputs/phase-a-baseline-proposal/phase-a-proposal-and-safety-proof.md | 23022 | Review documentation read |
| outputs/phase-a-baseline-proposal/schema-draft.sql | 9853 | Static SQL draft; not executed |
| outputs/phase-a-baseline-proposal/validate-draft.mjs | 20594 | Source/test/proof script inspected; SQL/business inventory runners not executed |
| outputs/phase-a-final-phase-b-proposal/mps-tps-dependency-register.json | 717344 | Parsed complete evidence data (20440 nodes) |
| outputs/phase-a-final-phase-b-proposal/mps-tps-dependency-register.md | 13458 | Review documentation read |
| outputs/phase-a-final-phase-b-proposal/phase-a-completion-report.md | 10391 | Review documentation read |
| outputs/phase-a-final-phase-b-proposal/phase-b-decision-support-proposal.md | 31154 | Review documentation read |
| outputs/phase-a-final-phase-b-proposal/validation-summary.json | 2999 | Parsed complete evidence data (112 nodes) |
| outputs/phase-a-history-validation/build-mapping-register.mjs | 11967 | Source/test/proof script inspected; SQL/business inventory runners not executed |
| outputs/phase-a-history-validation/business-inventory-summary.json | 2552 | Parsed complete evidence data (81 nodes) |
| outputs/phase-a-history-validation/historical-mapping-and-approval-review.md | 28753 | Review documentation read |
| outputs/phase-a-history-validation/historical-mapping-register.json | 568227 | Parsed complete evidence data (16143 nodes) |
| outputs/phase-a-history-validation/historical-mapping-register.md | 31122 | Review documentation read |
| outputs/phase-a-history-validation/mapping-register.test.ts | 3985 | Source/test/proof script inspected; SQL/business inventory runners not executed |
| outputs/phase-a-history-validation/output-comparison-results.json | 11749 | Parsed complete evidence data (265 nodes) |
| outputs/phase-a-history-validation/outputs-invariance.test.ts | 13706 | Source/test/proof script inspected; SQL/business inventory runners not executed |
| outputs/phase-a-history-validation/preservation-manifest.json | 2326 | Parsed complete evidence data (24 nodes) |
| outputs/phase-a-history-validation/read-engineering-evidence.mjs | 6648 | Source/test/proof script inspected; SQL/business inventory runners not executed |
| outputs/phase-b-local-implementation/implementation-report.md | 18381 | Review documentation read |
| outputs/phase-b-local-implementation/validation-summary.json | 3542 | Parsed complete evidence data (102 nodes) |

The existing outputs/phase-a-history-validation/read-engineering-evidence.mjs reads configured credentials and executes read-only SQL; it was not run. Existing validate-draft.mjs and outputs-invariance.test.ts execute synthetic SQL migrations and capture statements; they were not run. Original workbook-evidence and dependency JSON data remain unchanged.

Review-created files are confined to outputs/phase-b-acceptance-review/. They are evidence and synthetic tests, not application features or migrations. The default application Vitest configuration excludes outputs/**; the explicit review config runs only the new acceptance probes.
