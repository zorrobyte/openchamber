# OpenChamber (zorro)

A personal fork of [OpenChamber](https://github.com/openchamber/openchamber), the desktop and web app for [OpenCode](https://opencode.ai). Work lives on the `zorro` branch.

## What's different

- **Usage panel:** Antigravity quota read from the `agy` CLI (one row per pool), Muse quota, and a fallback to the Codex CLI login when OpenCode's ChatGPT token is rejected.
- **More than one Claude subscription:** each one gets its own provider, login and usage row. Add one with "Add Claude subscription" on the Claude Code provider page.
- **Agent tool:** agents can read plan usage (`usage.get`) and stop running sessions and subagents.
- **Chat:** agy tool steps show as tool rows, even when reasoning is hidden.

These work with the OpenCode plugins in the private `openchamber-addons` repo.

## Install (macOS)

Quit OpenChamber, then:

```sh
git clone -b zorro https://github.com/zorrobyte/openchamber.git
cd openchamber
scripts/zorro-install-mac.sh
```

The script builds the app, signs it ad hoc and copies it into `/Applications`. It needs [bun](https://bun.sh).

On Windows, run `scripts\zorro-install-windows.ps1` instead. It builds an unsigned installer and installs the app for the current user, with a Start menu shortcut. Besides bun it needs Visual Studio 2022 Build Tools with the C++ workload and the Spectre-mitigated libraries (`Microsoft.VisualStudio.Component.VC.Runtimes.x86.x64.Spectre`), which the node-pty rebuild uses.

## Upstream

Pull upstream changes with `git fetch upstream && git rebase upstream/main`. For OpenChamber's own docs, see `packages/docs` or the upstream repo.

## License

MIT, from upstream. See [LICENSE](LICENSE).
