import type { Status } from "@/lib/api";

/** KPI-statusskala mappad mot designsystemets semantiska tokens (designbeslut, BYGGPLAN §6):
 *  good→success, warn→warning, alert→error. Ingen egen hex — endast SK-tokens. */
export interface StatusTokens {
  /** Solid semantisk färg för prick/mätarfyllnad/topbar. */
  solid: string;
  /** Mjuk bakgrundston för kort/pill. */
  soft: string;
  /** Läsbar textton mot mjuk bakgrund. */
  text: string;
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
    soft: "bg-success-background-100",
    text: "text-success-text",
    border: "border-success",
    stroke: "stroke-success",
    iconColor: "success",
    legend: "Över mål",
  },
  warn: {
    solid: "bg-warning",
    soft: "bg-warning-background-100",
    text: "text-warning-text",
    border: "border-warning",
    stroke: "stroke-warning",
    iconColor: "warning",
    legend: "Bevaka",
  },
  alert: {
    solid: "bg-error",
    soft: "bg-error-background-100",
    text: "text-error-text",
    border: "border-error",
    stroke: "stroke-error",
    iconColor: "error",
    legend: "Åtgärd krävs",
  },
};
