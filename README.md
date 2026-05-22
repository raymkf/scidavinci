![SciDaVinci title](./images/scidavinci-title.png)

<div align="center">

**中文** | [English](#english)

![Python](https://img.shields.io/badge/python-%3E%3D3.11-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-active%20prototype-6f42c1)
![WebUI](https://img.shields.io/badge/WebUI-React%20%2B%20Vite-61dafb)

</div>

## 中文

**SciDaVinci** 是一个基于 `nanobot` 开发的交互式科研绘图与分析平台。它把大模型对话、表格数据分析、可交互科研图表、图像元素选择、连续式图像操作和多图拼版放在同一个工作流里，帮助用户从数据表快速走到可以继续打磨和导出的科研图。

> [!NOTE]
> 项目展示名正在向 **SciDaVinci** 迁移，但当前代码中的包名、命令行入口和部分运行时命名还没有完全改名。现阶段请继续使用 `biodavinci` 命令启动项目，部分底层目录仍保留 `nanobot` 命名。

### 核心能力

#### 1. 从表格生成可交互科研绘图

用户可以上传或引用 CSV、TSV、Excel 等表格数据，让模型根据数据内容生成科研图表。生成后的图不是静态图片，而是可交互对象：

- 支持柱状图、折线图、饼图、面积图、散点图、箱线图、火山图等图形；
- 模型可以读取完整数据并生成 `chart-json` 结构；
- 前端将图表渲染为可点击、可选择、可继续编辑的视觉资产；
- 用户可以直接点击图中的点、柱子、扇区、标签等元素，继续向模型提问。

例如，用户可以点击火山图中的某个基因点后问：

```text
这个基因为什么被标记为显著？它和其他上调基因相比有什么特点？
```

也可以选中多个元素后问：

```text
请比较我选中的这些基因，它们在 fold change 和显著性上有什么共同点？
```

#### 2. 图像元素级交互与连续操作

SciDaVinci 的重点不是只让模型“看图回答”，而是让模型能够围绕用户意图持续操作图像对象。用户可以通过点击或自然语言指定目标，模型再把意图拆解为一组连续动作，例如选择元素、修改样式、补充标注、重新分析。

一个典型场景：

```text
在这张火山图中选中 CRISPLD2、KLF15 和 PER1，把它们改成红色并加标签，然后分析这些基因和其他显著上调基因的差异。
```

模型需要完成的不是单步回答，而是一个连续工作流：

1. 理解用户要找的基因；
2. 在图表数据中定位对应元素；
3. 将这些元素加入当前选择集；
4. 应用颜色、标签、透明度等样式修改；
5. 基于选中元素与全图背景数据生成分析结论。

这种选择状态可以连续累积。例如用户先说“选中 A 基因”，下一句再说“再选中 B 基因”，此时 A 和 B 都会保留在当前上下文中，模型可以继续对这组元素进行样式调整或生物学解释。

#### 3. 多图拼版

拼图功能是 SciDaVinci 的重要出发点：科研工作中往往不是只需要一张图，而是需要把多个图组织成一组完整的 figure panel。

当前工作台支持：

- 将多个图表、图片或视觉资产加入拼图画布；
- 调整布局、间距、尺寸和背景；
- 将同一批分析结果组织成更适合论文、组会或汇报的多面板图；
- 一键导出 PNG，减少在外部软件中反复拖拽和对齐的时间。

### 示例工作流

```text
请读取 demo_data/airway_himes/volcano_dex_vs_untreated.csv，生成一张火山图，突出上调和下调基因。
```

```text
选中 CRISPLD2、KLF15 和 PER1，把它们改成红色并加标签。
```

```text
继续选中 FKBP5，把这四个基因和其他显著上调基因做比较。
```

```text
再用 bar_top_changed_genes.csv 生成一张柱状图，然后把火山图和柱状图拼成一个 1x2 的 figure panel。
```

### 项目架构

```mermaid
flowchart LR
    User["用户<br/>自然语言指令 / 点击图中元素"] --> WebUI["Web UI<br/>聊天 + 可视化工作台"]
    WebUI --> Gateway["WebSocket Gateway<br/>实时会话与流式输出"]
    Gateway --> Agent["SciDaVinci Agent<br/>基于 nanobot 的模型运行时"]

    Agent --> DataTools["数据工具<br/>表格读取 / 数据查询 / 图表生成"]
    Agent --> ActionPlanner["图像操作计划<br/>选择元素 / 修改样式 / 添加标注 / 分析"]
    Agent --> Memory["会话与选择状态<br/>连续选择 / 历史上下文 / 工作区状态"]

    DataTools --> ChartJSON["chart-json<br/>结构化科研图表"]
    ActionPlanner --> WorkspaceState["工作台状态<br/>图表 / 图片 / 拼图 / 样式"]
    Memory --> WorkspaceState

    ChartJSON --> Renderer["前端渲染器<br/>交互图表 / 元素命中 / 样式应用"]
    WorkspaceState --> Renderer
    Renderer --> Export["导出<br/>PNG / 多图拼版"]
```

### Demo 数据

仓库内置了一个精简的生物医学示例数据集：[`demo_data/airway_himes`](./demo_data/airway_himes)。

该 demo 基于 Himes 等人在 PLOS ONE 发表的人气道平滑肌细胞 RNA-seq 研究，用于展示地塞米松处理组与未处理组之间的差异表达分析。它包含：

- `volcano_dex_vs_untreated.csv`：火山图；
- `bar_top_changed_genes.csv`：Top changed genes 柱状图；
- `line_selected_gene_expression.csv`：选定基因表达趋势；
- `pie_deg_categories.csv`：差异表达类别统计；
- `box_expression_distribution.csv`：表达分布摘要。

### 快速开始

安装源码版本：

```bash
git clone <your-repo-url>
cd biodavinci
pip install -e .
```

初始化本地工作区：

```bash
biodavinci onboard
```

在 `~/.nanobot/config.json` 中配置模型，例如 OpenRouter：

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

启动命令行对话：

```bash
biodavinci agent
```

### Web UI 开发运行

在 `~/.nanobot/config.json` 中启用 WebSocket：

```json
{
  "channels": {
    "websocket": {
      "enabled": true
    }
  }
}
```

启动 gateway：

```bash
biodavinci gateway
```

启动前端：

```bash
cd webui
bun install
bun run dev
```

打开 Vite 输出的本地地址，通常是 `http://localhost:5173`。

### 仓库结构

```text
.
├── nanobot/                 # 基于 nanobot 的 agent 运行时、工具、通道、记忆和技能
├── webui/                   # React/Vite 可视化工作台
├── bridge/                  # 部分聊天集成使用的 TypeScript bridge
├── demo_data/airway_himes/  # 生物医学 demo 数据
├── docs/                    # 配置、部署、API、工作台设计文档
├── tests/                   # Python 测试
├── images/                  # README 与产品图片
└── pyproject.toml           # Python 包配置
```

### 开发

```bash
pip install -e ".[dev]"
pytest
```

```bash
cd webui
bun install
bun run test
bun run build
```

### Roadmap

- 完成从当前内部命名到 **SciDaVinci** 的完整重命名；
- 强化图中元素选择、连续选择和多元素分析；
- 让模型操作结果与工作台状态更严格同步；
- 扩展更多科研绘图模板和期刊风格预设；
- 完善多图拼版、导出尺寸、图注和 panel label；
- 增强模型对图像、表格和生物学背景之间关系的分析能力。

### 许可证与致谢

本项目基于 MIT License 发布，详见 [`LICENSE`](./LICENSE) 与 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。

SciDaVinci 基于开源项目 `nanobot` 的轻量级 agent 架构继续开发。由于 `nanobot` 使用 MIT License，保留原始版权声明和许可证文本是合适且必要的；在 README 中说明底层来源也有助于让项目脉络更清楚。

---

## English

[中文](#中文) | **English**

**SciDaVinci** is an interactive scientific plotting and analysis platform built on top of `nanobot`. It brings model-driven chat, tabular data analysis, interactive research figures, element-level visual selection, continuous chart editing, and multi-panel figure composition into one workflow.

> [!NOTE]
> The public-facing name is moving toward **SciDaVinci**, but the package name, CLI entry point, and some runtime paths have not been fully renamed yet. For now, use the `biodavinci` command. Some underlying modules still keep the `nanobot` name.

### Core Capabilities

#### 1. Generate Interactive Scientific Figures From Tables

Users can upload or reference CSV, TSV, and Excel datasets, then ask the model to create research figures from the data. The generated result is not just a static image. It becomes an interactive visual asset:

- bar, line, pie, area, scatter, box, and volcano plots;
- chart generation from full datasets through structured `chart-json`;
- frontend rendering with clickable and editable visual elements;
- follow-up questions directly grounded in selected points, bars, slices, labels, or other figure elements.

Example:

```text
Why is this selected gene marked as significant, and how does it compare with the other up-regulated genes?
```

Users can also select multiple elements and ask:

```text
Compare the genes I selected. What do they have in common in fold change and statistical significance?
```

#### 2. Element-Level Visual Interaction And Continuous Editing

SciDaVinci is designed for more than visual question answering. The model can interpret user intent and turn it into a sequence of visual operations: selecting elements, changing styles, adding labels, updating annotations, and producing analysis grounded in the selected subset.

A typical volcano plot workflow:

```text
In this volcano plot, select CRISPLD2, KLF15, and PER1, color them red, add labels, and analyze how these genes differ from the other significant up-regulated genes.
```

The model-driven workflow is:

1. understand which genes the user wants;
2. locate the corresponding elements in the chart data;
3. add those elements to the current selection set;
4. apply style changes such as color, labels, and opacity;
5. analyze the selected elements against the broader dataset.

The selection state can be continuous. If the user first selects gene A and then says “also select gene B,” both A and B remain selected for later editing or analysis.

#### 3. Multi-Panel Figure Composition

The collage feature is one of the original motivations for SciDaVinci. Scientific work rarely ends with a single chart; users often need to assemble several polished plots into one figure panel.

The visual workspace currently supports:

- adding charts, images, and other visual assets to a collage canvas;
- adjusting layout, spacing, size, and background;
- turning related analyses into a paper, lab meeting, or presentation-ready figure panel;
- exporting the composed figure as PNG.

### Example Workflow

```text
Read demo_data/airway_himes/volcano_dex_vs_untreated.csv and create a volcano plot highlighting up-regulated and down-regulated genes.
```

```text
Select CRISPLD2, KLF15, and PER1, color them red, and add labels.
```

```text
Also select FKBP5, then compare these four genes with the other significantly up-regulated genes.
```

```text
Create a bar chart from bar_top_changed_genes.csv, then combine the volcano plot and the bar chart into a 1x2 figure panel.
```

### Architecture

```mermaid
flowchart LR
    User["User<br/>natural-language commands / figure clicks"] --> WebUI["Web UI<br/>chat + visual workspace"]
    WebUI --> Gateway["WebSocket Gateway<br/>live sessions and streaming"]
    Gateway --> Agent["SciDaVinci Agent<br/>nanobot-based runtime"]

    Agent --> DataTools["Data Tools<br/>table reading / querying / chart generation"]
    Agent --> ActionPlanner["Visual Action Planner<br/>selection / styling / annotation / analysis"]
    Agent --> Memory["Session State<br/>continuous selection / history / workspace state"]

    DataTools --> ChartJSON["chart-json<br/>structured scientific figures"]
    ActionPlanner --> WorkspaceState["Workspace State<br/>charts / images / collages / styles"]
    Memory --> WorkspaceState

    ChartJSON --> Renderer["Frontend Renderer<br/>interactive charts / hit testing / style application"]
    WorkspaceState --> Renderer
    Renderer --> Export["Export<br/>PNG / multi-panel figures"]
```

### Demo Data

The repository includes a compact biomedical demo dataset under [`demo_data/airway_himes`](./demo_data/airway_himes).

It is based on the Himes et al. PLOS ONE airway smooth muscle RNA-seq study and demonstrates differential expression between dexamethasone-treated and untreated cells:

- `volcano_dex_vs_untreated.csv` for a volcano plot;
- `bar_top_changed_genes.csv` for top changed genes;
- `line_selected_gene_expression.csv` for selected gene expression trends;
- `pie_deg_categories.csv` for DEG category summaries;
- `box_expression_distribution.csv` for expression distribution summaries.

### Quick Start

Install from source:

```bash
git clone <your-repo-url>
cd biodavinci
pip install -e .
```

Initialize the local workspace:

```bash
biodavinci onboard
```

Configure a model in `~/.nanobot/config.json`, for example with OpenRouter:

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

Start terminal chat:

```bash
biodavinci agent
```

### Web UI Development

Enable the WebSocket channel in `~/.nanobot/config.json`:

```json
{
  "channels": {
    "websocket": {
      "enabled": true
    }
  }
}
```

Start the gateway:

```bash
biodavinci gateway
```

Start the frontend:

```bash
cd webui
bun install
bun run dev
```

Open the local Vite URL, usually `http://localhost:5173`.

### Repository Layout

```text
.
├── nanobot/                 # nanobot-based agent runtime, tools, channels, memory, skills
├── webui/                   # React/Vite visual workspace
├── bridge/                  # TypeScript bridge for selected chat integrations
├── demo_data/airway_himes/  # biomedical demo data
├── docs/                    # config, deployment, API, and workbench design docs
├── tests/                   # Python tests
├── images/                  # README and product images
└── pyproject.toml           # Python package metadata
```

### Development

```bash
pip install -e ".[dev]"
pytest
```

```bash
cd webui
bun install
bun run test
bun run build
```

### Roadmap

- Complete the public rename to **SciDaVinci**;
- strengthen figure element selection, continuous selection, and multi-element analysis;
- synchronize model actions with visual workspace state more strictly;
- add more scientific plotting templates and journal-style presets;
- improve collage layout, export sizing, captions, and panel labels;
- deepen model analysis across figures, tables, and biological context.

### License And Acknowledgements

This project is released under the MIT License. See [`LICENSE`](./LICENSE) and [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).

SciDaVinci is built on top of the lightweight open-source `nanobot` agent architecture. Since `nanobot` is MIT-licensed, keeping the original copyright and license text is appropriate and required when distributing substantial portions of the code. Acknowledging the foundation in the README also makes the project lineage clear.
