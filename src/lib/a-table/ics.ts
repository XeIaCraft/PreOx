import { WEEKDAY_PLACEMENTS } from "./constants";
import type { MealCard, Placement, Recipe } from "./types";

function icsDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

/** This week's actual calendar date for a given weekday placement (Monday-first). */
function dateForPlacement(placement: Placement, weekStart: Date): Date {
  const index = WEEKDAY_PLACEMENTS.indexOf(placement);
  const date = new Date(weekStart);
  date.setDate(date.getDate() + Math.max(0, index));
  return date;
}

/** Builds a downloadable .ics with one all-day event per planned meal, using the given week's actual calendar dates. */
export function buildWeekIcs(activeCards: MealCard[], recipesById: Map<string, Recipe>, weekStart: Date): string {
  const now = new Date();

  const events = activeCards
    .filter((c) => WEEKDAY_PLACEMENTS.includes(c.placement))
    .map((card) => {
      const recipe = recipesById.get(card.recipe_id);
      if (!recipe) return null;
      const date = dateForPlacement(card.placement, weekStart);
      const nextDate = new Date(date);
      nextDate.setDate(date.getDate() + 1);
      return [
        "BEGIN:VEVENT",
        `UID:${card.id}@preox`,
        `DTSTAMP:${icsDate(now)}T000000Z`,
        `DTSTART;VALUE=DATE:${icsDate(date)}`,
        `DTEND;VALUE=DATE:${icsDate(nextDate)}`,
        `SUMMARY:${icsEscape(recipe.title)}`,
        `DESCRIPTION:${icsEscape(`${card.servings} portion(s)`)}`,
        "END:VEVENT",
      ].join("\r\n");
    })
    .filter((e): e is string => e !== null);

  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PreOx//A table//FR", ...events, "END:VCALENDAR"].join("\r\n");
}
