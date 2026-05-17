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

// A charge event = voltage jumped by ≥ 0.15 V between two consecutive
// samples. Higher than the no-load rebound a Li-Ion shows after waking
// from deep-sleep current draw (typically 30–80 mV), so real charging
// triggers reliably without false positives.
export function detectChargeEvent(prevV: number | null, currV: number | null): boolean {
  if (prevV == null || currV == null) return false;
  return currV - prevV >= 0.15;
}

export interface BatteryStatus {
  raw: number | null;
  mv: number | null;
  voltage: number;
  estimate: BatteryEstimate;
  cyclesSinceLastCharge: number;
  cyclesPerFullBattery: number | null;
  // Estimated days until cyclesSinceLastCharge would reach cyclesPerFullBattery,
  // given the firmware's 10-min sampling interval. null when we haven't yet
  // observed a full charge-discharge cycle.
  daysUntilCritical: number | null;
  lastChargeAt: string | null;
  // True when the voltage was derived from per-chip eFuse calibration
  // rather than the linear raw approximation. UI can use this to nudge a
  // ±50 mV vs ±10 mV tooltip if it ever cares.
  calibrated: boolean;
}

// Default sampling cadence in seconds — must match CONFIG_ZELENKA_SAMPLE_INTERVAL_SEC.
// Used to translate "cycles remaining" into a days-until-critical hint shown
// in the drill-down view and in the weekly battery_low push body.
const SAMPLE_INTERVAL_SEC = 600;

export function buildBatteryStatus(
  raw: number | null | undefined,
  mv: number | null | undefined,
  device: {
    cyclesSinceLastCharge: number;
    cyclesPerFullBattery: number | null;
    lastChargeAt: Date | null;
  },
): BatteryStatus | null {
  if (raw == null && mv == null) return null;
  const voltage = batteryVoltage(raw, mv);
  if (voltage == null) return null;
  const estimate = voltageToEstimate(voltage);
  if (estimate == null) return null;

  let daysUntilCritical: number | null = null;
  if (device.cyclesPerFullBattery != null) {
    const remaining = Math.max(0, device.cyclesPerFullBattery - device.cyclesSinceLastCharge);
    daysUntilCritical = Math.round((remaining * SAMPLE_INTERVAL_SEC) / 86400);
  }

  return {
    raw: raw ?? null,
    mv: mv ?? null,
    voltage,
    estimate,
    cyclesSinceLastCharge: device.cyclesSinceLastCharge,
    cyclesPerFullBattery: device.cyclesPerFullBattery,
    daysUntilCritical,
    lastChargeAt: device.lastChargeAt?.toISOString() ?? null,
    calibrated: mv != null,
  };
}

// Update the device's battery counters after a fresh batch of measurements
// lands. Detects a charge event by comparing the freshest sample's voltage
// with the prior recorded voltage and bumps the per-cycle counter on every
// sample regardless. The rolling-average update is a simple 2-sample mean —
// good enough to converge in a couple of full charge cycles.
export async function updateBatteryCounters(args: {
  deviceId: string;
  device: { cyclesSinceLastCharge: number; cyclesPerFullBattery: number | null };
  priorVoltage: number | null;
  // Each entry carries the raw + optional mv from a single fresh sample;
  // mv wins when present (calibrated firmware), raw is the fallback.
  freshBatterySamples: ReadonlyArray<{ raw: number | null | undefined; mv: number | null | undefined }>;
}): Promise<{ chargeDetected: boolean; newCounter: number; newPerFull: number | null }> {
  const samples = args.freshBatterySamples
    .map((s) => batteryVoltage(s.raw, s.mv))
    .filter((v): v is number => v != null);
  if (samples.length === 0) {
    return {
      chargeDetected: false,
      newCounter: args.device.cyclesSinceLastCharge,
      newPerFull: args.device.cyclesPerFullBattery,
    };
  }

  const latestVoltage = samples[samples.length - 1];
  const chargeDetected = detectChargeEvent(args.priorVoltage, latestVoltage);

  if (chargeDetected) {
    const cyclesSpent = args.device.cyclesSinceLastCharge + samples.length;
    const prevPerFull = args.device.cyclesPerFullBattery;
    const newPerFull = prevPerFull == null
      ? cyclesSpent
      : Math.round((prevPerFull + cyclesSpent) / 2); // 2-sample rolling mean
    return { chargeDetected: true, newCounter: 0, newPerFull };
  }

  return {
    chargeDetected: false,
    newCounter: args.device.cyclesSinceLastCharge + samples.length,
    newPerFull: args.device.cyclesPerFullBattery,
  };
}

