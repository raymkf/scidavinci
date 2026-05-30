"""Dataset tools: list, inspect, query, and plot uploaded spreadsheets.

All tools follow the :class:`~nanobot.agent.tools.base.Tool` protocol
and are registered by :class:`~nanobot.agent.loop.AgentLoop` when
``tools.datasets.enabled`` is True.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, TYPE_CHECKING

from nanobot.agent.tools.base import Tool, tool_parameters
from nanobot.agent.tools.chart_renderer import render_chart
from nanobot.agent.tools.schema import (
    IntegerSchema,
    StringSchema,
    tool_parameters_schema,
)
from nanobot.config.paths import get_media_dir

if TYPE_CHECKING:
    from nanobot.agent.dataset.registry import DatasetRegistry


# ---------------------------------------------------------------------------
# list_datasets
# ---------------------------------------------------------------------------


@tool_parameters(tool_parameters_schema(
    description="List all uploaded datasets for the current session.",
))
class ListDatasetsTool(Tool):
    """List all uploaded datasets with their profiles."""

    def __init__(self, registry: DatasetRegistry) -> None:
        self._registry = registry

    @property
    def name(self) -> str:
        return "list_datasets"

    @property
    def description(self) -> str:
        return (
            "List all uploaded datasets (CSV/TSV/XLSX) available in the current session. "
            "Returns dataset IDs, filenames, shapes, and column summaries. "
            "Use this first before calling inspect_dataset, query_dataset, or plot_dataset."
        )

    @property
    def read_only(self) -> bool:
        return True

    async def execute(self) -> str:
        summaries = self._registry.list_summaries()
        if not summaries:
            return "No datasets have been uploaded in this session."

        lines = [f"{len(summaries)} dataset(s) available:\n"]
        for s in summaries:
            shape = f"{s['shape'][0]}r x {s['shape'][1]}c" if s["shape"] else "?"
            cols = ", ".join(f"{c['name']}:{c['dtype']}" for c in s["columns"][:10])
            if len(s["columns"]) > 10:
                cols += f" ... (+{len(s['columns']) - 10} more)"
            lines.append(
                f"  [{s['dataset_id']}] {s['filename']} ({s['file_type']}, {shape})"
                f"\n    columns: {cols}"
            )
        return "\n".join(lines)


# ---------------------------------------------------------------------------
# inspect_dataset
# ---------------------------------------------------------------------------


@tool_parameters(tool_parameters_schema(
    required=["dataset_id"],
    dataset_id=StringSchema(description="Dataset ID from list_datasets"),
    sample_rows=IntegerSchema(
        value=10, minimum=1, maximum=50,
        description="Number of sample rows to return (default 10)",
    ),
    columns=StringSchema(
        description="Comma-separated column names to focus on (omit for all columns)",
        nullable=True,
    ),
))
class InspectDatasetTool(Tool):
    """Inspect a dataset's schema, statistics, and sample rows."""

    def __init__(self, registry: DatasetRegistry) -> None:
        self._registry = registry

    @property
    def name(self) -> str:
        return "inspect_dataset"

    @property
    def description(self) -> str:
        return (
            "Inspect a dataset's structure: column names, types, basic statistics "
            "(min/max/mean for numeric columns, null counts), and sample rows. "
            "Use this to understand the data before querying or plotting."
        )

    @property
    def read_only(self) -> bool:
        return True

    async def execute(
        self,
        dataset_id: str,
        sample_rows: int = 10,
        columns: str | None = None,
    ) -> str:
        entry = self._registry.get(dataset_id)
        if entry is None:
            return f"Error: dataset '{dataset_id}' not found. Use list_datasets first."

        _, profile = entry

        # Column filter
        target_cols = [c.strip() for c in columns.split(",")] if columns else None
        col_profiles = profile.columns
        if target_cols:
            col_profiles = [c for c in col_profiles if c.name in target_cols]
            if not col_profiles:
                return f"Error: none of the requested columns ({columns}) found in dataset."

        lines = [
            f"Dataset: {dataset_id} ({profile.source_filename})",
            f"Shape: {profile.shape[0]} rows x {profile.shape[1]} columns",
            f"Type: {profile.file_type}",
        ]
        if profile.sheet_names and len(profile.sheet_names) > 1:
            lines.append(f"Sheets: {', '.join(profile.sheet_names)}")
        if profile.notes:
            for note in profile.notes:
                lines.append(f"Note: {note}")

        lines.append("\n--- Column Summary ---")
        for col in col_profiles:
            extras = []
            if col.mean_val is not None:
                extras.append(f"mean={col.mean_val:.4g}")
            if col.min_val is not None:
                extras.append(f"min={col.min_val:.4g}")
            if col.max_val is not None:
                extras.append(f"max={col.max_val:.4g}")
            extra_str = f" ({', '.join(extras)})" if extras else ""
            null_str = f" {col.null_count} nulls" if col.null_count else ""
            sample_str = ", ".join(repr(s) for s in col.sample_values[:3])
            lines.append(
                f"  {col.name}: {col.dtype}{extra_str}{null_str}"
                f"  | samples: {sample_str}"
            )

        # Sample rows via DuckDB
        if sample_rows > 0 and profile.shape[0] > 0:
            lines.append(f"\n--- Sample Rows (first {sample_rows}) ---")
            try:
                sql = f"SELECT * FROM data LIMIT {min(sample_rows, 50)}"
                result = self._registry.query(dataset_id, sql)
                # Extract just the data portion (strip the "Query result:" header)
                if result.startswith("Query result:"):
                    _, _, data = result.partition("\n\n")
                    lines.append(data if data else result)
                else:
                    lines.append(result)
            except Exception as e:
                lines.append(f"(could not fetch sample rows: {e})")

        return "\n".join(lines)


