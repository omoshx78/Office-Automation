import PptxGenJS from "pptxgenjs";

/**
 * Build a PowerPoint deck from a structured spec. Charts are built as
 * PowerPoint's own native chart objects (pptxgenjs wraps the same
 * chart XML PowerPoint itself writes) — unlike the chart images
 * embedded in Word/Excel (see chartService.js), these ARE editable
 * after the fact: double-click a chart in PowerPoint and its data,
 * colors, and type can all be adjusted normally.
 *
 * spec: {
 *   title: string,
 *   theme?: { colors?: string[6], fontFace?: string },
 *     // colors: 6-color palette used for chart series / accents, hex without '#'
 *   slides: [
 *     { type: "title", title, subtitle? },
 *     { type: "bullets", title, bullets: string[] },
 *     { type: "image", title?, imagePath },
 *     { type: "table", title?, rows: string[][] },  // rows[0] = header
 *     { type: "chart", title?, chartType: "bar"|"line"|"pie"|"doughnut",
 *       labels: string[], series: [{ name, values: number[] }] },
 *   ]
 * }
 */
export async function createPresentation(spec, outPath) {
  const pres = new PptxGenJS();
  pres.title = spec.title || "Presentation";

  const theme = spec.theme || {};
  const palette = theme.colors || ["4E79A7", "F28E2B", "E15759", "76B7B2", "59A14F", "EDC948"];
  const fontFace = theme.fontFace || "Calibri";

  for (const slideSpec of spec.slides) {
    const slide = pres.addSlide();

    switch (slideSpec.type) {
      case "title": {
        slide.addText(slideSpec.title, {
          x: 0.5, y: 2.0, w: "90%", h: 1.2,
          fontSize: 36, bold: true, fontFace, color: palette[0],
          align: "center",
        });
        if (slideSpec.subtitle) {
          slide.addText(slideSpec.subtitle, {
            x: 0.5, y: 3.2, w: "90%", h: 0.8,
            fontSize: 18, fontFace, color: "666666", align: "center",
          });
        }
        break;
      }

      case "bullets": {
        addSlideTitle(slide, slideSpec.title, fontFace, palette[0]);
        slide.addText(
          slideSpec.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
          { x: 0.5, y: 1.3, w: "90%", h: 4.5, fontSize: 18, fontFace, color: "333333" }
        );
        break;
      }

      case "image": {
        addSlideTitle(slide, slideSpec.title, fontFace, palette[0]);
        slide.addImage({
          path: slideSpec.imagePath,
          x: 0.5, y: 1.3, w: 9, h: 4.5,
          sizing: { type: "contain", w: 9, h: 4.5 },
        });
        break;
      }

      case "table": {
        addSlideTitle(slide, slideSpec.title, fontFace, palette[0]);
        const [header, ...rows] = slideSpec.rows;
        const tableRows = [
          header.map((h) => ({ text: h, options: { bold: true, fill: { color: palette[0] }, color: "FFFFFF" } })),
          ...rows.map((row) => row.map((cell) => ({ text: String(cell) }))),
        ];
        slide.addTable(tableRows, { x: 0.5, y: 1.3, w: 9, fontSize: 12, fontFace, autoPage: false });
        break;
      }

      case "chart": {
        addSlideTitle(slide, slideSpec.title, fontFace, palette[0]);
        const chartTypeMap = {
          bar: pres.ChartType.bar,
          line: pres.ChartType.line,
          pie: pres.ChartType.pie,
          doughnut: pres.ChartType.doughnut,
        };
        const chartData = slideSpec.series.map((s) => ({
          name: s.name,
          labels: slideSpec.labels,
          values: s.values,
        }));
        slide.addChart(chartTypeMap[slideSpec.chartType] || pres.ChartType.bar, chartData, {
          x: 0.5, y: 1.3, w: 9, h: 4.5,
          chartColors: palette,
          showLegend: chartData.length > 1 || ["pie", "doughnut"].includes(slideSpec.chartType),
          showTitle: false,
        });
        break;
      }

      default:
        throw new Error(`Unknown slide type: ${slideSpec.type}`);
    }
  }

  await pres.writeFile({ fileName: outPath });
  return outPath;
}

function addSlideTitle(slide, title, fontFace, color) {
  if (!title) return;
  slide.addText(title, {
    x: 0.5, y: 0.3, w: "90%", h: 0.8,
    fontSize: 24, bold: true, fontFace, color,
  });
}
