# Release Checklist

Use this checklist before publishing a public version.

## Repository Hygiene

- No real API keys, tokens, local config files, or chat histories are tracked.
- No virtual environments, `node_modules`, generated media, or local workspace directories are tracked.
- Large raw research datasets are excluded unless they are intentionally part of a demo.
- README and docs describe only currently supported behavior.

## Checks

```bash
uv run ruff check nanobot --select F401,F841
uv run pytest tests/interactive_charts
```

## Public Naming

- Package name: `scidavinci`
- CLI command: `scidavinci`
- Local config/workspace root: `~/.scidavinci/`
- Product display name: `SciDaVinci`
