// What may leave the application for an AI service: a general question, to
// build a rule or a protocol that applies to other patients too. Anything
// that could point to a person is refused before the call, on the server
// (the client shows the same check before sending). Ages are turned into
// ranges; exact dates, names, contact details and identifiers are refused.

export interface PrivacyIssue {
  label: string;
  excerpt: string;
}

const CHECKS: { label: string; re: RegExp }[] = [
  { label: "une date précise", re: /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/ },
  { label: "une date de naissance", re: /\bn[ée]e?\s+(le|en)\b/i },
  { label: "une adresse e-mail", re: /[\w.+-]+@[\w-]+\.[\w.]+/ },
  { label: "un numéro de téléphone", re: /(\+\d{2}\s?\d|\b0\d{1,3})([\s./]?\d{2}){3,4}\b/ },
  { label: "un numéro national ou de dossier", re: /\b\d{2}\.\d{2}\.\d{2}-\d{3}\.\d{2}\b|\b\d{7,}\b/ },
  { label: "un nom de personne", re: /\b(M\.|Mme|Mlle|Mr|Monsieur|Madame|Dr|Docteur)\s+[A-ZÀ-Ý][\p{L}'-]+/u },
  { label: "des initiales de patient", re: /\b[Ii]nitiales?\s*:?\s+[A-Z]{2,3}\b|\b([Pp]atiente?|Mr|Mme)\s+(?!(?:ASA|HTA|BPCO|SAOS|IRC|AVC|FA|IMC|ALR|AG|AOD|AVK|HBPM|DFG|ECG|VIH|TVP|EP|RGO|DT[12])\b)[A-Z]{2,3}\b(?!\s*\d)/ },
  { label: "un lieu (chambre, lit, adresse)", re: /\b(chambre|lit|rue|avenue|boulevard)\s+\d/i },
];

/** What in the text could identify a patient (empty: the text can be sent). */
export function privacyIssues(text: string): PrivacyIssue[] {
  const issues: PrivacyIssue[] = [];
  for (const { label, re } of CHECKS) {
    const m = text.match(re);
    if (m) issues.push({ label, excerpt: m[0] });
  }
  return issues;
}

/** « 58 ans » → « 50–59 ans » ; above 89, « ≥ 90 ans » (an exact old age can identify). */
export function generaliseAges(text: string): string {
  return text.replace(/\b(\d{1,3})[\s-]*(ans|years?[\s-]old|yo)\b/gi, (_, n: string, unit: string) => {
    const age = Number(n);
    if (age >= 90) return unit.toLowerCase().startsWith("an") ? "≥ 90 ans" : "≥ 90 years old";
    if (age < 18) return unit.toLowerCase().startsWith("an") ? "enfant ou adolescent" : "child or adolescent";
    const lo = Math.floor(age / 10) * 10;
    return unit.toLowerCase().startsWith("an") ? `${lo}–${lo + 9} ans` : `${lo}–${lo + 9} years old`;
  });
}

/** The text actually sent: ages generalised, extra spaces removed. */
export function outgoingText(text: string): string {
  return generaliseAges(text).replace(/[ \t]+/g, " ").trim();
}
