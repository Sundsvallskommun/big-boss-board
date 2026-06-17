import {
  Landmark,
  Users,
  HeartPulse,
  Megaphone,
  Target,
  Cpu,
  type LucideIcon,
} from "lucide-react";

/** Mappar områdets ikon-nyckel (från API:t) till en Lucide-komponent. */
const AREA_ICONS: Record<string, LucideIcon> = {
  landmark: Landmark,
  users: Users,
  "heart-pulse": HeartPulse,
  megaphone: Megaphone,
  target: Target,
  cpu: Cpu,
};

export function areaIcon(key: string): LucideIcon {
  return AREA_ICONS[key] ?? Target;
}
