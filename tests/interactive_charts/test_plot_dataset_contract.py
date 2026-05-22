"""Small release tests for SciDaVinci interactive chart generation."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from nanobot.agent.dataset.registry import DatasetRegistry
from nanobot.agent.tools.dataset import PlotDatasetTool
from nanobot.config.schema import DatasetsConfig


SUPPORTED_CHART_TYPES = ("bar", "line", "pie", "area", "box", "volcano")


def _chart_json_payload(result: str) -> dict[str, object]:
    assert result.startswith("```chart-json\n")
    assert result.endswith("\n```")
    return json.loads(result.removeprefix("```chart-json\n").removesuffix("\n```"))


@pytest.fixture
def registry(tmp_path: Path) -> tuple[DatasetRegistry, str]:
    csv_path = tmp_path / "mini_expression.csv"
    csv_path.write_text(
        "gene,log2FoldChange,negLog10P,meanExpression\n"
        "CRISPLD2,2.4,8.1,14.2\n"
        "KLF15,1.7,5.3,11.8\n"
        "PER1,1.2,3.9,9.6\n",
        encoding="utf-8",
    )
    reg = DatasetRegistry(
        DatasetsConfig(
            enabled=True,
            inline_spreadsheets=False,
            max_query_rows=100,
            max_query_chars=10_000,
            max_profile_rows=5,
        ),
    )
    dataset_id = reg.register(csv_path)
    return reg, dataset_id


@pytest.mark.parametrize("chart_type", SUPPORTED_CHART_TYPES)
async def test_plot_dataset_emits_supported_chart_json(
    registry: tuple[DatasetRegistry, str],
    chart_type: str,
) -> None:
    reg, dataset_id = registry
    tool = PlotDatasetTool(reg)

    result = await tool.execute(
        dataset_id=dataset_id,
        chart_type=chart_type,
        x_field="gene",
        y_fields="log2FoldChange",
        title=f"Mini {chart_type}",
    )

    payload = _chart_json_payload(result)
    assert payload["type"] == chart_type
    assert payload["title"] == f"Mini {chart_type}"
    assert payload["xField"] == "gene"
    assert payload["data"]


async def test_volcano_chart_records_value_fields(
    registry: tuple[DatasetRegistry, str],
) -> None:
    reg, dataset_id = registry
    tool = PlotDatasetTool(reg)

    result = await tool.execute(
        dataset_id=dataset_id,
        chart_type="volcano",
        x_field="log2FoldChange",
        y_fields="negLog10P",
        title="Mini volcano",
    )

    payload = _chart_json_payload(result)
    assert payload["type"] == "volcano"
    assert payload["xValueField"] == "log2FoldChange"
    assert payload["yValueField"] == "negLog10P"
