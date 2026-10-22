// Questionnaire hebdomadaire (doc « Moodly – Questionnaire de moral au travail »), Q3 à Q12.
// Réponses de 1 (Pas du tout d'accord) à 5 (Tout à fait d'accord) ; Q6 est inversée au calcul.
import type { Point } from "./matrix";

export const STATEMENTS = [
  "Ma charge de travail était tenable.",                                // Q3  intensité et temps de travail
  "J'ai pu déconnecter en dehors de mes heures de travail.",            // Q4  intensité et temps de travail
  "J'ai pu organiser mon travail comme je le souhaitais.",              // Q5  autonomie
  "J'ai dû faire face à des situations tendues ou cacher mes émotions.", // Q6  exigences émotionnelles (inversée)
  "J'ai pu compter sur mes collègues.",                                 // Q7  rapports sociaux
  "Je me suis senti·e soutenu·e par mon manager.",                      // Q8  rapports sociaux
  "Mon travail a été reconnu à sa juste valeur.",                       // Q9  rapports sociaux
  "J'ai trouvé du sens à ce que j'ai fait.",                            // Q10 conflits de valeurs
  "Je me suis senti·e serein·e face à l'avenir de mon poste.",          // Q11 insécurité de la situation de travail
];
// Libellés courts (barre latérale du questionnaire), dans le même ordre.
export const SHORT = ["Charge de travail", "Déconnexion", "Organisation", "Situations tendues", "Collègues", "Soutien du manager", "Reconnaissance", "Sens", "Avenir du poste"];
export const AGREE = ["Pas du tout d'accord", "Plutôt pas d'accord", "Ni l'un ni l'autre", "Plutôt d'accord", "Tout à fait d'accord"];
export const TRENDS = [
  { value: -1, label: "Moins bonne" },
  { value: 0, label: "Pareille" },
  { value: 1, label: "Meilleure" },
];
export const USEFUL = ["Pas du tout", "Un peu", "Moyennement", "Plutôt", "Tout à fait"];

// 5 = toujours favorable (Q6 inversée).
const note = (answers: number[], i: number) => (i === 3 ? 6 - answers[i] : answers[i]);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

// Les 6 facteurs de risques psychosociaux (Gollac), mêmes regroupements que get_mirror.
export const FACTORS = [
  { key: "intensite", label: "Charge et temps de travail", q: [0, 1] },
  { key: "autonomie", label: "Autonomie", q: [2] },
  { key: "emotions", label: "Exigences émotionnelles", q: [3] },
  { key: "relations", label: "Relations et reconnaissance", q: [4, 5, 6] },
  { key: "sens", label: "Sens du travail", q: [7] },
  { key: "securite", label: "Sérénité sur l'avenir", q: [8] },
] as const;
export type FactorKey = (typeof FACTORS)[number]["key"];

export const factorsOf = (answers: number[]) =>
  FACTORS.map((f) => ({ ...f, value: mean(f.q.map((i) => note(answers, i))) }));

// Où les réponses situent la personne sur les 3 axes de la matrice.
// ponytail: regroupement simple et explicable (énergie : charge et déconnexion ; impact : autonomie,
// reconnaissance, sens ; plaisir : émotions, collègues, manager, avenir), à recaler sur données réelles.
export function fromAnswers(answers: number[]): Required<Point> {
  return {
    energy: mean([0, 1].map((i) => note(answers, i))),
    impact: mean([2, 6, 7].map((i) => note(answers, i))),
    pleasure: mean([3, 4, 5, 8].map((i) => note(answers, i))),
  };
}

// Phrase de comparaison ressenti / réponses, axe par axe (écart d'au moins 1 point).
const AXES = [
  { key: "pleasure", name: "de plaisir" },
  { key: "energy", name: "d'énergie" },
  { key: "impact", name: "d'impact" },
] as const;
export function compareText(self: Required<Point>, calc: Required<Point>) {
  const gaps = AXES.map((a) => ({ ...a, gap: self[a.key] - calc[a.key] })).filter((a) => Math.abs(a.gap) >= 1);
  if (!gaps.length) return "Ton ressenti et tes réponses concordent : tu te lis plutôt juste cette semaine.";
  return gaps
    .map((a) => (a.gap > 0
      ? `Tu t'attribues plus ${a.name} que ce que disent tes réponses.`
      : `Tes réponses montrent plus ${a.name} que tu ne le ressens.`))
    .join(" ");
}

// Aide affichée (doc) : abattement, plaisir à 1 ou 2, ou Q6 à 5.
export const needsHelp = (self: Required<Point>, answers?: number[]) =>
  (self.energy < 3 && self.pleasure < 3) || self.pleasure <= 2 || answers?.[3] === 5;