# ---------------------------------------------------------------------------
# query_dataset
# ---------------------------------------------------------------------------


@tool_parameters(tool_parameters_schema(
    required=["dataset_id", "query"],
    dataset_id=StringSchema(description="Dataset ID from list_datasets"),
    query=StringSchema(
        description=(
            "SQL SELECT query to execute against the dataset. "
            "The table is named 'data'. Examples:\n"
            "  SELECT * FROM data LIMIT 10\n"
            "  SELECT region, SUM(revenue) AS total FROM data GROUP BY region ORDER BY total DESC\n"
            "  SELECT AVG(value) FROM data WHERE category = 'A'\n"
            "Only SELECT is allowed."
        ),
    ),
))
class QueryDatasetTool(Tool):
    """Execute a SELECT-only SQL query against a registered dataset."""

    def __init__(self, registry: DatasetRegistry) -> None:
        self._registry = registry

    @property
    def name(self) -> str:
        return "query_dataset"

    @property
    def description(self) -> str:
        return (
            "Execute a SQL SELECT query against an uploaded dataset. "
            "The dataset is available as a table named 'data'. "
            "Use standard SQL: SELECT, WHERE, GROUP BY, HAVING, ORDER BY, "
            "aggregate functions (COUNT, SUM, AVG, MIN, MAX, etc.). "
            "Results are limited to prevent context overflow. "
            "Only SELECT queries are allowed for security."
        )

    @property
    def read_only(self) -> bool:
        return True

    async def execute(self, dataset_id: str, query: str) -> str:
        return self._registry.query(dataset_id, query)


# ---------------------------------------------------------------------------
# plot_dataset
# ---------------------------------------------------------------------------


