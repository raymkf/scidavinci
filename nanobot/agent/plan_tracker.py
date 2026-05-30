"""Lightweight plan-mode tracking for the agent loop.

The model outputs ``<plot_plan>`` JSON blocks (see PlanCard / SKILL.md).
This module parses those blocks, tracks execution state, and injects
status summaries into the model context so interrupted plan flows can
resume cleanly.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class PlanChartState:
    chart_type: str
    display_name: str = ""
    generated: bool = False
    chart_config: dict[str, Any] | None = None  # last generated config


@dataclass
class PlanState:
    plan_id: str
    title: str = ""
    description: str = ""
    datasets: list[str] = field(default_factory=list)
    charts: list[PlanChartState] = field(default_factory=list)
    confirmed: bool = False
    raw_plan: dict[str, Any] | None = None

    def pending_charts(self) -> list[PlanChartState]:
        return [c for c in self.charts if not c.generated]

    def completed_charts(self) -> list[PlanChartState]:
        return [c for c in self.charts if c.generated]

    def mark_generated(self, chart_type: str, config: dict[str, Any] | None = None) -> None:
        for c in self.charts:
            if c.chart_type == chart_type:
                c.generated = True
                if config:
                    c.chart_config = config
                return
        # Chart type not in original plan — add it
        self.charts.append(PlanChartState(chart_type=chart_type, display_name=chart_type, generated=True, chart_config=config))

    def is_complete(self) -> bool:
        return self.confirmed and all(c.generated for c in self.charts) and len(self.charts) > 0

    def status_text(self) -> str:
        if not self.confirmed:
            return f"Plan '{self.title}' ({self.plan_id}): awaiting user confirmation."
        pending = self.pending_charts()
        completed = self.completed_charts()
        lines = [f"Plan '{self.title}' ({self.plan_id}):"]
        if completed:
            lines.append(f"  Generated: {', '.join(c.chart_type for c in completed)}")
        if pending:
            lines.append(f"  Pending: {', '.join(c.chart_type for c in pending)}")
        if not pending and completed:
            lines.append("  All charts generated.")
        return "\n".join(lines)


_PLAN_TAG_RE = re.compile(r"<plot_plan>([\s\S]*?)</plot_plan>", re.IGNORECASE)


def extract_plans(text: str) -> list[dict[str, Any]]:
    """Extract all ``<plot_plan>`` JSON blocks from *text*."""
    plans: list[dict[str, Any]] = []
    for match in _PLAN_TAG_RE.finditer(text):
        try:
            plan = json.loads(match.group(1))
            if isinstance(plan, dict) and "plan_id" in plan:
                plans.append(plan)
        except json.JSONDecodeError:
            continue
    return plans


def plan_to_state(plan: dict[str, Any]) -> PlanState:
    """Convert a raw plan dict to a PlanState."""
    charts = [
        PlanChartState(
            chart_type=r.get("chart_type", ""),
            display_name=r.get("display_name", r.get("chart_type", "")),
        )
        for r in plan.get("recommendations", [])
    ]
    return PlanState(
        plan_id=plan.get("plan_id", ""),
        title=plan.get("title", ""),
        description=plan.get("description", ""),
        datasets=plan.get("datasets", []),
        charts=charts,
        raw_plan=plan,
    )


def detect_chart_generation(text: str) -> list[str]:
    """Detect which chart types were generated from model output.

    Looks for `` ```chart-image `` blocks and extracts the ``type`` field.
    Also detects legacy `` ```chart-canvas `` blocks.
    """
    chart_types: list[str] = []
    # Match chart-image and chart-canvas code blocks, extract type
    block_re = re.compile(r"```(?:chart-image|chart-canvas)\s*\n(.*?)```", re.DOTALL)
    for match in block_re.finditer(text):
        try:
            config = json.loads(match.group(1))
            ct = config.get("type")
            if ct:
                chart_types.append(ct)
        except json.JSONDecodeError:
            continue
    return chart_types


class PlanTracker:
    """Tracks plan execution across turns within a session."""

    def __init__(self) -> None:
        self._plans: dict[str, PlanState] = {}  # plan_id → PlanState

    def process_model_output(self, text: str) -> list[PlanState]:
        """Scan model output for new plans and chart generations.

        Returns newly discovered plan states (not previously tracked).
        """
        new_plans: list[PlanState] = []

        # Discover new plans
        raw_plans = extract_plans(text)
        for raw in raw_plans:
            pid = raw.get("plan_id", "")
            if pid and pid not in self._plans:
                state = plan_to_state(raw)
                self._plans[pid] = state
                new_plans.append(state)

        # Track chart generations
        generated = detect_chart_generation(text)
        for ct in generated:
            for state in self._plans.values():
                state.mark_generated(ct)

        return new_plans

    def confirm_plan(self, plan_id: str) -> PlanState | None:
        """Mark a plan as confirmed by the user."""
        state = self._plans.get(plan_id)
        if state:
            state.confirmed = True
        return state

    def get_active_plan(self) -> PlanState | None:
        """Return the most recent unconfirmed or incomplete plan."""
        for state in reversed(list(self._plans.values())):
            if not state.is_complete():
                return state
        return None

    def get_status_summary(self) -> str:
        """Return a concise status summary for injection into model context."""
        if not self._plans:
            return ""
        lines = ["[Plan Execution Status]"]
        for state in self._plans.values():
            lines.append(state.status_text())
        return "\n".join(lines)
