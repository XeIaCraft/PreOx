// Consistency of the reference protocols: technique and drugs, post-op
// plan and drugs, children's doses, pedagogy of the risks, PROSPECT.
import { expect, it } from "vitest";
import { REFERENCE_PROTOCOLS } from "./reference-protocols";
import { SURGERY_CATALOG } from "./surgeries";
import { prospectFor } from "./prospect";
it("reference protocols are consistent", () => {
  const out: string[] = [];
  const n = (id: string) => Number(id.slice(-12));
  const CHILD_DOSED = new Set([9, 32, 70, 74, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103]);
  for (const p of REFERENCE_PROTOCOLS) {
    const c = p.content, pp = c.postopPlan;
    const routes = new Set(c.drugs.map((d) => d.route));
    const has = (r: string) => routes.has(r);
    const t = new Set(c.techniques);
    const tag = `${n(p.id)} ${p.name}`;
    if (t.has("neuraxial") && !has("intrathecal") && !has("peridural")) out.push(`${tag}: technique neuraxiale sans produit intrathécal/péridural`);
    if ((has("intrathecal") || has("peridural")) && !t.has("neuraxial")) out.push(`${tag}: produit neuraxial sans technique neuraxiale`);
    if (has("perinerveux") && !t.has("deep_block") && !t.has("superficial_block")) out.push(`${tag}: bloc sans technique ALR`);
    if ((t.has("deep_block") || t.has("superficial_block")) && !has("perinerveux") && !has("infiltration")) out.push(`${tag}: technique ALR sans produit`);
    if (t.has("general") && !c.drugs.some((d) => d.phase === "induction")) out.push(`${tag}: AG sans induction`);
    if (pp) {
      const a = new Set(pp.analgesia);
      if (a.has("pcea") && !has("peridural")) out.push(`${tag}: PCEA sans péridurale`);
      if (a.has("pcea") && !pp.pcea) out.push(`${tag}: PCEA sans réglages`);
      if (a.has("intrathecal_morphine") && !c.drugs.some((d) => /morphine/i.test(d.name) && d.route === "intrathecal")) out.push(`${tag}: morphine IT au post-op sans produit`);
      if (a.has("perineural") && !has("perinerveux")) out.push(`${tag}: cathéter périnerveux sans bloc`);
      if (a.has("perineural") && !pp.perineural && pp.destination !== "ambulatory") out.push(`${tag}: périnerveux sans réglages`);
      if ((a.has("intrathecal_morphine") || a.has("pca_morphine") || a.has("pcea")) && !pp.watch.includes("sedation")) out.push(`${tag}: opioïde neuraxial/PCA sans surveillance de sédation`);
      if (pp.destination === "ambulatory" && (a.has("pcea") || a.has("pca_morphine") || a.has("intrathecal_morphine"))) out.push(`${tag}: ambulatoire avec PCA/PCEA/morphine IT`);
      if (has("perinerveux") && !pp.watch.includes("block") && pp.destination !== "icu") out.push(`${tag}: bloc sans surveillance du bloc`);
      if (!pp.thrombo) out.push(`${tag}: thromboprophylaxie non précisée`);
    } else out.push(`${tag}: pas de plan post-op`);
    if (CHILD_DOSED.has(n(p.id))) for (const d of c.drugs) if (d.doseMode === "fixed" && !/sédation|noradr|glucose|morphine intrath|infiltration/i.test(d.name + d.route) && d.amount! > 1) out.push(`${tag}: dose fixe chez l'enfant — ${d.name} ${d.amount} ${d.unit}`);
    if (c.risks.length < 2) out.push(`${tag}: ${c.risks.length} risque(s) seulement`);
    if (c.targets.length < 2) out.push(`${tag}: ${c.targets.length} cible(s)`);
    for (const r of c.risks) if (!r.why || !r.prevention) out.push(`${tag}: risque « ${r.title} » sans pourquoi/prévention`);
  }
  for (const p of REFERENCE_PROTOCOLS) {
    const s = SURGERY_CATALOG.find((x) => x.name === p.surgery);
    if (!s) { out.push(`${n(p.id)} ${p.name}: champ intervention « ${p.surgery} » absent du catalogue`); continue; }
    const pr = prospectFor(s);
    if (pr && p.content.postopPlan) for (const a of pr.postop) if (!p.content.postopPlan.analgesia.includes(a)) out.push(`${n(p.id)} ${p.name}: PROSPECT ${pr.id} demande ${a}`);
  }
  // Known exception: NSAIDs after coronary surgery are left to the team (bleeding, kidney, graft) — see the protocol notes.
  expect(out.filter((x) => !/Chirurgie cardiaque sous CEC.*nsaid/.test(x))).toEqual([]);
});
