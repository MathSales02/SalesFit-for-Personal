import { describe, expect, it } from "vitest";
import { indexExercises, normalize, searchExercises, type SearchableExercise } from "@/lib/exercise-search";
import { canonicalVideoUrl, youtubeId } from "@/lib/exercise-video";
import { createExerciseSchema } from "@/lib/validation/exercises";

const ex = (name: string, muscleGroup: SearchableExercise["muscleGroup"], equipment: string | null = null, secondaryMuscles: SearchableExercise["secondaryMuscles"] = []): SearchableExercise => ({
  name,
  muscleGroup,
  secondaryMuscles,
  equipment,
  difficulty: "beginner",
});

const library = indexExercises([
  ex("Supino reto com barra", "chest", "Barra e banco", ["triceps", "shoulders"]),
  ex("Supino inclinado com halteres", "chest", "Halteres e banco inclinado"),
  ex("Crucifixo com halteres", "chest", "Halteres e banco"),
  ex("Peck deck", "chest", "Máquina peck deck"),
  ex("Puxada frontal", "back", "Polia alta", ["biceps"]),
  ex("Remada curvada com barra", "back", "Barra"),
  ex("Elevação lateral", "shoulders", "Halteres"),
  ex("Tríceps na polia", "triceps", "Polia alta"),
  ex("Mergulho no banco", "triceps", "Banco", ["chest"]),
  ex("Prancha frontal", "core", "Peso corporal"),
  ex("Agachamento livre", "quadriceps", "Barra", ["glutes"]),
]);
const names = (q: string) => searchExercises(library, q).map((e) => e.name);

describe("exercise search", () => {
  it("ignores case and accents", () => {
    expect(normalize("Abdômen  E Core")).toBe("abdomen e core");
    expect(names("TRICEPS")).toContain("Tríceps na polia");
    expect(names("elevacao")).toEqual(["Elevação lateral"]);
  });

  it("finds every exercise of a muscle group by its name, main group first", () => {
    const chest = names("Peito");
    expect(chest.slice(0, 4).sort()).toEqual(["Crucifixo com halteres", "Peck deck", "Supino inclinado com halteres", "Supino reto com barra"]);
    // Exercises that only assist the group come after the ones that target it.
    expect(chest[4]).toBe("Mergulho no banco");
    expect(chest).not.toContain("Puxada frontal");
    expect(names("costas")).toEqual(["Puxada frontal", "Remada curvada com barra"]);
  });

  it("understands everyday synonyms and singular or plural", () => {
    expect(names("peitoral")).toContain("Peck deck");
    expect(names("dorsal")).toEqual(["Puxada frontal", "Remada curvada com barra"]);
    expect(names("deltoide")[0]).toBe("Elevação lateral");
    expect(names("ombro")[0]).toBe("Elevação lateral");
    expect(names("abdomen")).toEqual(["Prancha frontal"]);
  });

  it("finds muscle groups by their English and Spanish names too", () => {
    expect(names("chest").slice(0, 4).sort()).toEqual(["Crucifixo com halteres", "Peck deck", "Supino inclinado com halteres", "Supino reto com barra"]);
    expect(names("espalda")).toEqual(["Puxada frontal", "Remada curvada com barra"]);
    expect(names("shoulders")[0]).toBe("Elevação lateral");
    expect(names("abs")).toEqual(["Prancha frontal"]);
  });

  it("matches while typing, by equipment, and needs every word to match", () => {
    expect(names("sup")).toEqual(["Supino inclinado com halteres", "Supino reto com barra"]);
    expect(names("polia")).toEqual(["Tríceps na polia", "Puxada frontal"]);
    expect(names("supino halteres")).toEqual(["Supino inclinado com halteres"]);
    expect(names("costas barra")).toEqual(["Remada curvada com barra"]);
    expect(names("xyz")).toEqual([]);
    expect(names("   ")).toHaveLength(11);
  });
});

describe("demonstration video links", () => {
  it("accepts the usual YouTube link shapes and stores one canonical form", () => {
    for (const url of ["https://www.youtube.com/watch?v=abcdefghijk&t=10s", "https://youtu.be/abcdefghijk", "https://m.youtube.com/shorts/abcdefghijk", "https://www.youtube.com/embed/abcdefghijk"]) {
      expect(canonicalVideoUrl(url)).toBe("https://www.youtube.com/watch?v=abcdefghijk");
    }
  });

  it("rejects anything else", () => {
    for (const url of ["https://example.com/watch?v=abcdefghijk", "javascript:alert(1)", "https://youtube.com.evil.com/watch?v=abcdefghijk", "https://www.youtube.com/watch?v=short", "not a link"]) {
      expect(youtubeId(url)).toBeNull();
    }
    const parsed = createExerciseSchema.safeParse({ name: "Teste", muscleGroup: "chest", equipment: "", description: "", instructions: "", videoUrl: "https://vimeo.com/123" });
    expect(parsed.success).toBe(false);
  });

  it("the form's optional fields default to empty", () => {
    const parsed = createExerciseSchema.parse({ name: "Teste", muscleGroup: "chest", equipment: "", description: "", instructions: "", secondaryMuscles: "triceps, shoulders,triceps" });
    expect(parsed).toMatchObject({ secondaryMuscles: ["triceps", "shoulders"], difficulty: null, videoUrl: null, tips: null, commonMistakes: null });
  });
});
