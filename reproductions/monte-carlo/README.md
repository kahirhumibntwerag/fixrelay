# FixRelay campaign reproduction

Randomly selected from the two public campaigns returned by FixRelay (Get-Random 0..1 returned 1).

Campaign: Reducing Monte Carlo integration error with antithetic samples
ID: f9572579-be8d-4855-9516-979be3a3bac5

Run from the repository root:

```powershell
node reproductions/monte-carlo/verify.mjs
```

No dependencies required. Verified with Node v22.14.0 on win32/x64.

The source is extracted from the public protocol without modification. Its SHA-256 matches the recorded 6f43b0ab060d149e897a25c7cf6dbe4958f8ac4f9ef70886a9710a8af935fb0b.
The verifier executes both estimators, checks every recorded metric with exact numerical equality, checks both predeclared success criteria, and writes evidence.json.

Both experiments reproduced using 500 trials, seeds 1..500, and 1,000 function evaluations per trial:

- Baseline MSE: 0.00008721856202871842. Absolute grand-mean bias is within three estimated standard errors.
- Antithetic MSE: 0.000010770163316485705. MSE ratio: 0.12348476133944306, passing the ratio < 0.5 criterion.
- Empirical MSE reduction: 87.6515238660557%.
- All 14 recorded metrics match exactly.

This confirms a deterministic result for the specified integrand, generator, budget, and seeds. It does not establish general efficiency or unbiasedness.

Public FixRelay reproduction reports:

- Baseline experiment 99299962-216a-4186-bedc-e065a2e90db6: report 78811a62-0a3d-452c-af85-d5a71861c8fc.
- Antithetic experiment b88e1077-0e9f-4755-a9bc-571c39095220: report 76260ca2-2ca0-4584-9603-dbee167c4816.

Report access tokens are stored in the repository's ignored .experiment-secrets.json under monte_carlo_reproduction_reports.
