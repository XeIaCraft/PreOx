import type { BlockContent, TableBlockContent, ProtocolBlockContent } from "@/lib/el-profesor/types";

/** Flattens any block's typed content into plain text — used wherever a block needs to be fed to an LLM prompt (mnemonic suggestion, notion categorization, contradiction detection). */
export function blockToPlainText(blockType: string, content: BlockContent): string {
  if (blockType === "tableau_comparatif") {
    const c = content as TableBlockContent;
    return [(c.headers ?? []).join(" | "), ...(c.rows ?? []).map((r) => r.join(" | "))].join("\n");
  }
  if (blockType === "protocole_paliers") {
    const c = content as ProtocolBlockContent;
    return (c.steps ?? []).map((s, i) => `${i + 1}. ${s.label} — ${s.detail}`).join("\n");
  }
  return (content as { text?: string }).text ?? "";
}
