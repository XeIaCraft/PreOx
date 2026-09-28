// Pre-anaesthesia checklist of the machine and the room: what to check each
// day (or when the machine is moved or a vaporiser changed), then before
// each anaesthetic — ending with the WHO « time out » before induction.
// ASA « Recommendations for Pre-Anesthesia Checkout Procedures » (2008) ;
// WHO/HAS surgical safety checklist ; university hospital teaching (2026).
// Editable in Réglages › Plan et bloc.

export interface ChecklistItem {
  id: string;
  label: string;
}

export interface ChecklistLists {
  daily: ChecklistItem[];
  perCase: ChecklistItem[];
}

export const DEFAULT_CHECKLIST: ChecklistLists = {
  daily: [
    { id: "d-special", label: "Matériel spécial disponible : défibrillateur, chariot d'intubation difficile, vidéolaryngoscope, kits hyperthermie maligne et toxicité des anesthésiques locaux" },
    { id: "d-power", label: "Réseau électrique : station d'anesthésie alimentée (ventilateur, monitorage, pompes)" },
    { id: "d-gas", label: "Pressions des gaz muraux (O₂, air, N₂O) ≥ 50 psi" },
    { id: "d-selftest", label: "Auto-test de la station d'anesthésie réussi et validé (ventilateur, monitorage)" },
    { id: "d-backup", label: "Bouteille d'O₂ de réserve pleine et ballon autoremplisseur complet et fonctionnel" },
    { id: "d-scavenger", label: "Évacuation des gaz anesthésiques (« scavenger ») fonctionnelle" },
    { id: "d-analysers", label: "Analyseur d'O₂ calibré avec alarme de FiO₂ basse ; capnomètre et analyseur d'halogénés calibrés" },
    { id: "d-noted", label: "Vérifications notées dans le dossier d'anesthésie" },
  ],
  perCase: [
    { id: "c-basic", label: "Matériel de base : laryngoscope fonctionnel, sondes et canules adaptées, mandrins, pince de Magill, médicaments de base et d'urgence, matériel d'abord veineux" },
    { id: "c-suction", label: "Aspiration immédiatement disponible et fonctionnelle" },
    { id: "c-monitors", label: "Moniteurs branchés ; alarmes activées, limites réglées, volume audible" },
    { id: "c-vaporiser", label: "Évaporateur rempli, bouchon de remplissage fermé" },
    { id: "c-co2", label: "Chaux sodée (absorbeur de CO₂) non épuisée" },
    { id: "c-leak", label: "Test de pression et de fuite du circuit" },
    { id: "c-flow", label: "Circulation des gaz dans le circuit à l'inspiration et à l'expiration (valves, test au ballon)" },
    { id: "c-noted", label: "Vérifications notées dans le dossier" },
    { id: "c-timeout", label: "Réglages du ventilateur confirmés ; « time out » anesthésique avant l'induction (check-list OMS)" },
  ],
};

export const CHECKLIST_SOURCE = "ASA, Recommendations for Pre-Anesthesia Checkout Procedures (2008) ; check-list « Sécurité du patient au bloc opératoire » (OMS, HAS) ; enseignement universitaire.";
