import { createElement, type ReactNode } from "react";
import {
  LayoutGrid,
  Stethoscope,
  ClipboardList,
  ListChecks,
  BookOpen,
  FlaskConical,
  HeartPulse,
  Activity,
  Syringe,
  Microscope,
  FileText,
  GraduationCap,
  Brain,
  Pill,
  ClipboardCheck,
  Utensils,
  type LucideIcon,
} from "lucide-react";

export const ICON_OPTIONS = [
  "layout-grid",
  "stethoscope",
  "clipboard-list",
  "list-checks",
  "book-open",
  "flask-conical",
  "heart-pulse",
  "activity",
  "syringe",
  "microscope",
  "file-text",
  "graduation-cap",
  "brain",
  "pill",
  "clipboard-check",
  "utensils",
] as const;

export type IconName = (typeof ICON_OPTIONS)[number];

const ICONS: Record<IconName, LucideIcon> = {
  "layout-grid": LayoutGrid,
  stethoscope: Stethoscope,
  "clipboard-list": ClipboardList,
  "list-checks": ListChecks,
  "book-open": BookOpen,
  "flask-conical": FlaskConical,
  "heart-pulse": HeartPulse,
  activity: Activity,
  syringe: Syringe,
  microscope: Microscope,
  "file-text": FileText,
  "graduation-cap": GraduationCap,
  brain: Brain,
  pill: Pill,
  "clipboard-check": ClipboardCheck,
  utensils: Utensils,
};

function resolveIcon(name: string | null | undefined): LucideIcon {
  if (name && name in ICONS) return ICONS[name as IconName];
  return LayoutGrid;
}

/**
 * Renders one of the fixed set of module icons by name. Returns an element
 * (not a component reference) so callers never bind a dynamically-resolved
 * component to a JSX tag.
 */
export function renderIcon(name: string | null | undefined, className?: string): ReactNode {
  return createElement(resolveIcon(name), { className });
}
