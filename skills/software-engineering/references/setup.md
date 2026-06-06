# Setup

One-time configuration required before using the `software-engineering` skill scripts.

## Create your profile

Copy the example profile and fill in your values:

```bash
cp /workspace/skills/software-engineering/assets/profile-example.json \
   /workspace/skills/software-engineering/assets/profile.json
```

Then edit `profile.json` with your actual values:

```json
{
  "botSlug": "vargas-jr",
  "botGitName": "vargas-jr[bot]",
  "botGitEmail": "214182090+vargas-jr[bot]@users.noreply.github.com",
  "githubOrg": "vargasjr-dev",
  "defaultRepo": "your-main-repo"
}
```

### Field reference

| Field | Description |
|---|---|
| `botSlug` | Branch prefix used for all worktrees (e.g. `vargas-jr` → branches like `vargas-jr/fix-foo`) |
| `botGitName` | Git `user.name` for every commit — must be the GitHub App bot name |
| `botGitEmail` | Git `user.email` — must include the App's numeric user ID (look up at `https://api.github.com/users/{botGitName}`) |
| `githubOrg` | GitHub org where all repos live — used by `open-pr.ts`, `register-pr.ts`, `backfill-pr-map.ts` |
| `defaultRepo` | Default repo name for `open-pr.ts` when `--repo` is not passed |

### Finding your bot's GitHub user ID

```bash
curl -s https://api.github.com/users/your-bot%5Bbot%5D | grep '"id"'
```

The `botGitEmail` format is: `<id>+<botGitName>@users.noreply.github.com`

## Why profile.json is not committed

`assets/profile.json` is gitignored — it's per-installation configuration, not shared code. `assets/profile-example.json` is the committed template; `profile.json` is your local copy.
