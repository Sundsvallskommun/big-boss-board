import type { AreaStatus, Status } from "@/lib/api";

/** KPI-statusskala mappad mot designsystemets semantiska tokens (designbeslut, BYGGPLAN §6):
 *  good→success, warn→warning, alert→error. Ingen egen hex — endast SK-tokens. */
export interface StatusTokens {
  /** Solid semantisk färg för prick/mätarfyllnad/topbar. */
  solid: string;
  /** Solid semantisk färg som textton (KPI-kortets ikon, som prototypen). */
  solidText: string;
  /** Mjuk bakgrundston för kort/pill. */
  soft: string;
  /** Läsbar textton mot mjuk bakgrund. */
  text: string;
  /** Gradient-startton för panelhuvud (mjuk ton → vitt, som prototypen). */
  gradient: string;
  border: string;
  /** SVG stroke-klass (mätare/gauge). */
  stroke: string;
  /** Färgvärde för <Icon color>. */
  iconColor: "success" | "warning" | "error";
  /** Legendtext i interface-rösten. */
  legend: string;
}

export const STATUS: Record<Status, StatusTokens> = {
  good: {
    solid: "bg-status-good",
    solidText: "text-status-good",
    soft: "bg-success-background-200",
    text: "text-success-text",
    gradient: "from-success-background-200",
    border: "border-success",
    stroke: "stroke-status-good",
    iconColor: "success",
    legend: "Över mål",
  },
  warn: {
    solid: "bg-status-warn",
    solidText: "text-status-warn",
    soft: "bg-warning-background-100",
    text: "text-warning-text",
    gradient: "from-warning-background-100",
    border: "border-warning",
    stroke: "stroke-status-warn",
    iconColor: "warning",
    legend: "Bevaka",
  },
  alert: {
    solid: "bg-status-alert",
    solidText: "text-status-alert",
    soft: "bg-error-background-200",
    text: "text-error-text",
    gradient: "from-error-background-200",
    border: "border-error",
    stroke: "stroke-status-alert",
    iconColor: "error",
    legend: "Åtgärd krävs",
  },
};

/** En underdimension för ett nyckeltal vars manuella status delas i flikar (BYGGPLAN §16). */
export interface StatusDimension {
  key: string;
  label: string;
}

/** Nyckeltal vars manuella status delas i flikar. Övriga dialog-only-nyckeltal = en status. */
export const AREA_DIMENSIONS: Record<string, StatusDimension[]> = {
  verksamhet: [
    { key: "grunduppdrag", label: "Grunduppdrag" },
    { key: "fullmaktigemal", label: "Fullmäktigemål" },
  ],
};

const SEVERITY: Record<Status, number> = { good: 0, warn: 1, alert: 2 };

/** Senaste posten i historiken för en viss dimension (historik är nyast först). */
export function senastePerDimension(historik: AreaStatus[], dim: string | null): AreaStatus | null {
  return historik.find((h) => (h.dimension ?? null) === dim) ?? null;
}

/** Effektiv kortstatus: värsta av dimensionernas senaste status (grön < gul < röd),
 *  eller senaste posten för nyckeltal med en enda status. null = inget satt. */
export function kortStatus(historik: AreaStatus[], dims: StatusDimension[] | null): Status | null {
  if (!dims) return historik[0]?.status ?? null;
  const senaste = dims
    .map((d) => senastePerDimension(historik, d.key)?.status)
    .filter((s): s is Status => !!s);
  if (senaste.length === 0) return null;
  return senaste.reduce((worst, s) => (SEVERITY[s] > SEVERITY[worst] ? s : worst));
}
