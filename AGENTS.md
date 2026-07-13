# SimEx Dashboard V2 Project Instructions

## Branch Policy

- `content/cloudflare-beta` is the Cloudflare-published content branch.
- `main` is the stable no-voice baseline branch.
- `feature/voice-focus-testing` is the only branch that should contain the voice feature.
- Do not add voice-related code, scripts, documentation, or package commands to `main` or `content/cloudflare-beta`.
- Non-voice feature and content updates should be applied to `content/cloudflare-beta`, then propagated to `main`. If still relevant to voice testing, cherry-pick those non-voice commits into `feature/voice-focus-testing`.

## Browser Edit Baseline Policy

Browser edit-mode changes are not visible to Git until they are promoted into source files.

Before making app updates or adding features, check whether the user has exported current browser edits as `packaged-dashboard-bundle.json` in the project root. If it exists, run:

```powershell
pnpm.cmd promote:bundle
```

Then review and commit the resulting changes to `public/config/dashboard.json` and any files under `public/data/uploaded/` before applying new code changes. This makes the user's browser-edited dashboard the new baseline that future updates build on.

If no `packaged-dashboard-bundle.json` exists but the user says they changed the dashboard in the browser, ask them to export the package default first.

## Data Update Policy

To update dashboard data from the original `sree2712/pdpcDashApp` repository:

1. Pull the latest `pdpcDashApp` main branch.
2. Run `scripts/export_old_dashboard_data.py` from this repo using the old dashboard environment.
3. Commit the resulting generated CSV changes under `public/data/`.
4. Apply the same data commit to `content/cloudflare-beta`, `main`, and `feature/voice-focus-testing`.

## Verification

- Run `pnpm.cmd build` before pushing branch updates.
- The Vite large-bundle warning is expected and is not a failed build.
- Confirm `main` and `content/cloudflare-beta` have no voice references before pushing deployable branch updates.
