// PLACEHOLDER DATA. This will be replaced by the D1 database and R2 photos.

const NAMES = ["Sergio", "Jadiel", "Dayanira", "Rainel", "Enma"];

// A repeating mix of landscape, portrait and square shapes so the grid looks realistic.
const SHAPES = [
  [3, 2], [2, 3], [4, 3], [1, 1], [3, 2], [16, 9],
  [2, 3], [3, 2], [4, 5], [3, 2], [3, 4], [3, 2],
];

const STATEMENT_EN =
  "This is placeholder text for the artist statement. The student will write a few sentences here about what they photographed during the workshop, what they were looking for, and what the pictures mean to them.";
const STATEMENT_ES =
  "Este es un texto provisional para la declaración del artista. El estudiante escribirá aquí unas frases sobre lo que fotografió durante el taller, lo que buscaba y lo que significan las fotos para él o ella.";
// (Placeholder statements above; students will write their own.)

export const students = NAMES.map((name, i) => {
  const slug = name.toLowerCase();
  const photos = SHAPES.map(([w, h], n) => ({
    id: `${slug}-${n + 1}`,
    title: "",
    caption: "",
    width: w * 600,
    height: h * 600,
    hue: (i * 67 + n * 23) % 360,
  }));
  return {
    slug,
    first_name: name,
    statement_en: STATEMENT_EN,
    statement_es: STATEMENT_ES,
    cover_photo_id: photos[0].id,
    photos,
  };
});

// Workshop description (Phillip's text). Will move to the database so it can be edited in the admin.
export const site = {
  eyebrow_en: "A Photography Workshop",
  eyebrow_es: "Un taller de fotografía",
  title_en: "Everyday Miracles",
  title_es: "Milagros cotidianos",
  meta_en: "Fountain of Life Art Week · October 2026",
  meta_es: "Semana del Arte de Manantial de Vida · Octubre de 2026",
  workshop_en: [
    "The photographs in this gallery were made by students at Fountain of Life High School during “Everyday Miracles,” a five-day photography workshop held as part of Fountain of Life Art Week. Students were invited to look closely at their daily lives and find the remarkable in the ordinary: the love of family, the beauty of the landscape, or a quiet moment.",
    "Students learned to use a professional digital camera, explored the basics of exposure and composition, and then went out to photograph what an everyday miracle meant to them. Back in the classroom, we reviewed their work together and talked about what makes a photograph strong. Each student chose six images for an exhibit at the school. This gallery shares a wider selection of the photographs they made during the week.",
    "Each student also wrote a short reflection on what the theme means to them and the story behind their photographs. You’ll find those reflections on each student’s page.",
    "The goal was not technical perfection, but to see with intention and share a personal point of view. We invite you to take your time, read the students’ words, and look at your own everyday world with fresh eyes.",
  ].join("\n\n"),
  workshop_es: [
    "Las fotografías de esta galería fueron hechas por estudiantes del Centro Educativo Manantial de Vida durante «Milagros cotidianos», un taller de fotografía de cinco días realizado como parte de la Semana del Arte de Manantial de Vida. Se invitó a los estudiantes a mirar de cerca su vida diaria y a encontrar lo extraordinario en lo ordinario: el amor de la familia, la belleza del paisaje o un momento de calma.",
    "Los estudiantes aprendieron a usar una cámara digital profesional, exploraron los fundamentos de la exposición y la composición, y luego salieron a fotografiar lo que para ellos significaba un milagro cotidiano. De regreso en el aula, revisamos juntos su trabajo y conversamos sobre lo que hace fuerte a una fotografía. Cada estudiante eligió seis imágenes para una exposición en la escuela. Esta galería comparte una selección más amplia de las fotografías que hicieron durante la semana.",
    "Cada estudiante también escribió una breve reflexión sobre lo que el tema significa para ellos y la historia detrás de sus fotografías. Encontrará esas reflexiones en la página de cada estudiante.",
    "El objetivo no era la perfección técnica, sino ver con intención y compartir un punto de vista personal. Le invitamos a tomarse su tiempo, leer las palabras de los estudiantes y mirar su propio mundo cotidiano con nuevos ojos.",
  ].join("\n\n"),
};

export function findPhoto(id) {
  for (const s of students) {
    const p = s.photos.find((p) => p.id === id);
    if (p) return { student: s, photo: p };
  }
  return null;
}
