#!/usr/bin/env node
/**
 * Regenerates src/data/nan-province-geojson.ts — the pre-simplified Nan
 * (MOPH code 55) province + amphoe boundaries that ProvinceMapLeaflet
 * inlines so the map never fetches the ~6 MB Thailand-wide GeoJSON
 * (public/geo/th-provinces.geojson + th-districts.geojson).
 *
 * Pipeline: extract features with pro_code === '55' → Douglas-Peucker per
 * ring (EPSILON degrees ≈ EPSILON × 111 km) → round coordinates to 5
 * decimals (≈1.1 m) → strip properties to the essentials (district
 * centroids only need amp_code; rendering only needs geometry).
 *
 * Run: node scripts/generate-nan-geojson.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROVINCE_CODE = '55';
// KK's inline asset used epsilon = 0.003° (~330 m); Nan's eastern border
// follows the Mekong so a slightly tighter 0.002° (~220 m) keeps the river
// bends recognizable while still cutting the point count hard.
const EPSILON = 0.002;

// ─── Douglas-Peucker ─────────────────────────────────────────────────────

function perpDistance(p, a, b) {
  const [x0, y0] = p;
  const [x1, y1] = a;
  const [x2, y2] = b;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(x0 - x1, y0 - y1);
  return Math.abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / len;
}

function round5(p) {
  return [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5];
}

function simplifyRing(ring, eps) {
  const closed =
    ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  const pts = closed ? ring.slice(0, -1) : ring.slice();
  if (pts.length <= 2) return ring.map(round5);
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    if (e - s < 2) continue;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDistance(pts[i], pts[s], pts[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > eps && idx > -1) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(round5(pts[i]));
  if (closed && out.length) out.push(out[0].slice());
  return out;
}

function simplifyGeometry(geom) {
  if (geom.type === 'Polygon') {
    return { type: 'Polygon', coordinates: geom.coordinates.map((r) => simplifyRing(r, EPSILON)) };
  }
  if (geom.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geom.coordinates.map((poly) => poly.map((r) => simplifyRing(r, EPSILON))),
    };
  }
  throw new Error(`unexpected geometry type: ${geom.type}`);
}

// ─── Stats (area via shoelace, degrees² — only for before/after sanity) ──

function shoelaceArea(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let area = 0;
  for (const rings of polys) {
    for (const ring of rings) {
      let s = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
      }
      area += Math.abs(s) / 2;
    }
  }
  return area;
}

function countCoords(geom) {
  let n = 0;
  const walk = (c) => {
    if (Array.isArray(c[0])) c.forEach(walk);
    else n++;
  };
  walk(geom.coordinates);
  return n;
}

// ─── Extract + simplify ──────────────────────────────────────────────────

const provinces = JSON.parse(readFileSync(resolve(ROOT, 'public/geo/th-provinces.geojson'), 'utf8'));
const districts = JSON.parse(readFileSync(resolve(ROOT, 'public/geo/th-districts.geojson'), 'utf8'));

const province = provinces.features.find((f) => f.properties?.pro_code === PROVINCE_CODE);
if (!province) throw new Error(`province ${PROVINCE_CODE} not found`);
const nanDistricts = districts.features.filter((f) => f.properties?.pro_code === PROVINCE_CODE);
if (!nanDistricts.length) throw new Error(`no districts for ${PROVINCE_CODE}`);

const { pro_th, pro_en } = province.properties;
const provinceFC = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { pro_code: PROVINCE_CODE, pro_th, pro_en },
      geometry: simplifyGeometry(province.geometry),
    },
  ],
};
const districtsFC = {
  type: 'FeatureCollection',
  features: nanDistricts.map((f) => ({
    type: 'Feature',
    properties: {
      pro_code: PROVINCE_CODE,
      amp_code: f.properties.amp_code,
      amp_th: f.properties.amp_th,
      amp_en: f.properties.amp_en,
    },
    geometry: simplifyGeometry(f.geometry),
  })),
};

// ─── Report ──────────────────────────────────────────────────────────────

const areaBefore = shoelaceArea(province.geometry);
const areaAfter = shoelaceArea(provinceFC.features[0].geometry);
console.log(`province ${PROVINCE_CODE} (${pro_th}/${pro_en}): ${nanDistricts.length} districts`);
console.log(
  `  province coords: ${countCoords(province.geometry)} → ${countCoords(provinceFC.features[0].geometry)}`,
);
const distCoordsBefore = nanDistricts.reduce((n, f) => n + countCoords(f.geometry), 0);
const distCoordsAfter = districtsFC.features.reduce((n, f) => n + countCoords(f.geometry), 0);
console.log(`  districts coords: ${distCoordsBefore} → ${distCoordsAfter}`);
console.log(`  area preservation: ${((areaAfter / areaBefore) * 100).toFixed(2)}%`);
for (const f of districtsFC.features) {
  const before = nanDistricts.find((o) => o.properties.amp_code === f.properties.amp_code);
  console.log(
    `  ${f.properties.amp_code} ${f.properties.amp_th}: ${countCoords(before.geometry)} → ${countCoords(f.geometry)}`,
  );
}

// ─── Emit ────────────────────────────────────────────────────────────────

const header = `// AUTO-GENERATED — Nan (MOPH code 55) province + ${nanDistricts.length} amphoe boundaries,\n// extracted from public/geo/th-provinces.geojson + th-districts.geojson and\n// simplified (Douglas-Peucker ε=${EPSILON}° ≈ ${Math.round(EPSILON * 111)} km, coords rounded to\n// 5 decimals). Inlined by ProvinceMapLeaflet so the map skips the ~6 MB\n// Thailand-wide fetch. Regenerate: node scripts/generate-nan-geojson.mjs\n\n`;
const body = `import type { FeatureCollection } from "geojson";\n\nexport const NAN_PROVINCE_GEOJSON: FeatureCollection = ${JSON.stringify(provinceFC)};\n\nexport const NAN_DISTRICTS_GEOJSON: FeatureCollection = ${JSON.stringify(districtsFC)};\n`;

const out = resolve(ROOT, 'src/data/nan-province-geojson.ts');
writeFileSync(out, header + body);
console.log(`\nwrote ${out} (${(Buffer.byteLength(body) / 1024).toFixed(1)} KB)`);
