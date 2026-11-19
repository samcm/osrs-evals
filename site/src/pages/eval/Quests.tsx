/** For quest-point evals: which quests each run completed and when, on the progress chart's x and crosshair. */

import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { EChartsOption } from 'echarts';
import { Chart } from '@/components/Chart';
import type { QuestDone } from '@/data/types';
import { categoryAxis, getChartTooltipChrome, tooltipRow, tooltipTitle } from '@/lib/chartChrome';
import { markRich, markText, useBrandImages } from '@/lib/chartKit';
import { questSrc, uiSrc } from '@/lib/assets';
import { useThemeColors } from '@/lib/theme';
import { formatX, useSpriteImages, variantSlugs, xAxisFor } from './chartBits';
import { xAtTick, type RunCurve, type XMeasure } from './model';
import type { ProgressGrid } from './Progress';

const ROW = 30;
const ICON = 20;

const HOW: Record<QuestDone['source'], string> = {
  varp: 'Read from the game’s saves',
  inferred: 'Inferred from a quest-point jump, where the account was and whom it last faced',
};

export function QuestStrip({ curves, x, grid, hover }: { curves: RunCurve[]; x: XMeasure; grid: ProgressGrid; hover: number | null }) {
  const c = useThemeColors();
  const navigate = useNavigate();
  const rows = curves;
  const iconOf = (q: QuestDone): string => (q.quest ? questSrc(q.quest) : uiSrc('quests'));
  const icons = useSpriteImages(
    rows.flatMap(cv => cv.run.metrics.quests.map(iconOf)),
    ICON
  );
  const marks = useBrandImages(
    rows.flatMap(cv => variantSlugs(cv.variant)),
    c.foreground,
    14
  );

  const option = useMemo<EChartsOption>(() => {
    const ordered = [...rows].reverse();
    const points = ordered
      .flatMap((cv, row) =>
        cv.run.metrics.quests.map(q => {
          const at = xAtTick(cv, q.tick, x);
          return { cv, q, row, at: at == null ? null : Math.min(grid.range.max, Math.max(grid.range.min, at)) };
        })
      )
      .filter(p => p.at != null);
    return {
      animation: false,
      grid: { left: grid.left, right: grid.right, top: 6, bottom: 6 },
      tooltip: {
        ...getChartTooltipChrome(c),
        trigger: 'item',
        formatter: (p: unknown) => {
          const point = points[(p as { dataIndex: number }).dataIndex];
          if (!point) return '';
          return (
            tooltipTitle(point.q.name ?? 'A quest we could not name') +
            tooltipRow(
              c.resolve(point.cv.variant.color.token),
              `${point.cv.variant.short}, epoch ${point.cv.run.epoch}`,
              formatX(point.at, x)
            ) +
            `<div style="margin-top:4px;max-width:240px;white-space:normal;color:${c.muted}">${HOW[point.q.source]}</div>`
          );
        },
      },
      xAxis: { ...xAxisFor(c, grid.range, x), axisLabel: { show: false }, axisLine: { show: false } },
      yAxis: {
        type: 'category',
        data: ordered.map(cv => cv.run.id),
        ...categoryAxis(c),
        axisLine: { show: false },
        splitLine: { show: true, lineStyle: { color: c.border } },
        axisLabel: {
          ...categoryAxis(c).axisLabel,
          margin: 6,
          formatter: (id: string) => {
            const cv = ordered.find(r => r.run.id === id)!;
            return markText(marks, variantSlugs(cv.variant), String(cv.run.epoch));
          },
          rich: markRich(marks),
        },
      },
      series: [
        {
          type: 'scatter',
          silent: true,
          tooltip: { show: false },
          symbol: 'circle',
          symbolSize: ICON + 6,
          itemStyle: { color: 'transparent', borderColor: c.muted, borderWidth: 1, borderType: [2, 2] },
          data: points.map(p => (p.q.source === 'inferred' ? [p.at, p.row] : [null, p.row])),
          z: 1,
        },
        {
          type: 'scatter',
          symbolSize: ICON,
          data: points.map(p => ({
            value: [p.at, p.row],
            runId: p.cv.run.id,
            symbol: icons[iconOf(p.q)] ? `image://${icons[iconOf(p.q)]}` : 'circle',
            itemStyle: { color: c.muted },
          })),
          z: 2,
        },
        {
          // The progress chart's crosshair, carried down
          type: 'line',
          data: [],
          silent: true,
          markLine: {
            silent: true,
            symbol: 'none',
            animation: false,
            label: { show: false },
            lineStyle: { color: c.muted, type: 'dashed', width: 1 },
            data: hover == null ? [] : [{ xAxis: hover }],
          },
        },
      ],
    } as EChartsOption;
  }, [c, grid, hover, icons, marks, rows, x]);

  if (rows.length === 0) return null;
  return (
    <Chart
      option={option}
      height={12 + rows.length * ROW}
      className="mt-1"
      onEvents={{
        click: p => {
          const runId = (p as { data?: { runId?: string } }).data?.runId;
          if (runId) navigate({ to: '/runs/$runId', params: { runId }, search: {} as never });
        },
      }}
    />
  );
}
