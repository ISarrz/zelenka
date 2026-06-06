// Battery raw ADC / calibrated mV → voltage → 4-state qualitative estimate.
//
// Hardware: 100 kΩ : 100 kΩ resistor divider on BAT+ of TP4056, signal fed
// to ADC1_CH3 (GPIO3) on the ESP32-C3 Super Mini. Firmware ≥ 0.1.9 ships
// per-chip curve-fitting calibration (eFuse) and sends `batteryMv` in the
// payload; we prefer that when available. Older firmware (0.1.4–0.1.8)
// sends only `batteryRaw`, and we fall back to a linear 0..3.1 V / 0..4095
// approximation that lands within ±50 mV.
//
// Design constraint (per docs/design-summary.html): battery is shown as
// one of full / mid / low / critical, never as a percentage.

const DIVIDER_RATIO = 2; // V_bat = V_pin × ratio (1:1 divider)
const ADC_FULLSCALE_V = 3.1;
const ADC_FULLSCALE_RAW = 4095;

export function rawToVoltage(raw: number | null | undefined): number | null {
  if (raw == null) return null;
  if (!Number.isFinite(raw) || raw < 0 || raw > ADC_FULLSCALE_RAW) return null;
  const pinV = (raw * ADC_FULLSCALE_V) / ADC_FULLSCALE_RAW;
  return Number((pinV * DIVIDER_RATIO).toFixed(3));
}

export function mvToVoltage(mv: number | null | undefined): number | null {
  if (mv == null) return null;
  if (!Number.isFinite(mv) || mv < 0) return null;
  return Number(((mv / 1000) * DIVIDER_RATIO).toFixed(3));
}

// Prefer calibrated mV when present (firmware ≥ 0.1.9); fall back to the
// linear raw approximation otherwise. Returns V_bat in volts.
export function batteryVoltage(
  raw: number | null | undefined,
  mv: number | null | undefined,
): number | null {
  const fromMv = mvToVoltage(mv);
  if (fromMv != null) return fromMv;
  return rawToVoltage(raw);
}

export type BatteryEstimate = 'full' | 'mid' | 'low' | 'critical';

// Li-Ion discharge curve, four qualitative bands. Critical at 3.4 V leaves
// safety margin above the cell-damage region (3.0 V) so the push fires
// before the protection circuit cuts in.
export function voltageToEstimate(v: number | null): BatteryEstimate | null {
  if (v == null) return null;
  if (v >= 4.0) return 'full';
  if (v >= 3.7) return 'mid';
  if (v >= 3.4) return 'low';
  return 'critical';
}

export interface BatteryStatus {
  raw: number | null;
  mv: number | null;
  voltage: number;
  estimate: BatteryEstimate;
  // True when the voltage was derived from per-chip eFuse calibration
  // rather than the linear raw approximation. UI can use this to nudge a
  // ±50 mV vs ±10 mV tooltip if it ever cares.
  calibrated: boolean;
}

export function buildBatteryStatus(
  raw: number | null | undefined,
  mv: number | null | undefined,
): BatteryStatus | null {
  if (raw == null && mv == null) return null;
  const voltage = batteryVoltage(raw, mv);
  if (voltage == null) return null;
  const estimate = voltageToEstimate(voltage);
  if (estimate == null) return null;

  return {
    raw: raw ?? null,
    mv: mv ?? null,
    voltage,
    estimate,
    calibrated: mv != null,
  };
}

