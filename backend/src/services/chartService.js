import fs from "fs";
import { ChartJSNodeCanvas } from "chartjs-node-canvas";

const DEFAULT_WIDTH = 700;
const DEFAULT_HEIGHT = 420;

/**
 * Render a chart to a PNG buffer using Chart.js, server-side. This is
 * how Word/Excel get chart visuals: neither library has a good native
 * chart-authoring API in Node, so the chart is rendered as an image
 * and embedded. The result is NOT editable inside Word/Excel after
 * the fact — for an editable chart, see pptxService.js, which uses
 * PowerPoint's own native chart objects instead.
 *
 * spec: {
 *   type: 'bar' | 'line' | 'pie' | 'doughnut' | 'scatter',
 *   title: string,
 *   labels: string[],
 *   datasets: [{ label: string, data: number[], color?: string }],
 *   colors?: string[] (palette, used if per-dataset color isn't set)
 * }
 */
export async function renderChartImage(spec, outPath, options = {}) {
  const width = options.width || DEFAULT_WIDTH;
  const height = options.height || DEFAULT_HEIGHT;
  const canvas = new ChartJSNodeCanvas({ width, height, backgroundColour: "white" });

  const palette = spec.colors || [
    "#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F",
    "#EDC948", "#B07AA1", "#FF9DA7", "#9C755F", "#BAB0AC",
  ];

  const datasets = spec.datasets.map((ds, i) => ({
    label: ds.label,
    data: ds.data,
    backgroundColor: ds.color || palette[i % palette.length],
    borderColor: ds.color || palette[i % palette.length],
    borderWidth: 1,
  }));

  const config = {
    type: spec.type || "bar",
    data: { labels: spec.labels, datasets },
    options: {
      plugins: {
        title: { display: !!spec.title, text: spec.title || "" },
        legend: { display: datasets.length > 1 || spec.type === "pie" || spec.type === "doughnut" },
      },
      responsive: false,
    },
  };

  const buffer = await canvas.renderToBuffer(config);
  fs.writeFileSync(outPath, buffer);
  return outPath;
}
