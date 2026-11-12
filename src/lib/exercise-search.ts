import { DIFFICULTY_LABEL, MUSCLE_GROUP_LABEL, type Difficulty, type MuscleGroup } from "./validation/exercises";

/** Lower case, no accents, single spaces: "Abdômen  E Core" -> "abdomen e core". */
export function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Words people use for each group, besides its label, in Portuguese, English and Spanish (already normalized). */
const GROUP_TERMS: Record<MuscleGroup, string[]> = {
  chest: ["peito", "peitoral", "peitorais", "chest", "pecs", "pecho", "pectorales"],
  back: ["costas", "dorsal", "dorsais", "lats", "latissimo", "back", "espalda", "dorsales"],
  shoulders: ["ombro", "ombros", "deltoide", "deltoides", "shoulder", "shoulders", "delts", "hombro", "hombros"],
  biceps: ["biceps", "braco", "bracos", "arm", "arms", "brazo", "brazos"],
  triceps: ["triceps", "braco", "bracos", "arm", "arms", "brazo", "brazos"],
  forearms: ["antebraco", "antebracos", "punho", "pegada", "forearm", "forearms", "grip", "wrist", "antebrazo", "antebrazos", "muneca", "agarre"],
  core: ["abdomen", "abdominal", "abdominais", "abs", "core", "barriga", "obliquos", "abdominals", "belly", "obliques", "abdominales", "oblicuos"],
  quadriceps: ["quadriceps", "coxa", "coxas", "perna", "pernas", "quads", "thigh", "thighs", "leg", "legs", "cuadriceps", "muslo", "muslos", "pierna", "piernas"],
  hamstrings: ["posterior", "posteriores", "isquiotibiais", "coxa", "perna", "pernas", "hamstring", "hamstrings", "leg", "legs", "isquiotibiales", "femoral", "pierna", "piernas"],
  glutes: ["gluteo", "gluteos", "bumbum", "quadril", "glute", "glutes", "butt", "hip", "hips", "cadera"],
  calves: ["panturrilha", "panturrilhas", "batata da perna", "perna", "pernas", "calf", "calves", "leg", "legs", "pantorrilla", "pantorrillas", "gemelos", "pierna", "piernas"],
  full_body: ["full body", "corpo inteiro", "corpo todo", "funcional", "whole body", "functional", "cuerpo completo"],
  cardio: ["cardio", "aerobico", "aerobio", "aerobic"],
  mobility: ["mobilidade", "alongamento", "mobility", "stretch", "stretching", "movilidad", "estiramiento"],
};

export type SearchableExercise = {
  name: string;
  muscleGroup: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  equipment: string | null;
  difficulty: Difficulty | null;
};

type Indexed<T> = { item: T; name: string; nameWords: string[]; primary: string; secondary: string; other: string };

const groupText = (g: MuscleGroup) => `${normalize(MUSCLE_GROUP_LABEL[g])} ${GROUP_TERMS[g].join(" ")}`;

/** Prepares a list once, so each keystroke only compares strings. */
export function indexExercises<T extends SearchableExercise>(items: T[]): Indexed<T>[] {
  return items.map((item) => {
    const name = normalize(item.name);
    return {
      item,
      name,
      nameWords: name.split(" "),
      primary: groupText(item.muscleGroup),
      secondary: item.secondaryMuscles.map(groupText).join(" "),
      other: normalize(`${item.equipment ?? ""} ${item.difficulty ? DIFFICULTY_LABEL[item.difficulty] : ""}`),
    };
  });
}

/** A word of the text starts with the token ("ombro" finds "ombros", "sup" finds "supino"). */
const hasWord = (text: string, token: string) => text.startsWith(token) || text.includes(` ${token}`);

function scoreToken<T>(e: Indexed<T>, token: string): number {
  if (e.nameWords[0]!.startsWith(token)) return 100;
  if (e.nameWords.some((w) => w.startsWith(token))) return 80;
  if (token.length >= 3 && e.name.includes(token)) return 60;
  if (hasWord(e.primary, token)) return 50;
  if (hasWord(e.other, token)) return 30;
  if (hasWord(e.secondary, token)) return 15;
  return 0;
}

/**
 * Matches by name, muscle group (with everyday synonyms), equipment and level. Every word typed
 * must match something; exercises whose name or main group match come first.
 */
export function searchExercises<T>(index: Indexed<T>[], query: string): T[] {
  const tokens = normalize(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return index.map((e) => e.item);
  const hits: { item: T; score: number; name: string }[] = [];
  for (const e of index) {
    let total = 0;
    for (const t of tokens) {
      const s = scoreToken(e, t);
      if (s === 0) {
        total = 0;
        break;
      }
      total += s;
    }
    if (total > 0) hits.push({ item: e.item, score: total, name: e.name });
  }
  return hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).map((h) => h.item);
}
