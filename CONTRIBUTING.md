# Contributing to SciDaVinci

Thank you for your interest in SciDaVinci.

SciDaVinci is an early-stage interactive scientific plotting and analysis platform. The current priority is to make the core workflow reliable:

- generate interactive figures from tabular data;
- select and analyze chart elements;
- apply model-driven visual edits;
- compose multiple figures into exportable panels.

## Development Setup

```bash
git clone https://github.com/raymkf/scidavinci.git
cd scidavinci
pip install -e ".[dev]"
```

Run lint checks:

```bash
ruff check nanobot/
```

Run tests if the test suite is present in your checkout:

```bash
pytest tests/
```

Run the Web UI locally:

```bash
cd webui
bun install
bun run dev
```

## Contribution Guidelines

- Keep changes focused and easy to review.
- Prefer small, well-named helpers over broad rewrites.
- Do not commit API keys, local config files, chat logs, generated media, virtual environments, or large raw datasets.
- If you add a chart capability, update the README chart support table and add a compact demo/test fixture.
- If you change the visual workspace behavior, verify chart selection, style updates, export, and collage behavior.

## License

By submitting a contribution, you agree that it will be licensed under the project's MIT License.
