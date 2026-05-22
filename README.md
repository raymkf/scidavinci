![SciDaVinci title](./images/scidavinci-title.png)

<div align="center">

**SciDaVinci** is an AI research workspace for biomedical data analysis, figure generation, and visual reasoning.

It combines a lightweight agent runtime with a web-based visual workbench, so researchers can move from uploaded datasets to interactive charts, annotated figures, and export-ready visual assets in one conversational workflow.

![Python](https://img.shields.io/badge/python-%3E%3D3.11-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-active%20prototype-6f42c1)
![WebUI](https://img.shields.io/badge/WebUI-React%20%2B%20Vite-61dafb)

</div>

> [!NOTE]
> The public-facing name is moving toward **SciDaVinci**, but the package and CLI have not been fully renamed yet. In the current codebase, installation metadata still uses `biodavinci`, and parts of the runtime still inherit the `nanobot` name from the upstream agent framework.

## Why SciDaVinci

Scientific analysis often jumps between chat, scripts, spreadsheets, notebooks, figures, and manual polishing. SciDaVinci aims to make that loop feel more continuous:

- ask questions in natural language;
- inspect uploaded CSV, TSV, and Excel datasets;
- generate charts from the full dataset instead of a tiny preview;
- select visual elements and refine figure style interactively;
- keep charts, images, annotations, and collages in a visual workspace;
- export publication-oriented PNG assets from the browser.

The current prototype is especially shaped around biomedical and genomics workflows, including differential-expression tables, volcano plots, expression summaries, and figure refinement.

## What It Can Do

### Research Agent Core

- Multi-provider LLM runtime with OpenAI-compatible, Anthropic, OpenRouter, local, and custom endpoint support.
- Tool-using agent loop with memory, skills, MCP integration, web search, file reading, shell execution, and scheduled tasks.
- Session persistence, workspace files, and long-running gateway mode.
- Multiple chat channel integrations inherited from the agent core, including WebSocket, Telegram, Slack, Discord, Feishu, WeCom, DingTalk, WeChat, email, Matrix, QQ, and WhatsApp bridge support.

### Biomedical Data Workflow

- Upload and inspect structured datasets.
- Query datasets with SQL-backed tools.
- Generate `chart-json` outputs for interactive rendering.
- Supported chart families include bar, line, pie, area, scatter, box, and volcano plots.
- Demo data is included for the public Himes et al. airway smooth muscle RNA-seq study.

### Visual Workspace

- Web UI with chat, session list, image upload, and real-time streaming.
- Right-side visual workbench for charts, images, and collages.
- Clickable chart elements with style controls for color, opacity, stroke, point size, labels, axes, grid, captions, and annotations.
- Image anchoring, background controls, collage layout, and PNG export.
- Localized UI strings for multiple languages, including Simplified Chinese and English.

## Demo Dataset

The repository includes a compact biomedical demo under [`demo_data/airway_himes`](./demo_data/airway_himes):

- `volcano_dex_vs_untreated.csv` for a differential-expression volcano plot;
- `bar_top_changed_genes.csv` for top changed genes;
- `line_selected_gene_expression.csv` for selected gene expression trends;
- `pie_deg_categories.csv` for DEG category summaries;
- `box_expression_distribution.csv` for expression distribution summaries.

The dataset is based on:

> Himes BE, Jiang X, Wagner P, et al. RNA-Seq Transcriptome Profiling Identifies CRISPLD2 as a Glucocorticoid Responsive Gene that Modulates Cytokine Function in Airway Smooth Muscle Cells. PLOS ONE. 2014;9(6):e99625.

See the demo notes in [`demo_data/airway_himes/README.md`](./demo_data/airway_himes/README.md).

## Quick Start

### 1. Install From Source

```bash
git clone <your-repo-url>
cd biodavinci
pip install -e .
```

The current console script is:

```bash
biodavinci --help
```

### 2. Initialize The Workspace

```bash
biodavinci onboard
```

This creates the local config and workspace under `~/.nanobot/`.

### 3. Configure A Model

Edit `~/.nanobot/config.json`. For example, using OpenRouter:

```json
{
  "providers": {
    "openrouter": {
      "apiKey": "sk-or-v1-..."
    }
  },
  "agents": {
    "defaults": {
      "provider": "openrouter",
      "model": "anthropic/claude-opus-4-6"
    }
  }
}
```

### 4. Start Chat In The Terminal

```bash
biodavinci agent
```

## Web UI Development

The visual workspace lives in [`webui`](./webui). To run it locally:

### 1. Enable The WebSocket Channel

Add this to `~/.nanobot/config.json`:

```json
{
  "channels": {
    "websocket": {
      "enabled": true
    }
  }
}
```

### 2. Start The Gateway

```bash
biodavinci gateway
```

### 3. Start The Web UI

```bash
cd webui
bun install
bun run dev
```

Open the local Vite URL printed by the dev server, usually `http://localhost:5173`.

## Example Prompts

After starting the Web UI, try the included airway demo data:

```text
请读取 demo_data/airway_himes/volcano_dex_vs_untreated.csv，并生成一张火山图，突出上调和下调基因。
```

```text
用 demo_data/airway_himes/bar_top_changed_genes.csv 画一张适合论文初稿的柱状图，颜色要区分 log2 fold change 的方向。
```

```text
把这张图的标题改短一点，隐藏网格线，并导出为 PNG。
```

```text
基于 CRISPLD2、KLF15 和 PER1 的表达变化，生成一张能放进组会汇报的折线图。
```

## Repository Layout

```text
.
├── nanobot/                 # Agent runtime, tools, channels, memory, skills
├── webui/                   # React/Vite visual workspace
├── bridge/                  # TypeScript bridge for selected chat integrations
├── demo_data/airway_himes/  # Biomedical demo data
├── docs/                    # Runtime, config, API, deployment, and workbench docs
├── tests/                   # Python test suite
├── images/                  # README and product images
└── pyproject.toml           # Python package metadata
```

## Development

Install the Python project in editable mode:

```bash
pip install -e ".[dev]"
```

Run the Python tests:

```bash
pytest
```

Run Web UI tests and build checks:

```bash
cd webui
bun install
bun run test
bun run build
```

## Roadmap

- Complete the public rename from the current internal package names to **SciDaVinci**.
- Make the visual workspace fully session-scoped.
- Improve active image/chart targeting when several assets are present.
- Add stronger state synchronization between manual visual edits and the agent context.
- Expand biomedical chart templates and figure presets.
- Add more export formats for papers, posters, slides, and notebooks.

## License

This project is released under the MIT License. See [`LICENSE`](./LICENSE) and [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).

## Acknowledgements

SciDaVinci currently builds on the lightweight `nanobot` agent architecture and extends it toward scientific data analysis, visual workbench interaction, and biomedical figure generation.
