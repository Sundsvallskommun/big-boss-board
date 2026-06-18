import type { Status } from "@/lib/api";

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
    solid: "bg-success",
    solidText: "text-success",
    soft: "bg-success-background-200",
    text: "text-success-text",
    gradient: "from-success-background-200",
    border: "border-success",
    stroke: "stroke-success",
    iconColor: "success",
    legend: "Över mål",
  },
  warn: {
    solid: "bg-warning",
    solidText: "text-warning",
    soft: "bg-warning-background-100",
    text: "text-warning-text",
    gradient: "from-warning-background-100",
    border: "border-warning",
    stroke: "stroke-warning",
    iconColor: "warning",
    legend: "Bevaka",
  },
  alert: {
    solid: "bg-error",
    solidText: "text-error",
    soft: "bg-error-background-200",
    text: "text-error-text",
    gradient: "from-error-background-200",
    border: "border-error",
    stroke: "stroke-error",
    iconColor: "error",
    legend: "Åtgärd krävs",
  },
};
