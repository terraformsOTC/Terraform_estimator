# Scheduled jobs

Copies of the launchd agents this machine runs. The live ones are in
`~/Library/LaunchAgents/`; these are here so the schedule survives a rebuild and
so a change to it shows up in a diff.

    cp ops/launchd/*.plist ~/Library/LaunchAgents/
    launchctl load ~/Library/LaunchAgents/com.terraformestimator.daily-refit.plist
    launchctl load ~/Library/LaunchAgents/com.terraformestimator.floor-sample.plist

**`floor-sample`** — hourly. Appends the live Alchemy floor and the top
collection WETH bid to `backend/src/floor-history.json`.

**`daily-refit`** — 04:20. The full model refit, then verify, commit and push.

Both set `PATH` explicitly. launchd starts with a near-empty environment and does
not read a zsh profile, so `node` installed through mise is not on the path
without it — the floor sampler failed with `node: command not found` until this
was added, and the refit would have failed the same way at 04:20.
