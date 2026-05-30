import Konva from "konva";
import type { OverlayConfig, OverlayZone } from "./types";

export interface OverlayCallbacks {
  onZoneClick?: (zone: OverlayZone, event: Konva.KonvaEventObject<MouseEvent>) => void;
  onZoneHover?: (zone: OverlayZone | null) => void;
  onBoxSelect?: (zones: OverlayZone[]) => void;
  onZoneDblClick?: (zone: OverlayZone, event: Konva.KonvaEventObject<MouseEvent>) => void;
}

const HIT_TOLERANCE = 6; // px for small element hit area expansion
const BOX_SELECT_FILL = "rgba(0, 114, 178, 0.1)";
const BOX_SELECT_STROKE = "#0072B2";

function _buildCircleHighlight(zone: OverlayZone, isSelected: boolean): Konva.Circle {
  const cx = Number(zone.metadata["_circle_cx"] ?? zone.x + zone.width / 2);
  const cy = Number(zone.metadata["_circle_cy"] ?? zone.y + zone.height / 2);
  const r = Number(zone.metadata["_circle_r"] ?? Math.max(zone.width, zone.height) / 2);

  return new Konva.Circle({
    x: cx,
    y: cy,
    radius: r + 2,
    fill: "transparent",
    stroke: "#111827",
    strokeWidth: isSelected ? 2 : 0,
    name: `highlight-${zone.id}`,
    listening: false,
  });
}

function _buildWedgeHighlight(zone: OverlayZone, isSelected: boolean): Konva.Wedge {
  const cx = Number(zone.metadata["_wedge_cx"] ?? zone.x + zone.width / 2);
  const cy = Number(zone.metadata["_wedge_cy"] ?? zone.y + zone.height / 2);
  const r = Number(zone.metadata["_wedge_r"] ?? Math.max(zone.width, zone.height) / 2);

  let rotation: number;
  let angle: number;
  let clockwise: boolean;

  // Frontend renderers (pie.ts) store Konva-native params directly.
  if (zone.metadata["_konva_rotation"] !== undefined) {
    rotation = Number(zone.metadata["_konva_rotation"]);
    angle = Number(zone.metadata["_konva_angle"]);
    clockwise = false;
  } else {
    // Backend matplotlib: theta measured CCW from 3-o'clock in math coords.
    // Konva Wedge with clockwise=false draws a SHORT CW arc from angle 0.
    // To match matplotlib's CCW sweep from theta1 to theta2:
    //   rotation = -theta2 (maps end angle to Konva screen coords)
    //   The CW sweep from -theta2 by (theta2-theta1) covers the same
    //   visual region as CCW sweep from theta1 to theta2.
    const theta1 = Number(zone.metadata["_wedge_theta1"] ?? 0);
    const theta2 = Number(zone.metadata["_wedge_theta2"] ?? 360);
    rotation = -theta2;
    angle = theta2 - theta1;
    clockwise = false;
  }

  return new Konva.Wedge({
    x: cx,
    y: cy,
    radius: r + 2,
    angle: angle > 0 ? angle : 360 + angle,
    rotation,
    clockwise,
    fill: "transparent",
    stroke: "#111827",
    strokeWidth: isSelected ? 2 : 0,
    name: `highlight-${zone.id}`,
    listening: false,
  });
}

