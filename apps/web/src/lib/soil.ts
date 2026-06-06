// Map the server's soil comfort band onto the chart's reference-zone shape.
//
// The API sends soil thresholds as { dryAlert, dryWarn, wetWarn, wetAlert }
// (percent), derived per species from the Perenual watering category +
// drought tolerance. The ring verdict grades:
//
//   pct < dryAlert         → alert        pct < dryWarn  → warn
//   dryWarn .. wetWarn     → ok
//   pct > wetWarn          → warn         pct > wetAlert → alert
//
// So the chart's green zone is [dryWarn, wetWarn] and the yellow zone is the
// wider [dryAlert, wetAlert]. Returning that in {okMin,okMax,warnMin,warnMax}
// lets the existing chart/range-bar code render species-specific zones with no
// other changes — the colours now match what the ring actually decided.
//
// Falls back to the generic band (mirrors the server's
// GENERIC_THRESHOLDS.soilMoisturePct) for generic-profile plants and for
// species rows created before pct bands shipped (no migration backfills them).

// Returned as a plain Record so it slots straight into the chart components,
// whose `band` prop is Record<string, number> (same shape as the temp/lux/
// humidity threshold objects).
const GENERIC: Record<string, number> = { okMin: 25, okMax: 85, warnMin: 10, warnMax: 95 };

export function soilPctChartBand(
  thresholds: Record<string, unknown> | null | undefined,
): Record<string, number> {
  const raw = (thresholds?.soilMoisturePct ?? null) as Record<string, unknown> | null;
  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
  const dryAlert = num(raw?.dryAlert);
  const dryWarn = num(raw?.dryWarn);
  const wetWarn = num(raw?.wetWarn);
  const wetAlert = num(raw?.wetAlert);
  if (dryAlert != null && dryWarn != null && wetWarn != null && wetAlert != null) {
    return { okMin: dryWarn, okMax: wetWarn, warnMin: dryAlert, warnMax: wetAlert };
  }
  return GENERIC;
}
