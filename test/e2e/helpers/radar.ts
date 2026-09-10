import type { Locator } from '@playwright/test';

/**
 * Geometry the card draws with. `_renderRadarChart` builds a 220x220 viewBox
 * with a 20 unit margin, so the outermost ring - and the furthest entity, once
 * the scale is derived from the data - sits at exactly this radius.
 */
export const CHART_RADIUS = 90;

export interface PlottedPoint {
  /** The name the card puts in front of the accessible label. */
  label: string;
  x: number;
  y: number;
  /** Distance from the centre in chart units. */
  radius: number;
  /** Compass bearing the position encodes, in degrees. */
  bearing: number;
}

function parseTranslate(transform: string | null): { x: number; y: number } {
  const match = /translate\(\s*(-?[\d.e+-]+)\s*,\s*(-?[\d.e+-]+)\s*\)/.exec(transform ?? '');
  if (!match) throw new Error(`no translate in transform ${JSON.stringify(transform)}`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

/**
 * Where the card actually put each entity, read back out of the SVG.
 *
 * The card encodes a point as a translate on its `g.entity-group`, measured
 * from the centre of the chart, with 0 degrees pointing up. Turning that back
 * into a radius and a bearing is what lets a test say "on the outer ring, due
 * north" instead of restating the card's own arithmetic.
 */
export async function plottedPoints(scope: Locator): Promise<PlottedPoint[]> {
  const groups = await scope.locator('g.entity-group').all();
  return Promise.all(
    groups.map(async (group) => {
      const { x, y } = parseTranslate(await group.getAttribute('transform'));
      const title = (await group.locator('title').textContent()) ?? '';
      return {
        label: title.split('. ')[0],
        x,
        y,
        radius: Math.hypot(x, y),
        bearing: (Math.round(Math.atan2(x, -y) * (180 / Math.PI)) + 360) % 360,
      };
    }),
  );
}

/** The radii of the grid rings, innermost first. */
export async function gridRadii(scope: Locator): Promise<number[]> {
  const circles = await scope.locator('circle.grid-circle').all();
  const radii = await Promise.all(circles.map(async (circle) => Number(await circle.getAttribute('r'))));
  return radii.sort((a, b) => a - b);
}