@tool_parameters(tool_parameters_schema(
    required=["dataset_id", "chart_type"],
    dataset_id=StringSchema(description="Dataset ID from list_datasets"),
    chart_type=StringSchema(
        description="Chart type",
        enum=[
            "bar", "line", "pie", "area", "box", "volcano",
            "scatter", "violin", "heatmap", "pca", "bubble",
            "venn", "upset", "histogram", "density",
            "stacked_bar", "gsea", "correlation_heatmap", "enrichment_bar",
        ],
    ),
    x_field=StringSchema(
        description="Column name for the x-axis / category axis",
        nullable=True,
    ),
    y_fields=StringSchema(
        description="Comma-separated column name(s) for the y-axis / value axis",
        nullable=True,
    ),
    title=StringSchema(
        description="Chart title (auto-generated if omitted)",
        nullable=True,
    ),
    group_field=StringSchema(
        description="Column to group/colour by (optional)",
        nullable=True,
    ),
    aggregate=StringSchema(
        description="Aggregation function if data needs summarising: sum, avg, count, min, max (optional)",
        nullable=True,
    ),
    top_n=IntegerSchema(
        value=0, minimum=0, maximum=500,
        description="Limit to top N groups after aggregation (0 = no limit)",
    ),
    max_rows=IntegerSchema(
        value=500, minimum=1, maximum=2000,
        description="Maximum data points in the chart (default 500)",
    ),
    journal=StringSchema(
        description="Journal style preset: nature, science, cell, lancet (default nature)",
        nullable=True,
        enum=["nature", "science", "cell", "lancet"],
    ),
    aspect_ratio=StringSchema(
        description="Chart aspect ratio, e.g. '4:3', '1:1', '16:9' (default '4:3')",
        nullable=True,
    ),
    x_label=StringSchema(
        description="X-axis label (optional, derived from field name if omitted)",
        nullable=True,
    ),
    y_label=StringSchema(
        description="Y-axis label (optional, derived from field name if omitted)",
        nullable=True,
    ),
    element_styles=StringSchema(
        description="Optional: JSON string mapping element keys to style overrides. "
        "Keys use 'category' (gene name, bar label) or 'series@@category' for grouped charts. "
        'Example: \'{"TP53": {"color": "#FF0000", "fillOpacity": 0.5}, '
        '"Treatment@@Cell Line A": {"color": "#D55E00"}}\'. '
        "Supported style fields: color, fillOpacity, stroke, strokeWidth, pointSize, visible.",
        nullable=True,
    ),
))
class PlotDatasetTool(Tool):
    """Generate a publication-quality chart from dataset data using
    Python matplotlib/seaborn.

    The output is a `` ```chart-image `` fenced code block containing a JSON
    payload with the rendered PNG URL, overlay zones for interaction, and
    metadata.  The frontend displays the PNG as a Konva image with a
    transparent overlay layer for element selection.
    """

    def __init__(self, registry: DatasetRegistry, output_dir: Path | None = None) -> None:
        self._registry = registry
        self._output_dir = output_dir or get_media_dir("websocket")

    @property
    def name(self) -> str:
        return "plot_dataset"

    @property
    def description(self) -> str:
        return (
            "Generate a publication-quality interactive chart from an uploaded "
            "dataset. The chart is rendered with Python matplotlib/seaborn and "
            "returned as a ```chart-image code block containing the rendered PNG "
            "URL and overlay zones for element interaction. "
            "For general requests like 'visualize this table', call this tool "
            "only after you have inspected/listed the dataset and confirmed "
            "which chart type(s) the user wants, usually via ask_user options. "
            "If the user selected multiple charts, call this once per selected "
            "chart and copy each returned ```chart-image block verbatim into "
            "the final assistant message. Do not create unselected charts. "
            "Use this AFTER inspecting or querying the dataset to understand "
            "its structure. "
            "Supported chart types: bar, line, pie, area, box, volcano, "
            "scatter, violin, heatmap, pca, bubble, venn, upset, histogram, "
            "density, stacked_bar, gsea, correlation_heatmap, enrichment_bar.\n"
            "The chart data is computed from the FULL dataset file (not a sample), "
            "so aggregations and statistics are accurate.\n"
            "The chart is rendered at 150 DPI (publication quality) and the "
            "frontend overlay enables interactive element selection."
        )

    @property
    def read_only(self) -> bool:
        return True

    async def execute(
        self,
        dataset_id: str,
        chart_type: str,
        x_field: str | None = None,
        y_fields: str | None = None,
        title: str | None = None,
        group_field: str | None = None,
        aggregate: str | None = None,
        top_n: int = 0,
        max_rows: int = 500,
        journal: str | None = None,
        aspect_ratio: str | None = None,
        x_label: str | None = None,
        y_label: str | None = None,
        element_styles: str | None = None,
    ) -> str:
        entry = self._registry.get(dataset_id)
        if entry is None:
            return f"Error: dataset '{dataset_id}' not found. Use list_datasets first."

        _, profile = entry
        columns = {c.name: c for c in profile.columns}

        # Auto-detect fields if not provided
        if not x_field:
            for c in profile.columns:
                if c.dtype == "string":
                    x_field = c.name
                    break
            if not x_field and profile.columns:
                x_field = profile.columns[0].name

        if not y_fields:
            num_cols = [c.name for c in profile.columns if c.dtype in ("integer", "float")]
            if num_cols:
                y_fields = ",".join(num_cols[:3])
            elif len(profile.columns) > 1:
                y_fields = profile.columns[1].name

        if not x_field or not y_fields:
            return (
                "Error: could not determine x_field and y_fields. "
                "Please specify them explicitly based on the column names from inspect_dataset."
            )

        y_list = [y.strip() for y in y_fields.split(",")]
        if not y_list:
            return "Error: y_fields is empty."

        # Build SQL query
        select_parts = [f'"{x_field}"']
        agg_func = aggregate.lower() if aggregate else None

        if agg_func and agg_func in ("sum", "avg", "count", "min", "max"):
            sql_agg = "AVG" if agg_func == "avg" else agg_func.upper()
            for yf in y_list:
                select_parts.append(f'{sql_agg}("{yf}") AS "{yf}"')
        else:
            for yf in y_list:
                select_parts.append(f'"{yf}"')

        if agg_func:
            group_clause = f'"{x_field}"'
            if group_field and group_field != x_field:
                select_parts.append(f'"{group_field}"')
                group_clause = f'"{x_field}", "{group_field}"'
            sql = (
                f"SELECT {', '.join(select_parts)} FROM data"
                f" GROUP BY {group_clause}"
            )
        else:
            sql = "SELECT * FROM data"

        if top_n > 0 and agg_func:
            sql += f" ORDER BY \"{y_list[0]}\" DESC"
        elif top_n > 0:
            sql += f" ORDER BY \"{y_list[0]}\" DESC"
        sql += f" LIMIT {max_rows}"

        # Execute query
        raw_result = self._registry.query(dataset_id, sql)
        if raw_result.startswith("Error"):
            return raw_result

        data_text = raw_result
        if "Query result:" in data_text:
            _, _, data_text = data_text.partition("\n\n")

        lines = data_text.strip().split("\n")
        if len(lines) < 2:
            return "Error: query returned insufficient data for plotting."

        headers = lines[0].split("\t")
        data_rows = lines[1:]

        # Build data array
        chart_data: list[dict[str, Any]] = []
        for row_text in data_rows:
            parts = row_text.split("\t")
            row_obj: dict[str, Any] = {}
            for i, h in enumerate(headers):
                val = parts[i] if i < len(parts) else ""
                col = columns.get(h)
                if col and col.dtype in ("integer", "float"):
                    try:
                        row_obj[h] = float(val) if "." in val or "e" in val.lower() else int(val)
                    except (ValueError, TypeError):
                        row_obj[h] = val
                else:
                    row_obj[h] = val
            chart_data.append(row_obj)

        if not chart_data:
            return "Error: no data rows in query result."

        # Build render config
        resolved_y_field = y_list[0]
        y_fields_list = y_list if len(y_list) > 1 else None

        render_config: dict[str, Any] = {
            "type": chart_type,
            "title": title or f"{' vs '.join(y_list)} by {x_field}",
            "xField": x_field,
            "yField": resolved_y_field,
            "journal": journal,
            "aspectRatio": aspect_ratio,
            "xLabel": x_label,
            "yLabel": y_label,
        }

        if y_fields_list:
            render_config["yFields"] = y_fields_list
        if group_field:
            render_config["groupField"] = group_field
        if element_styles:
            try:
                render_config["elementStyles"] = json.loads(element_styles)
            except json.JSONDecodeError:
                pass

        # Chart-type-specific field mappings
        if chart_type == "pie":
            render_config["valueField"] = resolved_y_field
            render_config["nameField"] = x_field
        elif chart_type == "volcano":
            render_config["xValueField"] = x_field
            render_config["yValueField"] = resolved_y_field

        # Render with matplotlib
        result = render_chart(chart_type, chart_data, render_config, self._output_dir)

        # Build image URL (relative path served by /api/charts/ route)
        image_url = f"/api/charts/{result.image_path.split('/')[-1]}"

        chart_json = result.to_chart_image_json(image_url)
        return f"```chart-image\n{chart_json}\n```"
