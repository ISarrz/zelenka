// Battery raw ADC → voltage → 4-state qualitative estimate.
//
// Hardware: 100 kΩ : 100 kΩ resistor divider on BAT+ of TP4056, signal fed
// to ADC1_CH3 (GPIO3) on the ESP32-C3 Super Mini. The C3 ADC at 12 dB
// attenuation is roughly linear over 0..3.1 V → raw 0..4095 without
// per-chip calibration; the small slope error doesn't affect the 4-band
// classification that the UI ultimately renders.
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

// A charge event = voltage jumped by ≥ 0.15 V between two consecutive
// samples. Higher than the no-load rebound a Li-Ion shows after waking
// from deep-sleep current draw (typically 30–80 mV), so real charging
// triggers reliably without false positives.
export function detectChargeEvent(prevV: number | null, currV: number | null): boolean {
  if (prevV == null || currV == null) return false;
  return currV - prevV >= 0.15;
}

export interface BatteryStatus {
  raw: number;
  voltage: number;
  estimate: BatteryEstimate;
}

export function buildBatteryStatus(raw: number | null | undefined): BatteryStatus | null {
  if (raw == null) return null;
  const voltage = rawToVoltage(raw);
  if (voltage == null) return null;
  const estimate = voltageToEstimate(voltage);
  if (estimate == null) return null;
  return { raw, voltage, estimate };
}
