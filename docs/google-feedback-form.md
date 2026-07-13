# Google Feedback Form

The dashboard footer supports a configurable feedback link. For a private repository, use a Google Form or Microsoft Form instead of GitHub Issues.

## Create the Google Form

1. Open:

```text
https://script.google.com/
```

2. Create a new Apps Script project.
3. Replace the default `Code.gs` content with:

```text
tools/google/create-simex-feedback-form.gs
```

4. Run:

```text
createSimExDashboardFeedbackForm
```

5. Approve the Google authorization prompts.
6. Open Apps Script logs and copy the `Published URL`.

The script also creates a Google Sheet called `SimEx Dashboard V2 feedback responses`, where responses are stored.

## Connect The Form To The Dashboard

Paste the published Google Form URL into:

```text
public/config/dashboard.json
```

Use this field:

```json
"feedbackUrl": "https://docs.google.com/forms/..."
```

Then commit and push the config change to `content/cloudflare-beta`.

## Footer Fields

The footer is configured with these dashboard config fields:

```json
"footerTitle": "SimEx Dashboard V2",
"footerCredit": "Developed by Hekmat Alrouh",
"contactEmail": "hekmat.alrouh@live.com",
"feedbackUrl": "",
"repositoryUrl": "https://github.com/hekmatov/simex-dashboard-v2",
"showRepositoryLink": false
```

If `feedbackUrl` is blank, the dashboard falls back to an email feedback link. Since the repository is private, `showRepositoryLink` should usually stay `false` for participant-facing deployments.
