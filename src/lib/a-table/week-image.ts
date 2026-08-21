import { DAY_LABELS, WEEKDAY_PLACEMENTS } from "./constants";
import type { MealCard, Recipe } from "./types";

/**
 * Renders a shareable "menu of the week" image on a plain <canvas> — no
 * recipe photos (avoids canvas-tainting issues with cross-origin Pexels
 * images that aren't served with permissive CORS headers), just a clean
 * typographic card per day. Client-only.
 */
export function buildWeekImage(activeCards: MealCard[], recipesById: Map<string, Recipe>): Promise<Blob> {
  const width = 900;
  const rowHeight = 110;
  const headerHeight = 130;
  const height = headerHeight + WEEKDAY_PLACEMENTS.length * rowHeight + 60;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas non supporté."));

  ctx.fillStyle = "#f7f5f0";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#1f433c";
  ctx.font = "600 40px Georgia, serif";
  ctx.fillText("Menu de la semaine", 40, 65);

  const weekLabel = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  ctx.fillStyle = "#6b7563";
  ctx.font = "18px sans-serif";
  ctx.fillText(`Semaine du ${weekLabel}`, 40, 95);

  let y = headerHeight;
  for (const placement of WEEKDAY_PLACEMENTS) {
    const card = activeCards.find((c) => c.placement === placement);
    const recipe = card ? recipesById.get(card.recipe_id) : undefined;

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#e2ddd0";
    ctx.lineWidth = 1;
    const cardX = 40;
    const cardWidth = width - 80;
    const cardHeight = rowHeight - 16;
    ctx.beginPath();
    ctx.roundRect(cardX, y, cardWidth, cardHeight, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#1f433c";
    ctx.font = "600 16px sans-serif";
    ctx.fillText(DAY_LABELS[placement].toUpperCase(), cardX + 24, y + 36);

    ctx.fillStyle = recipe ? "#2b2b28" : "#a39d8f";
    ctx.font = recipe ? "500 24px Georgia, serif" : "italic 18px sans-serif";
    ctx.fillText(recipe ? recipe.title : "Libre", cardX + 24, y + 68);

    if (recipe?.cooking_minutes != null) {
      ctx.fillStyle = "#6b7563";
      ctx.font = "15px sans-serif";
      ctx.fillText(`${recipe.cooking_minutes} min`, cardX + 24, y + 90);
    }

    y += rowHeight;
  }

  ctx.fillStyle = "#a39d8f";
  ctx.font = "13px sans-serif";
  ctx.fillText("Généré avec PreOx — À table", 40, height - 24);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Échec de la génération de l'image."))), "image/png");
  });
}