export function buildOverlay(
  overlayLayer: Konva.Layer,
  overlayConfig: OverlayConfig,
  callbacks: OverlayCallbacks,
): Konva.Group {
  const group = new Konva.Group({ name: "overlay-group" });
  const zoneMap = new Map<string, Konva.Group>();

  // Build zone hit areas
  for (const zone of overlayConfig.zones) {
    const tolerance = zone.hitTolerance ?? HIT_TOLERANCE;
    const hitRect = new Konva.Rect({
      x: zone.x - tolerance,
      y: zone.y - tolerance,
      width: zone.width + tolerance * 2,
      height: zone.height + tolerance * 2,
      fill: "transparent",
      name: `hit-${zone.id}`,
    });

    const isSelected = overlayConfig.selections?.includes(zone.id) ?? false;
    const zoneShape = String(zone.metadata["_shape"] ?? "rect");

    // Selection highlight shape — matches the underlying chart element.
    const highlight: Konva.Shape =
      zoneShape === "wedge"
        ? _buildWedgeHighlight(zone, isSelected)
        : zoneShape === "circle"
          ? _buildCircleHighlight(zone, isSelected)
          : new Konva.Rect({
            x: zone.x - 2,
            y: zone.y - 2,
            width: zone.width + 4,
            height: zone.height + 4,
            fill: "transparent",
            stroke: "#111827",
            strokeWidth: isSelected ? 2 : 0,
            cornerRadius: 2,
            name: `highlight-${zone.id}`,
            listening: false,
          });

    const zGroup = new Konva.Group({ name: zone.id });
    zGroup.add(hitRect);
    zGroup.add(highlight);
    zGroup.setAttr("zoneData", zone);
    zGroup.setAttr("isSelected", isSelected);

    // Hover effect — check current selection state at event time,
    // not the stale build-time isSelected captured in closure.
    hitRect.on("mouseenter", () => {
      const sel = zGroup.getAttr("isSelected") ?? false;
      highlight.strokeWidth(2);
      highlight.stroke(sel ? "#111827" : "#9CA3AF");
      overlayLayer.batchDraw();
      callbacks.onZoneHover?.(zone);
    });

    hitRect.on("mouseleave", () => {
      // Defer to next frame so that any pending selection state update
      // (from a click-toggle that just fired) is reflected before we
      // decide whether to keep the highlight.
      requestAnimationFrame(() => {
        const sel = zGroup.getAttr("isSelected") ?? false;
        highlight.strokeWidth(sel ? 2 : 0);
        highlight.stroke(sel ? "#111827" : "transparent");
        overlayLayer.batchDraw();
      });
      callbacks.onZoneHover?.(null);
    });

    // Click
    hitRect.on("click", (e) => {
      callbacks.onZoneClick?.(zone, e);
    });

    hitRect.on("dblclick", (e) => {
      callbacks.onZoneDblClick?.(zone, e);
    });

    zoneMap.set(zone.id, zGroup);
    group.add(zGroup);
  }

  // Box selection
  if (overlayConfig.boxSelectEnabled) {
    let isSelecting = false;
    let startX = 0;
    let startY = 0;
    let selectRect: Konva.Rect | null = null;

    overlayLayer.on("mousedown", (e) => {
      // Only start box select on empty area (not on a zone)
      const target = e.target;
      if (target.name()?.startsWith("hit-")) return;
      if (e.evt.button !== 0) return;

      isSelecting = true;
      const pos = overlayLayer.getRelativePointerPosition();
      if (!pos) return;
      startX = pos.x;
      startY = pos.y;

      selectRect = new Konva.Rect({
        x: startX,
        y: startY,
        width: 0,
        height: 0,
        fill: BOX_SELECT_FILL,
        stroke: BOX_SELECT_STROKE,
        strokeWidth: 1,
        dash: [4, 4],
      });
      overlayLayer.add(selectRect);
    });

    overlayLayer.on("mousemove", () => {
      if (!isSelecting || !selectRect) return;
      const pos = overlayLayer.getRelativePointerPosition();
      if (!pos) return;

      const x = Math.min(startX, pos.x);
      const y = Math.min(startY, pos.y);
      const w = Math.abs(pos.x - startX);
      const h = Math.abs(pos.y - startY);

      selectRect.x(x);
      selectRect.y(y);
      selectRect.width(w);
      selectRect.height(h);
      overlayLayer.batchDraw();
    });

    overlayLayer.on("mouseup", () => {
      if (!isSelecting || !selectRect) {
        isSelecting = false;
        return;
      }
      isSelecting = false;

      // Find zones within selection rect
      const box = selectRect.getClientRect();
      const selectedZones: OverlayZone[] = [];

      for (const zone of overlayConfig.zones) {
        const zx = zone.x + zone.width / 2;
        const zy = zone.y + zone.height / 2;
        if (zx >= box.x && zx <= box.x + box.width && zy >= box.y && zy <= box.y + box.height) {
          selectedZones.push(zone);
        }
      }

      selectRect.destroy();
      selectRect = null;
      overlayLayer.batchDraw();

      if (selectedZones.length > 0) {
        callbacks.onBoxSelect?.(selectedZones);
      }
    });
  }

  overlayLayer.add(group);
  return group;
}

export function updateOverlaySelections(
  group: Konva.Group,
  overlayConfig: OverlayConfig,
  selectedMeta?: { series: string; category: string | number }[],
): void {
  const selections = new Set(overlayConfig.selections ?? []);

  // Build fallback match set from (series, category) keys so that
  // model-driven semantic selections (which use a different ID scheme)
  // still light up the matching overlay zones.
  const metaKeys = new Set<string>();
  if (selectedMeta && selectedMeta.length > 0) {
    for (const el of selectedMeta) {
      metaKeys.add(`${el.series}|||${el.category}`);
    }
  }

  for (const child of group.getChildren()) {
    const childGroup = child as Konva.Group;
    if (!childGroup.getAttr || !childGroup.getChildren) continue;
    const zoneData = childGroup.getAttr("zoneData") as OverlayZone | undefined;
    if (!zoneData) continue;

    const zoneSeries = String(zoneData.metadata["series"] ?? "");
    const zoneCategory = String(zoneData.metadata["category"] ?? "");

    let selected = selections.has(zoneData.id);
    if (!selected && metaKeys.size > 0) {
      selected = metaKeys.has(`${zoneSeries}|||${zoneCategory}`);
    }

    const highlight = childGroup.getChildren().find(
      (c) => c.name()?.startsWith("highlight-"),
    ) as Konva.Shape | undefined;
    if (highlight) {
      childGroup.setAttr("isSelected", selected);
      highlight.strokeWidth(selected ? 2 : 0);
      highlight.stroke(selected ? "#111827" : "transparent");
    }
  }
  group.getLayer()?.batchDraw();
}

export function clearOverlay(group: Konva.Group): void {
  group.destroy();
  group.getLayer()?.batchDraw();
}
