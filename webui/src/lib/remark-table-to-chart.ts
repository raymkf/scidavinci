import { type Root } from "mdast";
import type { Table, TableRow, TableCell, Html } from "mdast";

import type { ChartConfig } from "@/lib/chart-types";

/** A remark plugin that converts suitable markdown tables into interactive chart-canvas code blocks.
 *
 * Heuristic:
 * - Auto-convert: ≥3 rows AND ≥2 fully-numeric columns → keep table + append chart
 * - Force with ``<!-- chart -->``: ≥2 rows AND ≥1 numeric column
 * - ``<!-- chart -->`` HTML comment immediately before a table forces relaxed
 *   thresholds. The comment node is consumed (not rendered).
 *
 * The plugin runs AFTER remark-gfm so tables are already parsed into mdast nodes.
 */
export default function remarkTableToChart() {
  return (tree: Root) => {
    const newChildren: Root["children"] = [];
    let skipNext = false;

    for (let i = 0; i < tree.children.length; i++) {
      const node = tree.children[i];

      if (skipNext) {
        skipNext = false;
        newChildren.push(node);
        continue;
      }

      // Check for <!-- chart --> marker
      let forceConvert = false;
      if (node.type === "html") {
        const html = node as Html;
        const trimmed = html.value.trim().toLowerCase();
        if (trimmed.startsWith("<!-- chart") || trimmed.startsWith("<!--chart")) {
          // Consume the marker; look ahead for a table
          const next = tree.children[i + 1];
          if (next && next.type === "table") {
            forceConvert = true;
            // Advance past the marker and process the table
            const tableNode = next as Table;
            const result = tryConvertTable(tableNode, forceConvert);
            newChildren.push(tableNode);
            if (result) {
              newChildren.push(result);
            }
            skipNext = true;
            i++; // skip the table in the outer loop (we already handled it)
            continue;
          }
        }
      }

      if (node.type === "table") {
        const tableNode = node as Table;
        const result = tryConvertTable(tableNode, forceConvert);
        newChildren.push(tableNode);
        if (result) {
          newChildren.push(result);
        }
        continue;
      }

      newChildren.push(node);
    }

    tree.children = newChildren;
  };
}

/** Attempt to extract numeric columns from a table and return a chart-canvas code node. */
function tryConvertTable(
  table: Table,
  force: boolean,
): { type: "code"; lang: string; value: string } | null {
  const rows = table.children;
  if (rows.length < (force ? 2 : 3)) return null;

  const headers = extractRowCells(rows[0]);
  if (headers.length < 2) return null;

  const dataRows = rows.slice(1);
  const colCount = headers.length;

  // Build column arrays
  const colValues: string[][] = [];
  for (let ci = 0; ci < colCount; ci++) {
    colValues.push([]);
  }

  for (const row of dataRows) {
    const cells = extractRowCells(row);
    for (let ci = 0; ci < colCount; ci++) {
      colValues[ci].push(cells[ci] ?? "");
    }
  }

  // Identify numeric columns (skip first column — it's the x-axis label)
  const numericColIndices: number[] = [];
  for (let ci = 1; ci < colCount; ci++) {
    const allNumeric = colValues[ci].every(
      (v) => v.trim() !== "" && isFiniteNumber(extractNumeric(v)),
    );
    if (allNumeric) {
      numericColIndices.push(ci);
    }
  }

  const minNumCols = force ? 1 : 2;
  if (numericColIndices.length < minNumCols) return null;

  // Build ChartConfig
  const xField = headers[0];
  const yFields = numericColIndices.map((ci) => headers[ci]);

  const data: Record<string, unknown>[] = [];
  for (let ri = 0; ri < dataRows.length; ri++) {
    const row: Record<string, unknown> = {};
    const cells = extractRowCells(dataRows[ri]);
    // First column = x-axis label (always string)
    row[xField] = cells[0] ?? "";
    for (const ci of numericColIndices) {
      const rawVal = cells[ci] ?? "";
      row[headers[ci]] = extractNumeric(rawVal);
    }
    data.push(row);
  }

  const config: ChartConfig = {
    type: "bar",
    title: autoTitle(xField, yFields),
    data,
    xField,
    yFields,
    description: "Auto-converted from table",
  };

  return {
    type: "code",
    lang: "chart-canvas",
    value: JSON.stringify(config, null, 2),
  };
}

// -- helpers ---------------------------------------------------------------

/** Extract visible text from table cells (joining child text nodes). */
function extractRowCells(row: TableRow): string[] {
  return row.children.map(cellText);
}

function cellText(cell: TableCell): string {
  let text = "";
  for (const child of cell.children) {
    if (child.type === "text") {
      text += child.value;
    }
    // skip inline formatting (strong, emphasis, etc.) for simplicity
  }
  return text;
}

/** Parse a numeric value from a string, stripping common unit suffixes. */
function extractNumeric(raw: string): number {
  const cleaned = raw.trim().replace(/[,$% ]/g, "");
  const num = Number(cleaned);
  if (isFinite(num)) return num;
  // Try parsing with stripped non-numeric suffix (e.g. "10.5 kg")
  const match = cleaned.match(/^([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
  if (match) {
    const parsed = Number(match[1]);
    if (isFinite(parsed)) return parsed;
  }
  return NaN;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && isFinite(v);
}

function autoTitle(xField: string, yFields: string[]): string {
  if (yFields.length === 1) {
    return `${yFields[0]} by ${xField}`;
  }
  return `Comparison by ${xField}`;
}
