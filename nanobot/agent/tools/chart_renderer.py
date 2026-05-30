"""Publication-quality chart rendering with matplotlib/seaborn.

Each renderer produces a PNG image + an overlay zone list so the frontend
Konva overlay layer can align hit-targets with the visual chart elements.

Architecture::

    render_chart(config, output_dir) -> ChartRenderResult
        dispatch via _RENDERERS[chart_type]
            _render_bar, _render_line, _render_volcano, ...

All renderers:
  - Create an 800px-wide figure at 150 DPI.
  - Apply journal presets (Nature/Science/Cell/Lancet).
  - Use the Wong 2011 colorblind-friendly palette.
  - Extract pixel-coordinate zones via artist.get_window_extent().
  - Save a PNG and return image metadata + zones.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

import matplotlib
import matplotlib.pyplot as plt
import numpy as np

matplotlib.use("Agg")  # non-interactive backend

import matplotlib.ticker as mticker  # noqa: E402
from matplotlib.patches import Circle, FancyBboxPatch, Wedge  # noqa: E402

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

IMAGE_WIDTH = 800  # px — fixed render width for screen
SCREEN_DPI = 150  # DPI for screen rendering
EXPORT_DPI = 300  # DPI for publication export

# Ensure consistent pixel dimensions across all renderers.
matplotlib.rcParams["figure.dpi"] = SCREEN_DPI

# Wong 2011 colorblind-friendly palette (Nature Methods)
CB_PALETTE = [
    "#0072B2",  # blue
    "#D55E00",  # vermillion
    "#009E73",  # green
    "#CC79A7",  # reddish purple
    "#E69F00",  # orange
    "#56B4E9",  # sky blue
    "#F0E442",  # yellow
    "#000000",  # black
]

# Extended palette for charts with many categories
CB_PALETTE_EXTENDED = CB_PALETTE + [
    "#8C564B",  # brown
    "#7F7F7F",  # grey
    "#BCBD22",  # olive
    "#17BECF",  # cyan
    "#E377C2",  # pink
    "#9467BD",  # purple
]

# Journal presets
JOURNAL_PRESETS: dict[str, dict[str, Any]] = {
    "nature": {
        "font.family": "sans-serif",
        "font.sans-serif": ["Arial", "Helvetica", "DejaVu Sans"],
        "font.size": 10,
        "axes.titlesize": 12,
        "axes.labelsize": 10,
        "xtick.labelsize": 9,
        "ytick.labelsize": 9,
        "legend.fontsize": 9,
        "axes.linewidth": 0.8,
        "xtick.major.width": 0.8,
        "ytick.major.width": 0.8,
        "xtick.major.size": 4,
        "ytick.major.size": 4,
        "xtick.direction": "in",
        "ytick.direction": "in",
        "figure.dpi": SCREEN_DPI,
    },
    "science": {
        "font.family": "sans-serif",
        "font.sans-serif": ["Helvetica", "Arial", "DejaVu Sans"],
        "font.size": 10,
        "axes.titlesize": 11,
        "axes.labelsize": 10,
        "xtick.labelsize": 8,
        "ytick.labelsize": 8,
        "legend.fontsize": 8,
        "axes.linewidth": 0.7,
        "xtick.major.width": 0.7,
        "ytick.major.width": 0.7,
        "xtick.major.size": 3.5,
        "ytick.major.size": 3.5,
        "xtick.direction": "in",
        "ytick.direction": "in",
        "figure.dpi": SCREEN_DPI,
    },
    "cell": {
        "font.family": "sans-serif",
        "font.sans-serif": ["Arial", "Helvetica", "DejaVu Sans"],
        "font.size": 10,
        "axes.titlesize": 11,
        "axes.labelsize": 10,
        "xtick.labelsize": 9,
        "ytick.labelsize": 9,
        "legend.fontsize": 9,
        "axes.linewidth": 0.8,
        "xtick.major.width": 0.8,
        "ytick.major.width": 0.8,
        "xtick.major.size": 4,
        "ytick.major.size": 4,
        "xtick.direction": "in",
        "ytick.direction": "in",
        "figure.dpi": SCREEN_DPI,
    },
    "lancet": {
        "font.family": "serif",
        "font.serif": ["Times New Roman", "DejaVu Serif"],
        "font.size": 10,
        "axes.titlesize": 12,
        "axes.labelsize": 10,
        "xtick.labelsize": 9,
        "ytick.labelsize": 9,
        "legend.fontsize": 9,
        "axes.linewidth": 0.8,
        "xtick.major.width": 0.8,
        "ytick.major.width": 0.8,
        "xtick.major.size": 4,
        "ytick.major.size": 4,
        "xtick.direction": "in",
        "ytick.direction": "in",
        "figure.dpi": SCREEN_DPI,
    },
}


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------


@dataclass
class OverlayZone:
    """A clickable zone in pixel coordinates (top-left origin, matching PNG)."""

    id: str
    x: float
    y: float
    width: float
    height: float
    metadata: dict[str, Any] = field(default_factory=dict)
    hit_tolerance: int = 6


# Canonical field-mapping keys that the frontend needs for semantic selection.
_FIELD_KEYS = (
    "xField", "yField", "yFields",
    "xValueField", "yValueField", "pValueField",
    "valueField", "nameField", "labelField", "groupField",
    "sizeField", "idField", "seriesField",
    "minField", "q1Field", "medianField", "q3Field", "maxField",
    "outliersField", "xLabel", "yLabel", "unit",
)


@dataclass
class ChartRenderResult:
    """Output from a chart renderer."""

    image_path: str  # relative path for the frontend, e.g. "charts/chart_xxx.png"
    image_width: int
    image_height: int
    chart_type: str
    title: str | None
    zones: list[OverlayZone] = field(default_factory=list)
    field_mappings: dict[str, Any] = field(default_factory=dict)
    data: list[dict[str, Any]] = field(default_factory=list)

    def to_chart_image_json(self, image_url: str) -> str:
        """Serialise to the ``chart-image`` JSON format for the frontend."""
        payload: dict[str, Any] = {
            "imageUrl": image_url,
            "imageWidth": self.image_width,
            "imageHeight": self.image_height,
            "type": self.chart_type,
            "title": self.title,
            "fieldMappings": self.field_mappings,
            "data": self.data,
            "zones": [
                {
                    "id": z.id,
                    "x": round(z.x, 1),
                    "y": round(z.y, 1),
                    "width": round(z.width, 1),
                    "height": round(z.height, 1),
                    "metadata": z.metadata,
                }
                for z in self.zones
            ],
        }
        return json.dumps(payload, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _apply_journal_preset(preset: str | None) -> None:
    """Configure matplotlib rcParams for a journal style."""
    if preset and preset in JOURNAL_PRESETS:
        plt.rcParams.update(JOURNAL_PRESETS[preset])
    else:
        plt.rcParams.update(JOURNAL_PRESETS["nature"])

    # Append CJK fallback fonts so Chinese/Japanese/Korean characters
    # in titles, labels, and data values render correctly instead of
    # showing empty boxes (tofu).  These fonts are available on macOS,
    # common Linux desktop installs, and Windows.
    _CJK_SANS = [
        "PingFang HK", "Hiragino Sans GB", "STHeiti",
        "Noto Sans CJK SC", "Noto Sans CJK TC",
        "Microsoft YaHei", "SimHei", "Arial Unicode MS",
        "WenQuanYi Micro Hei", "WenQuanYi Zen Hei",
    ]
    _CJK_SERIF = [
        "Songti SC", "STSong", "SimSun",
        "Noto Serif CJK SC",
    ]
    _CJK_MONO = [
        "PingFang HK", "STFangsong",
        "Noto Sans Mono CJK SC",
    ]

    sans_list: list[str] = list(plt.rcParams.get("font.sans-serif", []))
    serif_list: list[str] = list(plt.rcParams.get("font.serif", []))
    mono_list: list[str] = list(plt.rcParams.get("font.monospace", []))

    for f in _CJK_SANS:
        if f not in sans_list:
            sans_list.append(f)
    for f in _CJK_SERIF:
        if f not in serif_list:
            serif_list.append(f)
    for f in _CJK_MONO:
        if f not in mono_list:
            mono_list.append(f)

    plt.rcParams["font.sans-serif"] = sans_list
    plt.rcParams["font.serif"] = serif_list
    plt.rcParams["font.monospace"] = mono_list


def _fig_width_inches(width_px: int = IMAGE_WIDTH) -> float:
    return width_px / SCREEN_DPI


def _extract_zones(
    fig: plt.Figure,
    artists: list[tuple[Any, dict[str, Any]]],
) -> list[OverlayZone]:
    """Extract pixel-coordinate zones from matplotlib artists.

    ``artists`` is a list of ``(artist, metadata)`` tuples.  The metadata dict
    must include at least an ``"id"`` key.

    Coordinates are converted from matplotlib bottom-left origin to image
    top-left origin (flipping the Y axis).
    """
    renderer = fig.canvas.get_renderer()
    if renderer is None:
        return []

    fig_bbox = fig.bbox  # (0, 0, fig_w_px, fig_h_px)
    fig_h = fig_bbox.height

    zones: list[OverlayZone] = []
    for artist, meta in artists:
        try:
            bbox = artist.get_window_extent(renderer)
            x = bbox.x0
            y = fig_h - bbox.y1  # flip Y
            w = bbox.width
            h = bbox.height
            if w < 1 or h < 1:
                continue

            zone_meta = dict(meta.get("metadata", meta))

            # Detect Circle artists (bubble / scatter points) and embed
            # centre + radius so the frontend can render circular highlights.
            if isinstance(artist, Circle):
                zone_meta["_shape"] = "circle"
                try:
                    ax = artist.axes
                    if ax is not None:
                        trans = ax.transData
                        cx_disp, cy_disp = trans.transform(artist.center)
                        zone_meta["_circle_cx"] = float(cx_disp)
                        zone_meta["_circle_cy"] = float(fig_h - cy_disp)
                        edge_x, _ = trans.transform(
                            (artist.center[0] + artist.radius, artist.center[1])
                        )
                        zone_meta["_circle_r"] = float(abs(edge_x - cx_disp))
                except Exception:
                    zone_meta.pop("_shape", None)

            # Detect Wedge artists (pie / donut slices) and embed arc
            # parameters so the frontend can render wedge-shaped highlights
            # instead of rectangular bounding boxes.
            if isinstance(artist, Wedge):
                zone_meta["_shape"] = "wedge"
                try:
                    ax = artist.axes
                    if ax is not None:
                        trans = ax.transData
                        cx_disp, cy_disp = trans.transform(artist.center)
                        zone_meta["_wedge_cx"] = float(cx_disp)
                        zone_meta["_wedge_cy"] = float(fig_h - cy_disp)
                        edge_x, _ = trans.transform(
                            (artist.center[0] + artist.r, artist.center[1])
                        )
                        zone_meta["_wedge_r"] = float(abs(edge_x - cx_disp))
                        zone_meta["_wedge_theta1"] = float(artist.theta1)
                        zone_meta["_wedge_theta2"] = float(artist.theta2)
                except Exception:
                    # If coordinate transform fails, fall back to rect highlight.
                    zone_meta.pop("_shape", None)

            zones.append(
                OverlayZone(
                    id=meta.get("id", str(uuid.uuid4())),
                    x=x,
                    y=y,
                    width=w,
                    height=h,
                    metadata=zone_meta,
                    hit_tolerance=meta.get("hit_tolerance", 6),
                )
            )
        except Exception:
            continue
    return zones


def _figure_size(aspect_ratio: str | float | None = None) -> tuple[int, int]:
    """Return (width_px, height_px) for the given aspect ratio.

    Default aspect ratio is 4:3.
    """
    if aspect_ratio is None:
        return IMAGE_WIDTH, int(IMAGE_WIDTH * 3 / 4)  # 800x600

    if isinstance(aspect_ratio, (int, float)):
        return IMAGE_WIDTH, int(IMAGE_WIDTH / aspect_ratio)

    parts = str(aspect_ratio).split(":")
    if len(parts) == 2:
        try:
            w_ratio, h_ratio = float(parts[0]), float(parts[1])
            if w_ratio > 0 and h_ratio > 0:
                return IMAGE_WIDTH, int(IMAGE_WIDTH * h_ratio / w_ratio)
        except (ValueError, ZeroDivisionError):
            pass

    return IMAGE_WIDTH, int(IMAGE_WIDTH * 3 / 4)


def _save_and_result(
    fig: plt.Figure,
    output_dir: Path,
    chart_type: str,
    title: str | None,
    zones: list[OverlayZone],
) -> ChartRenderResult:
    """Save the figure as PNG and return a ChartRenderResult.

    The PNG is saved at *fig.dpi* (set to SCREEN_DPI globally) so the pixel
    dimensions match *fig.bbox* exactly.  Zones already reference the
    fig.bbox coordinate space, so no re-referencing is needed.
    """
    charts_dir = output_dir / "charts"
    charts_dir.mkdir(parents=True, exist_ok=True)

    chart_id = uuid.uuid4().hex[:12]
    fname = f"chart_{chart_id}.png"
    fpath = charts_dir / fname

    fig.savefig(fpath, dpi=SCREEN_DPI, pad_inches=0.3, format="png")
    # Capture dimensions *before* closing the figure.
    # With fig.dpi == SCREEN_DPI, fig.bbox values are in display pixels.
    fig_w = int(fig.bbox.width)
    fig_h = int(fig.bbox.height)
    plt.close(fig)

    return ChartRenderResult(
        image_path=f"charts/{fname}",
        image_width=fig_w,
        image_height=fig_h,
        chart_type=chart_type,
        title=title,
        zones=zones,
    )


# ---------------------------------------------------------------------------
# Individual renderers
# ---------------------------------------------------------------------------


def _render_bar(
    data: list[dict[str, Any]],
    config: dict[str, Any],
    output_dir: Path,
) -> ChartRenderResult:
    """Bar chart (vertical, grouped if group_field is set)."""
    preset = config.get("journal")
    _apply_journal_preset(preset)

    x_field = config.get("xField", "category")
    y_field = config.get("yField", "value")
    y_fields = config.get("yFields")
    group_field = config.get("groupField")
    title = config.get("title")
    x_label = config.get("xLabel")
    y_label = config.get("yLabel")
    aspect = config.get("aspectRatio")

    w_px, h_px = _figure_size(aspect)
    fig, ax = plt.subplots(figsize=(_fig_width_inches(w_px), h_px / SCREEN_DPI))

    categories = [row.get(x_field, "") for row in data]
    n = len(categories)
    x = np.arange(n)

    colors = CB_PALETTE

    zone_artists: list[tuple[Any, dict[str, Any]]] = []

    if y_fields and len(y_fields) > 1:
        # Grouped bar chart
        n_groups = len(y_fields)
        bar_width = 0.8 / n_groups
        for gi, yf in enumerate(y_fields):
            values = [_safe_float(row.get(yf, 0)) for row in data]
            offset = (gi - (n_groups - 1) / 2) * bar_width
            bars = ax.bar(
                x + offset, values, bar_width,
                label=yf, color=colors[gi % len(colors)],
                edgecolor="white", linewidth=0.5,
            )
            for i, bar_artist in enumerate(bars):
                zone_artists.append((
                    bar_artist,
                    {
                        "id": f"bar_{_sanitize_id(yf)}_{_sanitize_id(categories[i])}",
                        "metadata": {
                            "series": yf, "category": str(categories[i]),
                            "value": values[i], "label": f"{yf} {categories[i]}: {values[i]}",
                            "chartType": "bar",
                        },
                    },
                ))
        ax.legend(frameon=False)

        element_styles = config.get("elementStyles")
        if element_styles:
            _apply_post_styles([za[0] for za in zone_artists], zone_artists, element_styles)
    else:
        # Single series bar chart
        yf = y_field or (y_fields[0] if y_fields else "value")
        values = [_safe_float(row.get(yf, 0)) for row in data]
        bars = ax.bar(
            x, values, 0.7,
            color=[colors[i % len(colors)] for i in range(n)],
            edgecolor="white", linewidth=0.5,
        )
        for i, bar_artist in enumerate(bars):
            zone_artists.append((
                bar_artist,
                {
                    "id": f"bar_{_sanitize_id(yf)}_{_sanitize_id(categories[i])}",
                    "metadata": {
                        "series": yf, "category": str(categories[i]),
                        "value": values[i], "label": f"{categories[i]}: {values[i]}",
                        "chartType": "bar", "sourceRow": data[i] if i < len(data) else {},
                    },
                },
            ))

        element_styles = config.get("elementStyles")
        if element_styles:
            _apply_post_styles([za[0] for za in zone_artists], zone_artists, element_styles)

    ax.set_xticks(x)
    ax.set_xticklabels(categories, rotation=45 if n > 6 else 0, ha="right" if n > 6 else "center")
    ax.set_xlabel(x_label or x_field)
    ax.set_ylabel(y_label or y_field or "Value")
    ax.set_title(title, fontweight="bold", loc="left" if preset in ("nature", "cell") else "center")

    # Open axes (no top/right spines) — bio journal convention
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.yaxis.set_ticks_position("left")
    ax.xaxis.set_ticks_position("bottom")

    # Start y-axis at 0 for bar charts
    ax.set_ylim(bottom=0)

    fig.tight_layout()
    fig.canvas.draw()
    zones = _extract_zones(fig, zone_artists)
    return _save_and_result(fig, output_dir, "bar", title, zones)


def _render_line(
    data: list[dict[str, Any]],
    config: dict[str, Any],
    output_dir: Path,
) -> ChartRenderResult:
    """Line chart with optional multi-series."""
    preset = config.get("journal")
    _apply_journal_preset(preset)

    x_field = config.get("xField", "x")
    y_field = config.get("yField", "y")
    y_fields = config.get("yFields")
    group_field = config.get("groupField")
    title = config.get("title")
    x_label = config.get("xLabel")
    y_label = config.get("yLabel")
    aspect = config.get("aspectRatio")

    w_px, h_px = _figure_size(aspect)
    fig, ax = plt.subplots(figsize=(_fig_width_inches(w_px), h_px / SCREEN_DPI))

    x_vals = [row.get(x_field, i) for i, row in enumerate(data)]
    try:
        x_vals = [float(v) for v in x_vals]
    except (ValueError, TypeError):
        x_vals = list(range(len(x_vals)))

    colors = CB_PALETTE
    zone_artists: list[tuple[Any, dict[str, Any]]] = []

    series_list = y_fields if y_fields and len(y_fields) > 1 else [y_field or "value"]
    element_styles = config.get("elementStyles")

    for si, yf in enumerate(series_list):
        y_vals = [_safe_float(row.get(yf, 0)) for row in data]
        color = colors[si % len(colors)]

        if element_styles:
            # Draw line without markers
            ax.plot(x_vals, y_vals, "-", color=color, label=yf, linewidth=1.5)
            # Partition points into bulk (default) and override
            bulk_idx = []
            override_items = []
            for i in range(len(x_vals)):
                key = f"{yf}@@{x_vals[i]}"
                style = _resolve_element_style(key, element_styles)
                if style is None:
                    style = _resolve_element_style(str(x_vals[i]), element_styles)
                if style is not None:
                    override_items.append((i, style))
                else:
                    bulk_idx.append(i)
            # Bulk markers
            if bulk_idx:
                ax.plot(
                    [x_vals[i] for i in bulk_idx], [y_vals[i] for i in bulk_idx],
                    "o", color=color, markersize=4,
                    markeredgecolor="white", markeredgewidth=0.5,
                )
            # Override markers individually
            for i, style in override_items:
                norm = _normalize_element_style(style)
                ax.plot(
                    [x_vals[i]], [y_vals[i]], "o",
                    color=norm.get("color", color),
                    markersize=norm.get("s", norm.get("markersize", 4)),
                    markeredgecolor=norm.get("edgecolor", "white"),
                    markeredgewidth=norm.get("linewidth", 0.5),
                    zorder=10,
                )
        else:
            ax.plot(x_vals, y_vals, "-o", color=color, label=yf,
                    linewidth=1.5, markersize=4, markeredgecolor="white",
                    markeredgewidth=0.5)

        # Create invisible reference points for zone extraction
        for i in range(len(x_vals)):
            dot = ax.plot(x_vals[i], y_vals[i], "o", alpha=0, markersize=6)[0]
            zone_artists.append((
                dot,
                {
                    "id": f"dot_{_sanitize_id(yf)}_{_sanitize_id(x_vals[i])}",
                    "metadata": {
                        "series": yf, "category": x_vals[i], "value": y_vals[i],
                        "label": f"{yf} x={x_vals[i]}: {y_vals[i]}",
                        "chartType": "line", "sourceRow": data[i] if i < len(data) else {},
                    },
                    "hit_tolerance": 8,
                },
            ))

    if len(series_list) > 1:
        ax.legend(frameon=False)

    ax.set_xlabel(x_label or x_field)
    ax.set_ylabel(y_label or "Value")
    ax.set_title(title, fontweight="bold", loc="left")

    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    fig.tight_layout()
    fig.canvas.draw()
    zones = _extract_zones(fig, zone_artists)
    return _save_and_result(fig, output_dir, "line", title, zones)


def _render_pie(
    data: list[dict[str, Any]],
    config: dict[str, Any],
    output_dir: Path,
) -> ChartRenderResult:
    """Pie / donut chart."""
    preset = config.get("journal")
    _apply_journal_preset(preset)

    name_field = config.get("nameField", "name")
    value_field = config.get("valueField", "value")
    title = config.get("title")
    aspect = config.get("aspectRatio", "1:1")

    w_px, h_px = _figure_size(aspect)
    fig, ax = plt.subplots(figsize=(_fig_width_inches(w_px), h_px / SCREEN_DPI))

    labels = [str(row.get(name_field, "")) for row in data]
    values = [_safe_float(row.get(value_field, 0)) for row in data]

    colors = CB_PALETTE[:len(labels)] if len(labels) <= len(CB_PALETTE) else CB_PALETTE_EXTENDED[:len(labels)]

    wedges, texts = ax.pie(
        values, labels=None, colors=colors,
        startangle=90, pctdistance=0.75,
        wedgeprops={"edgecolor": "white", "linewidth": 1.5},
    )

    zone_artists: list[tuple[Any, dict[str, Any]]] = []
    for i, wedge in enumerate(wedges):
        pct = (values[i] / sum(values) * 100) if sum(values) > 0 else 0
        zone_artists.append((
            wedge,
            {
                "id": f"slice_{_sanitize_id(labels[i])}",
                "metadata": {
                    "series": labels[i], "category": labels[i],
                    "value": values[i], "label": f"{labels[i]}: {values[i]} ({pct:.1f}%)",
                    "chartType": "pie", "sourceRow": data[i] if i < len(data) else {},
                },
            },
        ))

    element_styles = config.get("elementStyles")
    if element_styles:
        _apply_post_styles(list(wedges), zone_artists, element_styles)

    # Legend outside
    ax.legend(
        wedges, [f"{l} ({v})" for l, v in zip(labels, values)],
        title=None, loc="center left", bbox_to_anchor=(1, 0.5), frameon=False,
    )

    ax.set_title(title, fontweight="bold", loc="left")

    fig.tight_layout()
    fig.canvas.draw()
    zones = _extract_zones(fig, zone_artists)
    return _save_and_result(fig, output_dir, "pie", title, zones)


def _render_area(
    data: list[dict[str, Any]],
    config: dict[str, Any],
    output_dir: Path,
) -> ChartRenderResult:
    """Area chart (stacked by default)."""
    preset = config.get("journal")
    _apply_journal_preset(preset)

    x_field = config.get("xField", "x")
    y_fields = config.get("yFields")
    title = config.get("title")
    aspect = config.get("aspectRatio")

    w_px, h_px = _figure_size(aspect)
    fig, ax = plt.subplots(figsize=(_fig_width_inches(w_px), h_px / SCREEN_DPI))

    x_vals = [row.get(x_field, i) for i, row in enumerate(data)]
    try:
        x_vals = [float(v) for v in x_vals]
    except (ValueError, TypeError):
        x_vals = list(range(len(x_vals)))

    series_list = y_fields if y_fields else ["value"]
    colors = CB_PALETTE

    if len(series_list) > 1:
        y_data = {yf: [_safe_float(row.get(yf, 0)) for row in data] for yf in series_list}
        labels = series_list
        polys = ax.stackplot(x_vals, *y_data.values(), labels=labels,
                     colors=colors[:len(series_list)], alpha=0.8)
        zone_artists: list[tuple[Any, dict[str, Any]]] = []
        for si, poly in enumerate(polys):
            sf = series_list[si]
            zone_artists.append((
                poly,
                {"id": f"area_{_sanitize_id(sf)}", "metadata": {
                    "series": sf, "chartType": "area",
                    "label": sf,
                    "sourceRow": next((row for row in data if row.get(sf) is not None), {}),
                }},
            ))
    else:
        yf = series_list[0]
        y_vals = [_safe_float(row.get(yf, 0)) for row in data]
        fill = ax.fill_between(x_vals, y_vals, alpha=0.5, color=colors[0])
        line = ax.plot(x_vals, y_vals, color=colors[0], linewidth=1.5)[0]
        zone_artists: list[tuple[Any, dict[str, Any]]] = [
            (fill, {"id": f"area_{_sanitize_id(yf)}", "metadata": {
                "series": yf, "chartType": "area",
                "label": yf,
                "sourceRow": data[0] if data else {},
            }}),
            (line, {"id": f"line_{_sanitize_id(yf)}", "metadata": {
                "series": yf, "chartType": "area",
                "label": yf,
                "sourceRow": data[0] if data else {},
            }}),
        ]

    if len(series_list) > 1:
        ax.legend(frameon=False)

    ax.set_xlabel(config.get("xLabel") or x_field)
    ax.set_ylabel(config.get("yLabel") or "Value")
    ax.set_title(title, fontweight="bold", loc="left")

    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    fig.tight_layout()
    fig.canvas.draw()
    zones = _extract_zones(fig, zone_artists)
    return _save_and_result(fig, output_dir, "area", title, zones)


def _render_volcano(
    data: list[dict[str, Any]],
    config: dict[str, Any],
    output_dir: Path,
) -> ChartRenderResult:
    """Volcano plot: log2FC vs -log10(p-value) with significance thresholds."""
    preset = config.get("journal")
    _apply_journal_preset(preset)

    x_value_field = config.get("xValueField", "log2FoldChange")
    y_value_field = config.get("yValueField", "negLog10P")
    p_value_field = config.get("pValueField")
    # Auto-detect label field: prefer explicit config, then common gene/name columns
    label_field = config.get("labelField")
    if label_field is None and data:
        _candidates = ["gene", "name", "symbol", "label", "id", "Gene", "GeneSymbol"]
        for c in _candidates:
            if c in data[0]:
                label_field = c
                break
    x_threshold = config.get("xThreshold", 1.0)
    y_threshold = config.get("yThreshold", 1.301)  # p=0.05
    title = config.get("title")
    aspect = config.get("aspectRatio")

    w_px, h_px = _figure_size(aspect)
    fig, ax = plt.subplots(figsize=(_fig_width_inches(w_px), h_px / SCREEN_DPI))

    x_vals = [_safe_float(row.get(x_value_field, 0)) for row in data]

    # Auto-detect whether y values need -log10 transform
    raw_y_vals = [_safe_float(row.get(y_value_field, 0)) for row in data]

    if p_value_field or _looks_like_p_values(raw_y_vals):
        actual_p_field = p_value_field or y_value_field
        y_vals = []
        for row in data:
            p = _safe_float(row.get(actual_p_field, 1))
            if p > 0:
                y_vals.append(-np.log10(p))
            else:
                y_vals.append(0.0)
    else:
        y_vals = raw_y_vals

    labels = [str(row.get(label_field or "id", "")) for row in data]

    # Categorise points
    sig_up = []
    sig_down = []
    not_sig = []
    for i in range(len(data)):
        if abs(x_vals[i]) >= x_threshold and y_vals[i] >= y_threshold:
            if x_vals[i] > 0:
                sig_up.append(i)
            else:
                sig_down.append(i)
        else:
            not_sig.append(i)

    element_styles = config.get("elementStyles")

    if element_styles:
        # Partition each group into bulk (default style) and override (custom style)
        groups: list[tuple[list[int], str, int, float, str]] = [
            (not_sig, "#BDBDBD", 8, 0.6, "NS"),
            (sig_up, CB_PALETTE[1], 12, 0.8, "Up"),
            (sig_down, CB_PALETTE[0], 12, 0.8, "Down"),
        ]
        for indices, default_color, default_size, default_alpha, group_label in groups:
            bulk_idx: list[int] = []
            override_items: list[tuple[int, dict[str, Any]]] = []
            for i in indices:
                key = labels[i] if i < len(labels) else str(i)
                style = _resolve_element_style(key, element_styles)
                if style is not None:
                    override_items.append((i, style))
                else:
                    bulk_idx.append(i)

            if bulk_idx:
                ax.scatter(
                    [x_vals[i] for i in bulk_idx], [y_vals[i] for i in bulk_idx],
                    c=default_color, s=default_size, alpha=default_alpha,
                    edgecolors="none", label=group_label,
                )
            for i, style in override_items:
                norm = _normalize_element_style(style)
                ax.scatter(
                    [x_vals[i]], [y_vals[i]],
                    c=norm.get("color", default_color),
                    s=norm.get("s", default_size),
                    alpha=norm.get("alpha", default_alpha),
                    edgecolors=norm.get("edgecolor", "none"),
                    zorder=10,
                )
    else:
        ax.scatter(
            [x_vals[i] for i in not_sig], [y_vals[i] for i in not_sig],
            c="#BDBDBD", s=8, alpha=0.6, edgecolors="none", label="NS",
        )
        ax.scatter(
            [x_vals[i] for i in sig_up], [y_vals[i] for i in sig_up],
            c=CB_PALETTE[1], s=12, alpha=0.8, edgecolors="none", label="Up",
        )
        ax.scatter(
            [x_vals[i] for i in sig_down], [y_vals[i] for i in sig_down],
            c=CB_PALETTE[0], s=12, alpha=0.8, edgecolors="none", label="Down",
        )

    # Threshold lines
    ax.axhline(y=y_threshold, color="#666666", linestyle="--", linewidth=0.8, alpha=0.5)
    ax.axvline(x=x_threshold, color="#666666", linestyle="--", linewidth=0.8, alpha=0.5)
    ax.axvline(x=-x_threshold, color="#666666", linestyle="--", linewidth=0.8, alpha=0.5)

    # Build zones for significant + top non-sig points
    zone_artists: list[tuple[Any, dict[str, Any]]] = []
    # Use the scatter PathCollection as a whole — can't get individual point bboxes,
    # so we use a simplified approach: one zone per point via invisible rect patches
    sig_indices = sig_up + sig_down
    # Limit zone count for performance
    max_zones = min(len(sig_indices) + 50, 1000)
    zone_indices = sig_indices[:max_zones]

    for idx in zone_indices:
        px = x_vals[idx]
        py = y_vals[idx]
        # Create a tiny invisible point that maps to the scatter point
        dot = ax.plot(px, py, "o", alpha=0, markersize=6)[0]
        lbl = labels[idx] if idx < len(labels) else ""
        cat = "up" if idx in sig_up else "down"
        zone_artists.append((
            dot,
            {
                "id": f"gene_{_sanitize_id(lbl or idx)}",
                "metadata": {
                    "series": cat, "category": lbl or str(idx),
                    "value": y_vals[idx],
                    "label": f"{lbl}: log2FC={x_vals[idx]:.2f} p={y_vals[idx]:.2f}",
                    "chartType": "volcano",
                    "log2FC": x_vals[idx],
                    "negLog10P": y_vals[idx],
                    "sourceRow": data[idx] if idx < len(data) else {},
                },
                "hit_tolerance": 6,
            },
        ))

    ax.set_xlabel(config.get("xLabel") or "log2(Fold Change)")
    ax.set_ylabel(config.get("yLabel") or "-log10(p-value)")
    ax.set_title(title, fontweight="bold", loc="left")
    ax.legend(frameon=False, loc="upper right")

    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    fig.tight_layout()
    fig.canvas.draw()
    zones = _extract_zones(fig, zone_artists)
    return _save_and_result(fig, output_dir, "volcano", title, zones)


def _render_box(
    data: list[dict[str, Any]],
    config: dict[str, Any],
    output_dir: Path,
) -> ChartRenderResult:
    """Box plot with individual data point overlay."""
    preset = config.get("journal")
    _apply_journal_preset(preset)

    x_field = config.get("xField", "group")
    y_field = config.get("yField", "value")
    group_field = config.get("groupField")
    title = config.get("title")
    aspect = config.get("aspectRatio")

    w_px, h_px = _figure_size(aspect)
    fig, ax = plt.subplots(figsize=(_fig_width_inches(w_px), h_px / SCREEN_DPI))

    if group_field and group_field != x_field:
        # Grouped box plot: pivot by group_field
        groups = sorted(set(str(row.get(group_field, "")) for row in data))
        x_categories = sorted(set(str(row.get(x_field, "")) for row in data))
        positions = np.arange(len(x_categories))
        box_width = 0.8 / len(groups)
        colors = CB_PALETTE[:len(groups)]

        zone_artists: list[tuple[Any, dict[str, Any]]] = []
        for gi, grp in enumerate(groups):
            grp_data = [row for row in data if str(row.get(group_field, "")) == grp]
            cat_to_vals: dict[str, list[float]] = {c: [] for c in x_categories}
            for row in grp_data:
                cat = str(row.get(x_field, ""))
                if cat in cat_to_vals:
                    cat_to_vals[cat].append(_safe_float(row.get(y_field, 0)))
            plot_data = [cat_to_vals[c] for c in x_categories if cat_to_vals[c]]
            pos_list = [positions[i] + (gi - (len(groups) - 1) / 2) * box_width
                        for i in range(len(plot_data))]
            bp = ax.boxplot(
                plot_data, positions=pos_list, widths=box_width * 0.8,
                patch_artist=True,
                boxprops={"facecolor": colors[gi], "alpha": 0.6},
                medianprops={"color": "black", "linewidth": 1},
                whiskerprops={"linewidth": 0.8},
                capprops={"linewidth": 0.8},
            )
            for bi, box_patch in enumerate(bp["boxes"]):
                cat_name = x_categories[bi] if bi < len(x_categories) else f"grp{bi}"
                # Find a representative row for this group+category
                rep_row = next((row for row in grp_data
                                if str(row.get(x_field, "")) == cat_name), {})
                zone_artists.append((
                    box_patch,
                    {
                        "id": f"box_{_sanitize_id(grp)}_{_sanitize_id(cat_name)}",
                        "metadata": {
                            "series": grp, "category": cat_name,
                            "label": f"{grp} {cat_name}",
                            "chartType": "box",
                            "sourceRow": rep_row,
                        },
                    },
                ))

        element_styles = config.get("elementStyles")
        if element_styles:
            _apply_post_styles([za[0] for za in zone_artists], zone_artists, element_styles)

        ax.set_xticks(positions)
        ax.set_xticklabels(x_categories, rotation=45 if len(x_categories) > 5 else 0,
                          ha="right" if len(x_categories) > 5 else "center")
        ax.legend(
            [bp["boxes"][0] for _ in groups],
            groups,
            frameon=False,
        )
    else:
        # Simple box plot: one box per x category
        categories = sorted(set(str(row.get(x_field, "")) for row in data))
        cat_to_vals: dict[str, list[float]] = {c: [] for c in categories}
        cat_to_rows: dict[str, list[dict[str, Any]]] = {c: [] for c in categories}
        for row in data:
            cat = str(row.get(x_field, ""))
            cat_to_vals[cat].append(_safe_float(row.get(y_field, 0)))
            cat_to_rows[cat].append(row)
        plot_data = [cat_to_vals[c] for c in categories if cat_to_vals[c]]
        plot_cats = [c for c in categories if cat_to_vals[c]]

        bp = ax.boxplot(
            plot_data, patch_artist=True,
            boxprops={"facecolor": CB_PALETTE[0], "alpha": 0.6},
            medianprops={"color": "black", "linewidth": 1},
            whiskerprops={"linewidth": 0.8},
            capprops={"linewidth": 0.8},
        )

        zone_artists: list[tuple[Any, dict[str, Any]]] = []
        for bi, box_patch in enumerate(bp["boxes"]):
            cat_name = plot_cats[bi] if bi < len(plot_cats) else f"cat{bi}"
            vals = plot_data[bi] if bi < len(plot_data) else []
            median_val = np.median(vals) if vals else 0
            rows = cat_to_rows.get(cat_name, [])
            rep_row = rows[0] if rows else {}
            zone_artists.append((
                box_patch,
                {
                    "id": f"box_{_sanitize_id(y_field)}_{_sanitize_id(cat_name)}",
                    "metadata": {
                        "series": y_field, "category": cat_name,
                        "value": median_val,
                        "label": f"{cat_name}: median={median_val:.4g}",
                        "chartType": "box",
                        "sourceRow": rep_row,
                    },
                },
            ))

        element_styles = config.get("elementStyles")
        if element_styles:
            _apply_post_styles([za[0] for za in zone_artists], zone_artists, element_styles)

        ax.set_xticklabels(plot_cats, rotation=45 if len(plot_cats) > 5 else 0,
                          ha="right" if len(plot_cats) > 5 else "center")

    ax.set_xlabel(config.get("xLabel") or x_field)
    ax.set_ylabel(config.get("yLabel") or y_field or "Value")
    ax.set_title(title, fontweight="bold", loc="left")

    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    fig.tight_layout()
    fig.canvas.draw()
    zones = _extract_zones(fig, zone_artists)
    return _save_and_result(fig, output_dir, "box", title, zones)


def _render_scatter(
    data: list[dict[str, Any]],
    config: dict[str, Any],
    output_dir: Path,
) -> ChartRenderResult:
    """Scatter plot with optional group coloring."""
    preset = config.get("journal")
    _apply_journal_preset(preset)

    x_field = config.get("xField", "x")
    y_field = config.get("yField", "y")
    group_field = config.get("groupField")
    label_field = config.get("labelField")
    title = config.get("title")
    aspect = config.get("aspectRatio")

    w_px, h_px = _figure_size(aspect)
    fig, ax = plt.subplots(figsize=(_fig_width_inches(w_px), h_px / SCREEN_DPI))

    x_vals = [_safe_float(row.get(x_field, 0)) for row in data]
    y_vals = [_safe_float(row.get(y_field, 0)) for row in data]
    colors = CB_PALETTE

    zone_artists: list[tuple[Any, dict[str, Any]]] = []

    element_styles = config.get("elementStyles")
    scatter_labels = [str(row.get(label_field or x_field, f"pt{i}")) for i, row in enumerate(data)]

    if group_field:
        groups = sorted(set(str(row.get(group_field, "")) for row in data))
        if element_styles:
            for gi, grp in enumerate(groups):
                idxs = [i for i, row in enumerate(data) if str(row.get(group_field, "")) == grp]
                bulk_idx = []
                override_items = []
                for i in idxs:
                    key = f"{grp}@@{scatter_labels[i]}"
                    style = _resolve_element_style(key, element_styles)
                    if style is None:
                        style = _resolve_element_style(scatter_labels[i], element_styles)
                    if style is not None:
                        override_items.append((i, style))
                    else:
                        bulk_idx.append(i)
                if bulk_idx:
                    ax.scatter(
                        [x_vals[i] for i in bulk_idx], [y_vals[i] for i in bulk_idx],
                        c=colors[gi % len(colors)], s=20, alpha=0.7,
                        edgecolors="white", linewidth=0.3, label=grp,
                    )
                for i, style in override_items:
                    norm = _normalize_element_style(style)
                    ax.scatter(
                        [x_vals[i]], [y_vals[i]],
                        c=norm.get("color", colors[gi % len(colors)]),
                        s=norm.get("s", 20),
                        alpha=norm.get("alpha", 0.7),
                        edgecolors=norm.get("edgecolor", "white"),
                        linewidth=norm.get("linewidth", 0.3),
                        zorder=10,
                    )
        else:
            for gi, grp in enumerate(groups):
                idxs = [i for i, row in enumerate(data) if str(row.get(group_field, "")) == grp]
                gx = [x_vals[i] for i in idxs]
                gy = [y_vals[i] for i in idxs]
                ax.scatter(gx, gy, c=colors[gi % len(colors)], s=20, alpha=0.7,
                          edgecolors="white", linewidth=0.3, label=grp)
        ax.legend(frameon=False)
    else:
        if element_styles:
            bulk_idx = []
            override_items = []
            for i in range(len(data)):
                key = scatter_labels[i]
                style = _resolve_element_style(key, element_styles)
                if style is not None:
                    override_items.append((i, style))
                else:
                    bulk_idx.append(i)
            if bulk_idx:
                ax.scatter(
                    [x_vals[i] for i in bulk_idx], [y_vals[i] for i in bulk_idx],
                    c=colors[0], s=20, alpha=0.7,
                    edgecolors="white", linewidth=0.3,
                )
            for i, style in override_items:
                norm = _normalize_element_style(style)
                ax.scatter(
                    [x_vals[i]], [y_vals[i]],
                    c=norm.get("color", colors[0]),
                    s=norm.get("s", 20),
                    alpha=norm.get("alpha", 0.7),
                    edgecolors=norm.get("edgecolor", "white"),
                    linewidth=norm.get("linewidth", 0.3),
                    zorder=10,
                )
        else:
            ax.scatter(x_vals, y_vals, c=colors[0], s=20, alpha=0.7,
                      edgecolors="white", linewidth=0.3)

    # Add label annotations for top points if label field provided
    if label_field:
        labels = [str(row.get(label_field, "")) for row in data]
        # Label top 10 points by abs(y) value
        top_idx = sorted(range(len(y_vals)), key=lambda i: abs(y_vals[i]), reverse=True)[:10]
        for idx in top_idx:
            ax.annotate(
                labels[idx], (x_vals[idx], y_vals[idx]),
                fontsize=7, alpha=0.8,
                xytext=(3, 3), textcoords="offset points",
            )

    # Build zones for a limited number of points (max 200 by abs(y) value)
    _MAX_SCATTER_ZONES = 200
    n_points = len(data)
    if n_points <= _MAX_SCATTER_ZONES:
        sample_idxs = list(range(n_points))
    else:
        sample_idxs = sorted(range(n_points),
                           key=lambda i: abs(y_vals[i]), reverse=True)[:_MAX_SCATTER_ZONES]

    for idx in sample_idxs:
        if not (np.isfinite(x_vals[idx]) and np.isfinite(y_vals[idx])):
            continue
        # Add invisible point markers for zone extraction
        pt = ax.plot(x_vals[idx], y_vals[idx], 'o', markersize=8,
                    alpha=0, label=None)[0]
        grp_val = str(data[idx].get(group_field, "")) if group_field else ""
        zone_artists.append((
            pt,
            {"id": f"scatter_{_sanitize_id(grp_val)}_{_sanitize_id(data[idx].get(label_field or x_field, f'pt{idx}'))}", "metadata": {
                "series": grp_val,
                "category": str(data[idx].get(label_field or x_field, f"pt{idx}")),
                "value": y_vals[idx] if np.isfinite(y_vals[idx]) else 0,
                "label": str(data[idx].get(label_field or "", f"Point {idx}")),
                "chartType": "scatter",
                "sourceRow": data[idx],
            }},
        ))

    ax.set_xlabel(config.get("xLabel") or x_field)
    ax.set_ylabel(config.get("yLabel") or y_field)
    ax.set_title(title, fontweight="bold", loc="left")

    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    fig.tight_layout()
    fig.canvas.draw()
    zones = _extract_zones(fig, zone_artists)
    return _save_and_result(fig, output_dir, "scatter", title, zones)


def _render_heatmap(
    data: list[dict[str, Any]],
    config: dict[str, Any],
    output_dir: Path,
) -> ChartRenderResult:
    """Heatmap with row/column labels."""
    preset = config.get("journal")
    _apply_journal_preset(preset)

    x_field = config.get("xField", "column")
    y_field = config.get("yField", "row")
    value_field = config.get("valueField", "value")
    title = config.get("title")
    aspect = config.get("aspectRatio")

    # Pivot data to matrix
    rows = sorted(set(str(row.get(y_field, "")) for row in data))
    cols = sorted(set(str(row.get(x_field, "")) for row in data))
    mat = np.zeros((len(rows), len(cols)))
    for row in data:
        r = str(row.get(y_field, ""))
        c = str(row.get(x_field, ""))
        v = _safe_float(row.get(value_field, 0))
        if r in rows and c in cols:
            mat[rows.index(r), cols.index(c)] = v

    w_px, h_px = _figure_size(aspect)
    # Adjust figure size for labels
    fig_w = max(_fig_width_inches(w_px), len(cols) * 0.4 + 2)
    fig_h = max(h_px / SCREEN_DPI, len(rows) * 0.35 + 1.5)
    fig, ax = plt.subplots(figsize=(fig_w, fig_h))

    im = ax.imshow(mat, aspect="auto", cmap="RdBu_r", interpolation="nearest")

    ax.set_xticks(np.arange(len(cols)))
    ax.set_xticklabels(cols, rotation=90, fontsize=7, ha="center")
    ax.set_yticks(np.arange(len(rows)))
    ax.set_yticklabels(rows, fontsize=7)

    cbar = fig.colorbar(im, ax=ax, shrink=0.8)
    cbar.ax.tick_params(labelsize=7)

    ax.set_title(title, fontweight="bold", loc="left")

    fig.tight_layout()
    fig.canvas.draw()
    return _save_and_result(fig, output_dir, "heatmap", title, [])


def _render_violin(
    data: list[dict[str, Any]],
    config: dict[str, Any],
    output_dir: Path,
) -> ChartRenderResult:
    """Violin plot."""
    preset = config.get("journal")
    _apply_journal_preset(preset)

    x_field = config.get("xField", "group")
    y_field = config.get("yField", "value")
    group_field = config.get("groupField")
    title = config.get("title")
    aspect = config.get("aspectRatio")

    w_px, h_px = _figure_size(aspect)
    fig, ax = plt.subplots(figsize=(_fig_width_inches(w_px), h_px / SCREEN_DPI))

    categories = sorted(set(str(row.get(x_field, "")) for row in data))
    plot_data = []
    for cat in categories:
        vals = [_safe_float(row.get(y_field, 0)) for row in data
                if str(row.get(x_field, "")) == cat]
        plot_data.append(vals)

    positions = np.arange(len(categories))
    vp = ax.violinplot(
        plot_data, positions=positions, showmeans=True, showmedians=True,
    )

    colors = CB_PALETTE[:len(categories)]
    for i, body in enumerate(vp["bodies"]):
        body.set_facecolor(colors[i % len(colors)])
        body.set_alpha(0.7)

    ax.set_xticks(positions)
    ax.set_xticklabels(categories, rotation=45 if len(categories) > 5 else 0,
                      ha="right" if len(categories) > 5 else "center")
    ax.set_ylabel(config.get("yLabel") or y_field or "Value")
    ax.set_title(title, fontweight="bold", loc="left")

    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    fig.tight_layout()
    fig.canvas.draw()

    zone_artists: list[tuple[Any, dict[str, Any]]] = []
    for i, body in enumerate(vp["bodies"]):
        cat_name = categories[i]
        # Find a representative row for this category
        rep_row = next((row for row in data
                        if str(row.get(x_field, "")) == cat_name), {})
        vals = plot_data[i] if i < len(plot_data) else []
        median_val = np.median(vals) if vals else 0
        zone_artists.append((
            body,
            {
                "id": f"violin_{_sanitize_id(y_field)}_{_sanitize_id(cat_name)}",
                "metadata": {
                    "series": y_field, "category": str(cat_name),
                    "value": median_val,
                    "label": f"{cat_name}",
                    "chartType": "violin",
                    "sourceRow": rep_row,
                },
            },
        ))

    element_styles = config.get("elementStyles")
    if element_styles:
        _apply_post_styles(list(vp["bodies"]), zone_artists, element_styles)

    zones = _extract_zones(fig, zone_artists)
    return _save_and_result(fig, output_dir, "violin", title, zones)


def _render_histogram(
    data: list[dict[str, Any]],
    config: dict[str, Any],
    output_dir: Path,
) -> ChartRenderResult:
    """Histogram with KDE overlay."""
    value_field = config.get("valueField", config.get("yField", "value"))
    title = config.get("title")
    aspect = config.get("aspectRatio")

    w_px, h_px = _figure_size(aspect)
    fig, ax = plt.subplots(figsize=(_fig_width_inches(w_px), h_px / SCREEN_DPI))

    vals = [_safe_float(row.get(value_field, 0)) for row in data if row.get(value_field) is not None]
    vals = [v for v in vals if not np.isnan(v)]

    ax.hist(vals, bins="auto", color=CB_PALETTE[0], alpha=0.7, edgecolor="white", linewidth=0.5)

    ax.set_xlabel(config.get("xLabel") or value_field)
    ax.set_ylabel("Frequency")
    ax.set_title(title, fontweight="bold", loc="left")

    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    fig.tight_layout()
    fig.canvas.draw()
    return _save_and_result(fig, output_dir, "histogram", title, [])


def _render_density(
    data: list[dict[str, Any]],
    config: dict[str, Any],
    output_dir: Path,
) -> ChartRenderResult:
    """Density / KDE plot."""
    value_field = config.get("valueField", config.get("yField", "value"))
    group_field = config.get("groupField")
    title = config.get("title")
    aspect = config.get("aspectRatio")

    w_px, h_px = _figure_size(aspect)
    fig, ax = plt.subplots(figsize=(_fig_width_inches(w_px), h_px / SCREEN_DPI))

    colors = CB_PALETTE

    if group_field:
        groups = sorted(set(str(row.get(group_field, "")) for row in data))
        for gi, grp in enumerate(groups):
            vals = [_safe_float(row.get(value_field, 0)) for row in data
                    if str(row.get(group_field, "")) == grp and row.get(value_field) is not None]
            vals = [v for v in vals if not np.isnan(v)]
            if len(vals) >= 2:
                from scipy import stats
                kde = stats.gaussian_kde(vals)
                x_range = np.linspace(min(vals), max(vals), 200)
                ax.plot(x_range, kde(x_range), color=colors[gi % len(colors)],
                       linewidth=1.5, label=grp)
                ax.fill_between(x_range, kde(x_range), color=colors[gi % len(colors)],
                              alpha=0.15)
        ax.legend(frameon=False)
    else:
        vals = [_safe_float(row.get(value_field, 0)) for row in data if row.get(value_field) is not None]
        vals = [v for v in vals if not np.isnan(v)]
        if len(vals) >= 2:
            from scipy import stats
            kde = stats.gaussian_kde(vals)
            x_range = np.linspace(min(vals), max(vals), 200)
            ax.plot(x_range, kde(x_range), color=colors[0], linewidth=1.5)
            ax.fill_between(x_range, kde(x_range), color=colors[0], alpha=0.15)

    ax.set_xlabel(config.get("xLabel") or value_field)
    ax.set_ylabel("Density")
    ax.set_title(title, fontweight="bold", loc="left")

    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    fig.tight_layout()
    fig.canvas.draw()
    return _save_and_result(fig, output_dir, "density", title, [])


def _render_pca(
    data: list[dict[str, Any]],
    config: dict[str, Any],
    output_dir: Path,
) -> ChartRenderResult:
    """PCA scatter plot (PC1 vs PC2) with optional group coloring."""
    preset = config.get("journal")
    _apply_journal_preset(preset)

    pc1_field = config.get("xField", "PC1")
    pc2_field = config.get("yField", "PC2")
    group_field = config.get("groupField")
    title = config.get("title", "PCA Plot")
    aspect = config.get("aspectRatio", "1:1")

    w_px, h_px = _figure_size(aspect)
    fig, ax = plt.subplots(figsize=(_fig_width_inches(w_px), h_px / SCREEN_DPI))

    pc1 = [_safe_float(row.get(pc1_field, 0)) for row in data]
    pc2 = [_safe_float(row.get(pc2_field, 0)) for row in data]

    colors = CB_PALETTE

    if group_field:
        groups = sorted(set(str(row.get(group_field, "")) for row in data))
        for gi, grp in enumerate(groups):
            idxs = [i for i, row in enumerate(data) if str(row.get(group_field, "")) == grp]
            ax.scatter(
                [pc1[i] for i in idxs], [pc2[i] for i in idxs],
                c=colors[gi % len(colors)], s=15, alpha=0.7,
                edgecolors="white", linewidth=0.3, label=grp,
            )
        ax.legend(frameon=False)
    else:
        ax.scatter(pc1, pc2, c=colors[0], s=15, alpha=0.7,
                  edgecolors="white", linewidth=0.3)

    ax.set_xlabel(pc1_field)
    ax.set_ylabel(pc2_field)
    ax.set_title(title, fontweight="bold", loc="left")

    # Add variance explained if available
    var1 = config.get("varPC1")
    var2 = config.get("varPC2")
    if var1 is not None and var2 is not None:
        ax.set_xlabel(f"{pc1_field} ({float(var1):.1f}%)")
        ax.set_ylabel(f"{pc2_field} ({float(var2):.1f}%)")

    ax.axhline(y=0, color="#CCCCCC", linewidth=0.5, linestyle="--")
    ax.axvline(x=0, color="#CCCCCC", linewidth=0.5, linestyle="--")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    fig.tight_layout()
    fig.canvas.draw()
    return _save_and_result(fig, output_dir, "pca", title, [])


def _render_bubble(
    data: list[dict[str, Any]],
    config: dict[str, Any],
    output_dir: Path,
) -> ChartRenderResult:
    """Bubble / enrichment bubble chart."""
    preset = config.get("journal")
    _apply_journal_preset(preset)

    x_field = config.get("xField", "GeneRatio")
    y_field = config.get("yField", "Description")
    size_field = config.get("valueField", config.get("sizeField", "Count"))
    color_field = config.get("pValueField", "p.adjust")
    title = config.get("title")
    aspect = config.get("aspectRatio")

    w_px, h_px = _figure_size(aspect)
    # Extra height for long pathway names
    fig_h_in = max(h_px / SCREEN_DPI, len(data) * 0.4)
    fig, ax = plt.subplots(figsize=(_fig_width_inches(w_px), fig_h_in))

    y_labels = [str(row.get(y_field, "")) for row in data]
    x_vals = [_safe_float(row.get(x_field, 0)) for row in data]
    sizes = [_safe_float(row.get(size_field, 10)) for row in data]
    color_vals = [_safe_float(row.get(color_field, 1)) for row in data]

    # Scale sizes (radius in points)
    from matplotlib.patches import Circle as MplCircle
    scaled_sizes = [max(s, 1) * 30 for s in sizes]

    # Use individual Circle patches so we can extract per-bubble zones
    from matplotlib.colors import Normalize
    from matplotlib.cm import ScalarMappable
    norm = Normalize(vmin=min(color_vals) if color_vals else 0,
                     vmax=max(color_vals) if color_vals else 1)
    cmap = plt.cm.Reds_r
    sm = ScalarMappable(norm=norm, cmap=cmap)

    zone_artists: list[tuple[Any, dict[str, Any]]] = []
    for j in range(len(y_labels)):
        # Circle radius in data coords; we use a fixed visual size
        radius_pts = np.sqrt(scaled_sizes[j] / np.pi) if j < len(scaled_sizes) else 5
        # Convert points to data coords (approximate)
        circle = MplCircle(
            (x_vals[j], j), radius=radius_pts / 72,  # rough: 1pt ≈ 1/72 inch
            facecolor=cmap(norm(color_vals[j] if color_vals else 0)),
            edgecolor="#666666", linewidth=0.3, alpha=0.8,
            transform=ax.transData,
        )
        ax.add_patch(circle)
        zone_artists.append((
            circle,
            {"id": f"bubble_{_sanitize_id(y_labels[j] if j < len(y_labels) else str(j))}", "metadata": {
                "series": y_labels[j] if j < len(y_labels) else "",
                "category": str(y_labels[j] if j < len(y_labels) else ""),
                "value": sizes[j] if j < len(sizes) else 0,
                "label": y_labels[j] if j < len(y_labels) else "",
                "chartType": "bubble",
                "sourceRow": data[j] if j < len(data) else {},
            }},
        ))

    element_styles = config.get("elementStyles")
    if element_styles:
        _apply_post_styles([za[0] for za in zone_artists], zone_artists, element_styles)

    cbar = fig.colorbar(sm, ax=ax, shrink=0.8)
    cbar.set_label(color_field, fontsize=8)

    ax.set_yticks(range(len(y_labels)))
    ax.set_yticklabels(y_labels, fontsize=8)
    ax.set_xlabel(x_field)
    ax.set_title(title, fontweight="bold", loc="left")
    # Auto-scale to fit all circles
    ax.autoscale_view()

    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    fig.tight_layout()
    fig.canvas.draw()
    zones = _extract_zones(fig, zone_artists)
    return _save_and_result(fig, output_dir, "bubble", title, zones)


def _render_stacked_bar(
    data: list[dict[str, Any]],
    config: dict[str, Any],
    output_dir: Path,
) -> ChartRenderResult:
    """Stacked bar chart."""
    preset = config.get("journal")
    _apply_journal_preset(preset)

    x_field = config.get("xField", "category")
    y_fields = config.get("yFields", [])
    title = config.get("title")
    aspect = config.get("aspectRatio")

    w_px, h_px = _figure_size(aspect)
    fig, ax = plt.subplots(figsize=(_fig_width_inches(w_px), h_px / SCREEN_DPI))

    categories = [str(row.get(x_field, "")) for row in data]

    if not y_fields:
        # Auto-detect numeric columns
        for key in data[0]:
            if key != x_field and isinstance(data[0][key], (int, float)):
                y_fields.append(key)
        if not y_fields:
            y_fields = ["value"]

    x = np.arange(len(categories))
    colors = CB_PALETTE[:len(y_fields)] if len(y_fields) <= len(CB_PALETTE) else CB_PALETTE_EXTENDED[:len(y_fields)]
    bottom = np.zeros(len(categories))

    zone_artists: list[tuple[Any, dict[str, Any]]] = []
    for i, yf in enumerate(y_fields):
        vals = [_safe_float(row.get(yf, 0)) for row in data]
        bars = ax.bar(x, vals, 0.7, bottom=bottom, label=yf, color=colors[i],
               edgecolor="white", linewidth=0.5)
        for j, bar_patch in enumerate(bars):
            cat_name = categories[j] if j < len(categories) else f"cat{j}"
            zone_artists.append((
                bar_patch,
                {"id": f"stacked_{_sanitize_id(yf)}_{_sanitize_id(cat_name)}", "metadata": {
                    "series": yf, "category": cat_name,
                    "value": vals[j] if j < len(vals) else 0,
                    "label": f"{yf} {cat_name}: {vals[j] if j < len(vals) else 0}",
                    "chartType": "stacked_bar",
                    "sourceRow": data[j] if j < len(data) else {},
                }},
            ))
        bottom += np.array(vals)

    element_styles = config.get("elementStyles")
    if element_styles:
        _apply_post_styles([za[0] for za in zone_artists], zone_artists, element_styles)

    ax.set_xticks(x)
    ax.set_xticklabels(categories, rotation=45 if len(categories) > 6 else 0,
                      ha="right" if len(categories) > 6 else "center")
    ax.set_ylabel(config.get("yLabel") or "Value")
    ax.set_title(title, fontweight="bold", loc="left")
    ax.legend(frameon=False)

    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.set_ylim(bottom=0)

    fig.tight_layout()
    fig.canvas.draw()
    zones = _extract_zones(fig, zone_artists)
    return _save_and_result(fig, output_dir, "stacked_bar", title, zones)


def _render_venn(
    data: list[dict[str, Any]],
    config: dict[str, Any],
    output_dir: Path,
) -> ChartRenderResult:
    """Venn diagram (2 or 3 sets)."""
    title = config.get("title")
    aspect = config.get("aspectRatio", "1:1")

    w_px, h_px = _figure_size(aspect)
    fig, ax = plt.subplots(figsize=(_fig_width_inches(w_px), h_px / SCREEN_DPI))

    # Data format: [{set: "A", count: 100, items: [...]}, ...]
    # Or: [{set: "A", label: "Gene A", ...}, ...] — items per row
    sets: dict[str, set[str]] = {}
    set_field = config.get("groupField", "set")
    item_field = config.get("labelField", config.get("idField", "item"))

    for row in data:
        set_name = str(row.get(set_field, ""))
        item_name = str(row.get(item_field, ""))
        if set_name:
            sets.setdefault(set_name, set()).add(item_name)

    set_names = list(sets.keys())[:3]  # max 3 sets
    if len(set_names) < 2:
        ax.text(0.5, 0.5, "Need at least 2 sets for Venn diagram",
                ha="center", va="center", transform=ax.transAxes)
        ax.set_title(title, fontweight="bold", loc="left")
        fig.tight_layout()
        fig.canvas.draw()
        return _save_and_result(fig, output_dir, "venn", title, [])

    try:
        from matplotlib_venn import venn2, venn3
        set_sets = [sets[n] for n in set_names]
        if len(set_names) == 2:
            v = venn2(set_sets, set_names, ax=ax)
        else:
            v = venn3(set_sets, set_names, ax=ax)

        # Color patches
        colors = CB_PALETTE[:len(set_names)]
        for i, patch_id in enumerate(["10", "01", "11"] if len(set_names) == 2
                                      else ["100", "010", "001", "110", "101", "011", "111"]):
            patch = v.get_patch_by_id(patch_id)
            if patch:
                patch.set_alpha(0.5)
    except ImportError:
        # Fallback: simple text-based venn
        ax.text(0.5, 0.5, f"Venn diagram of {len(set_names)} sets\n"
                + "\n".join(f"{n}: {len(s)} items" for n, s in sets.items()),
                ha="center", va="center", transform=ax.transAxes, fontsize=10)

    ax.set_title(title, fontweight="bold", loc="left")
    ax.set_aspect("equal")
    ax.axis("off")

    fig.tight_layout()
    fig.canvas.draw()
    return _save_and_result(fig, output_dir, "venn", title, [])


def _render_upset(
    data: list[dict[str, Any]],
    config: dict[str, Any],
    output_dir: Path,
) -> ChartRenderResult:
    """UpSet plot for set intersections."""
    title = config.get("title", "UpSet Plot")
    aspect = config.get("aspectRatio")

    w_px, h_px = _figure_size(aspect)
    fig, ax = plt.subplots(figsize=(_fig_width_inches(w_px), h_px / SCREEN_DPI))

    # Simplified UpSet: bar chart of intersection sizes
    set_field = config.get("groupField", "set")
    item_field = config.get("labelField", config.get("idField", "item"))

    sets: dict[str, set[str]] = {}
    for row in data:
        sn = str(row.get(set_field, ""))
        it = str(row.get(item_field, ""))
        if sn:
            sets.setdefault(sn, set()).add(it)

    set_names = list(sets.keys())
    if len(set_names) < 2:
        ax.text(0.5, 0.5, "Need at least 2 sets for UpSet plot",
                ha="center", va="center", transform=ax.transAxes)
        ax.set_title(title, fontweight="bold", loc="left")
        fig.tight_layout()
        fig.canvas.draw()
        return _save_and_result(fig, output_dir, "upset", title, [])

    # Compute pairwise intersections
    intersections = []
    for i in range(len(set_names)):
        for j in range(i + 1, len(set_names)):
            inter = sets[set_names[i]] & sets[set_names[j]]
            if inter:
                intersections.append((f"{set_names[i]} ∩ {set_names[j]}", len(inter)))

    intersections.sort(key=lambda x: x[1], reverse=True)
    if not intersections:
        intersections = [(f"{n} only", len(s)) for n, s in sets.items()]

    labels = [x[0] for x in intersections[:20]]
    counts = [x[1] for x in intersections[:20]]

    bars = ax.barh(range(len(labels)), counts, 0.6, color=CB_PALETTE[0], alpha=0.8)
    ax.set_yticks(range(len(labels)))
    ax.set_yticklabels(labels, fontsize=8)
    ax.set_xlabel("Intersection Size")
    ax.set_title(title, fontweight="bold", loc="left")
    ax.invert_yaxis()

    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    fig.tight_layout()
    fig.canvas.draw()
    return _save_and_result(fig, output_dir, "upset", title, [])


def _render_correlation_heatmap(
    data: list[dict[str, Any]],
    config: dict[str, Any],
    output_dir: Path,
) -> ChartRenderResult:
    """Correlation matrix heatmap."""
    title = config.get("title", "Correlation Heatmap")
    aspect = config.get("aspectRatio", "1:1")

    w_px, h_px = _figure_size(aspect)
    fig, ax = plt.subplots(figsize=(_fig_width_inches(w_px), h_px / SCREEN_DPI))

    # Build correlation matrix from numeric columns
    numeric_data: dict[str, list[float]] = {}
    if data:
        sample = data[0]
        for key, val in sample.items():
            try:
                float(val)
                numeric_data[key] = [_safe_float(row.get(key, 0)) for row in data]
            except (ValueError, TypeError):
                pass

    if len(numeric_data) < 2:
        ax.text(0.5, 0.5, "Need at least 2 numeric columns",
                ha="center", va="center", transform=ax.transAxes)
        ax.set_title(title, fontweight="bold", loc="left")
        fig.tight_layout()
        fig.canvas.draw()
        return _save_and_result(fig, output_dir, "correlation_heatmap", title, [])

    cols = list(numeric_data.keys())
    n = len(cols)
    corr_mat = np.zeros((n, n))
    for i in range(n):
        for j in range(n):
            vi = np.array(numeric_data[cols[i]])
            vj = np.array(numeric_data[cols[j]])
            mask = ~(np.isnan(vi) | np.isnan(vj))
            if mask.sum() >= 3:
                corr_mat[i, j] = np.corrcoef(vi[mask], vj[mask])[0, 1]
            else:
                corr_mat[i, j] = 0

    im = ax.imshow(corr_mat, cmap="RdBu_r", vmin=-1, vmax=1, aspect="auto")
    ax.set_xticks(range(n))
    ax.set_xticklabels(cols, rotation=90, fontsize=7, ha="center")
    ax.set_yticks(range(n))
    ax.set_yticklabels(cols, fontsize=7)
    ax.set_title(title, fontweight="bold", loc="left")

    # Add correlation values
    for i in range(n):
        for j in range(n):
            ax.text(j, i, f"{corr_mat[i, j]:.2f}", ha="center", va="center",
                   fontsize=6, color="white" if abs(corr_mat[i, j]) > 0.5 else "black")

    cbar = fig.colorbar(im, ax=ax, shrink=0.8)
    cbar.set_label("Pearson r", fontsize=8)

    fig.tight_layout()
    fig.canvas.draw()
    return _save_and_result(fig, output_dir, "correlation_heatmap", title, [])


def _render_gsea(
    data: list[dict[str, Any]],
    config: dict[str, Any],
    output_dir: Path,
) -> ChartRenderResult:
    """GSEA running score + waterfall plot."""
    title = config.get("title", "GSEA Enrichment Plot")
    aspect = config.get("aspectRatio")

    w_px, h_px = _figure_size(aspect)
    fig, (ax1, ax2) = plt.subplots(
        2, 1, figsize=(_fig_width_inches(w_px), h_px / SCREEN_DPI * 1.2),
        gridspec_kw={"height_ratios": [2, 1]}, sharex=True,
    )

    rank_field = config.get("xField", "rank")
    es_field = config.get("yField", "runningScore")
    label_field = config.get("labelField", "pathway")

    ranks = [_safe_float(row.get(rank_field, i)) for i, row in enumerate(data)]
    es = [_safe_float(row.get(es_field, 0)) for row in data]

    # Running score
    ax1.plot(ranks, es, color=CB_PALETTE[0], linewidth=1.5)
    ax1.fill_between(ranks, 0, es, color=CB_PALETTE[0], alpha=0.15)
    ax1.axhline(y=0, color="#666666", linewidth=0.5, linestyle="--")
    ax1.set_ylabel("Running Enrichment Score")
    ax1.set_title(title, fontweight="bold", loc="left")

    # Waterfall (gene rank metric)
    rank_field_y = config.get("yValueField", "rankMetric")
    if any(row.get(rank_field_y) for row in data):
        metrics = [_safe_float(row.get(rank_field_y, 0)) for row in data]
        ax2.bar(ranks, metrics, width=max(1, len(ranks) / 200),
               color=["#D55E00" if m > 0 else "#0072B2" for m in metrics],
               alpha=0.6, edgecolor="none")
        ax2.set_ylabel("Rank Metric")

    ax2.set_xlabel("Rank in Ordered Dataset")

    for ax_i in (ax1, ax2):
        ax_i.spines["top"].set_visible(False)
        ax_i.spines["right"].set_visible(False)

    fig.tight_layout()
    fig.canvas.draw()
    return _save_and_result(fig, output_dir, "gsea", title, [])


def _render_enrichment_bar(
    data: list[dict[str, Any]],
    config: dict[str, Any],
    output_dir: Path,
) -> ChartRenderResult:
    """Horizontal bar chart for enrichment results (KEGG/GO terms)."""
    preset = config.get("journal")
    _apply_journal_preset(preset)

    term_field = config.get("yField", config.get("xField", "Term"))
    p_field = config.get("pValueField", "p.adjust")
    count_field = config.get("valueField", "Count")
    title = config.get("title", "Enrichment Analysis")
    aspect = config.get("aspectRatio")

    w_px, h_px = _figure_size(aspect)
    fig_h_in = max(h_px / SCREEN_DPI, len(data) * 0.4)
    fig, ax = plt.subplots(figsize=(_fig_width_inches(w_px), fig_h_in))

    terms = [str(row.get(term_field, "")) for row in data]
    p_vals = [_safe_float(row.get(p_field, 1)) for row in data]
    counts = [_safe_float(row.get(count_field, 0)) for row in data]

    # Sort by p-value
    sorted_idx = sorted(range(len(p_vals)), key=lambda i: p_vals[i], reverse=True)
    terms_sorted = [terms[i] for i in sorted_idx]
    neg_log_p = [-np.log10(max(p_vals[i], 1e-300)) for i in sorted_idx]

    colors_vals = [CB_PALETTE[i % len(CB_PALETTE)] for i in range(len(terms_sorted))]

    bars = ax.barh(range(len(terms_sorted)), neg_log_p, 0.7, color=colors_vals, alpha=0.8)
    ax.set_yticks(range(len(terms_sorted)))
    ax.set_yticklabels(terms_sorted, fontsize=8)
    ax.set_xlabel("-log10(p.adjust)")
    ax.set_title(title, fontweight="bold", loc="left")
    ax.invert_yaxis()

    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    # Build zones
    zone_artists: list[tuple[Any, dict[str, Any]]] = []
    for j, bar_patch in enumerate(bars):
        orig_idx = sorted_idx[j] if j < len(sorted_idx) else j
        zone_artists.append((
            bar_patch,
            {"id": f"enrichment_{_sanitize_id(terms_sorted[j] if j < len(terms_sorted) else str(j))}", "metadata": {
                "series": "enrichment", "category": terms_sorted[j] if j < len(terms_sorted) else "",
                "value": neg_log_p[j] if j < len(neg_log_p) else 0,
                "label": terms_sorted[j] if j < len(terms_sorted) else "",
                "chartType": "enrichment_bar",
                "sourceRow": data[orig_idx] if orig_idx < len(data) else {},
            }},
        ))

    element_styles = config.get("elementStyles")
    if element_styles:
        _apply_post_styles(list(bars), zone_artists, element_styles)

    fig.tight_layout()
    fig.canvas.draw()
    zones = _extract_zones(fig, zone_artists)
    return _save_and_result(fig, output_dir, "enrichment_bar", title, zones)


# ---------------------------------------------------------------------------
# Renderer dispatcher
# ---------------------------------------------------------------------------

_RENDERERS: dict[str, Callable] = {
    "bar": _render_bar,
    "line": _render_line,
    "pie": _render_pie,
    "area": _render_area,
    "volcano": _render_volcano,
    "box": _render_box,
    "scatter": _render_scatter,
    "heatmap": _render_heatmap,
    "violin": _render_violin,
    "histogram": _render_histogram,
    "density": _render_density,
    "pca": _render_pca,
    "bubble": _render_bubble,
    "stacked_bar": _render_stacked_bar,
    "venn": _render_venn,
    "upset": _render_upset,
    "correlation_heatmap": _render_correlation_heatmap,
    "gsea": _render_gsea,
    "enrichment_bar": _render_enrichment_bar,
}


def render_chart(
    chart_type: str,
    data: list[dict[str, Any]],
    config: dict[str, Any],
    output_dir: Path,
) -> ChartRenderResult:
    """Render a chart with matplotlib and return the result.

    Parameters
    ----------
    chart_type:
        One of the registered chart types (bar, line, pie, area, volcano,
        box, scatter, heatmap, violin, histogram, density, pca, bubble,
        stacked_bar, venn, upset, correlation_heatmap, gsea, enrichment_bar).
    data:
        List of data rows (dicts keyed by column name).  These come from
        the DuckDB query result, already parsed into Python types.
    config:
        Chart configuration with field mappings, title, labels, journal
        preset, aspect ratio, etc.  Mirrors the frontend ChartConfig shape.
    output_dir:
        Session output directory.  PNG files are written to
        ``<output_dir>/charts/``.

    Returns
    -------
    ChartRenderResult
        Image path, dimensions, zones, chart type, and title metadata.
    """
    renderer = _RENDERERS.get(chart_type)
    if renderer is None:
        # Fallback to bar chart with a warning note
        config = {**config, "title": f"{config.get('title', 'Chart')} (type '{chart_type}' not found, using bar)"}
        result = _render_bar(data, config, output_dir)
    else:
        result = renderer(data, config, output_dir)

    # Attach field mappings so the frontend can resolve model-driven
    # semantic selections (select_by_semantic_query).
    result.field_mappings = {
        k: v for k, v in config.items() if k in _FIELD_KEYS and v is not None
    }
    # Attach data rows so the frontend can build selectable elements
    # without extracting sourceRow from every zone.
    result.data = data
    return result


def get_supported_chart_types() -> list[str]:
    """Return the list of chart types supported by the renderer."""
    return sorted(_RENDERERS.keys())


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------


def _safe_float(val: Any, default: float = 0.0) -> float:
    """Coerce a value to float, returning *default* on failure."""
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _sanitize_id(raw: Any) -> str:
    """Replace any character that is not alphanumeric or underscore with '_'.

    This keeps zone IDs compatible with both Konva CSS selectors and the
    frontend ``chartElementId()`` convention (which also replaces non-word
    characters with underscores).
    """
    import re
    return re.sub(r"[^a-zA-Z0-9_]", "_", str(raw))


def _resolve_element_style(key: str, element_styles: dict[str, Any]) -> dict[str, Any] | None:
    """Look up a per-element style override by matching *key* against the
    ``elementStyles`` dict with progressive fallbacks:

    1. Exact key match
    2. Key treated as ``category`` — try ``series@@category`` for every entry
    3. Key treated as ``series:category`` (colon variant)
    4. Case-insensitive match

    Returns the style dict if found, or ``None``.
    """
    if not element_styles:
        return None

    # 1. Exact match
    if key in element_styles:
        return element_styles[key]

    # 2. key as category — scan for "series@@category"
    suffix = f"@@{key}"
    for k, v in element_styles.items():
        if k.endswith(suffix):
            return v

    # 3. key as "series:category"
    if ":" in key:
        series, cat = key.split(":", 1)
        for k, v in element_styles.items():
            if k == f"{series}@@{cat}":
                return v

    # 4. Case-insensitive
    key_lower = key.lower()
    for k, v in element_styles.items():
        if k.lower() == key_lower:
            return v

    return None


def _normalize_element_style(style: dict[str, Any]) -> dict[str, Any]:
    """Convert frontend ``ChartElementStyle`` camelCase keys to matplotlib
    keyword-argument names.

    Frontend          →  Matplotlib
    ─────────         →  ─────────
    ``color``         →  ``color`` / ``facecolor`` (caller decides)
    ``fillOpacity``   →  ``alpha``
    ``stroke``        →  ``edgecolor``
    ``strokeWidth``   →  ``linewidth``
    ``pointSize``     →  ``s`` (scatter) / ``markersize`` (line plot)
    ``visible``       →  ``visible`` (bool, kept as-is)
    """
    if not style:
        return {}
    out: dict[str, Any] = {}
    for fk, fv in style.items():
        if fk == "fillOpacity":
            out["alpha"] = fv
        elif fk == "stroke":
            out["edgecolor"] = fv
        elif fk == "strokeWidth":
            out["linewidth"] = fv
        elif fk == "pointSize":
            out["s"] = fv
        elif fk == "visible":
            out["visible"] = fv
        else:
            out[fk] = fv
    return out


def _apply_post_styles(
    artists: list[Any],
    zone_list: list[tuple[Any, dict[str, Any]]],
    element_styles: dict[str, Any],
) -> None:
    """Post-processing pattern: iterate artists and their zone metadata to
    apply per-element style overrides from *element_styles*.

    Each entry in *artists* corresponds 1:1 with *zone_list*.  The zone
    metadata provides the ``category`` and ``series`` keys used for lookup.
    """
    if not element_styles:
        return

    for artist, (_, zone_info) in zip(artists, zone_list):
        meta = zone_info.get("metadata", {})
        category = str(meta.get("category", ""))
        series = str(meta.get("series", ""))

        # Build lookup keys
        keys = [category]
        if series and series != category:
            keys.insert(0, f"{series}@@{category}")

        style = None
        for k in keys:
            style = _resolve_element_style(k, element_styles)
            if style is not None:
                break

        if style is None:
            continue

        norm = _normalize_element_style(style)

        # Apply to matplotlib artist (patch-based: bar, pie wedge, violin body, box patch)
        if "color" in norm:
            try:
                artist.set_facecolor(norm["color"])
            except AttributeError:
                try:
                    artist.set_color(norm["color"])
                except AttributeError:
                    pass
        if "alpha" in norm:
            try:
                artist.set_alpha(norm["alpha"])
            except AttributeError:
                pass
        if "edgecolor" in norm:
            try:
                artist.set_edgecolor(norm["edgecolor"])
            except AttributeError:
                pass
        if "linewidth" in norm:
            try:
                artist.set_linewidth(norm["linewidth"])
            except AttributeError:
                pass
        if norm.get("visible") is False:
            try:
                artist.set_visible(False)
            except AttributeError:
                pass


def _looks_like_p_values(vals: list[float]) -> bool:
    """Check if a list of values looks like raw p-values (probabilities 0-1).

    Returns True if the majority of non-zero values are between 0 and 1,
    suggesting they are raw p-values that need -log10 transformation.
    """
    nonzero = [v for v in vals if v != 0 and not np.isnan(v)]
    if not nonzero:
        return False
    # If over 50% of non-zero values are between 0 and 1, treat as p-values
    ratio = sum(1 for v in nonzero if 0 < v <= 1) / len(nonzero)
    return ratio > 0.5
