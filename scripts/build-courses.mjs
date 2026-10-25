/**
 * HESERIA — Cursos de la Academia.
 *
 *   node scripts/build-courses.mjs
 *
 * Contenido original del Equipo Heseria, construido sobre la Biblia: cada
 * lección indica un pasaje (que la app muestra de la RV1909 incluida), una
 * enseñanza breve y preguntas de estudio. Nada de instructores inventados.
 */
import fs from "node:fs";

const books = JSON.parse(fs.readFileSync("public/biblia/books.json", "utf8"));
const exists = (book, chapter) => {
  const b = books.find((x) => x.id === book);
  if (!b || chapter > b.chapters) throw new Error(`No existe ${book} ${chapter}`);
};

function lesson(courseId, n, title, [book, chapter], body, questions, durationMin = 15) {
  exists(book, chapter);
  return {
    id: `${courseId}-l${n}`,
    title,
    durationMin,
    type: "reading",
    completed: false,
    passage: { book, chapter },
    body,
    questions,
  };
}

/* ------------------------------------------------- Fundamentos de la fe */

const F = "fundamentos";
const fundamentos = {
  id: F,
  title: "Fundamentos de la fe cristiana",
  category: "Discipulado",
  level: "Inicial",
  modality: "Online",
  description:
    "Ocho lecciones para conocer lo esencial de la fe: quién es Dios, quién es Jesús, qué es la salvación y cómo se vive en comunidad. Ideal para quienes empiezan o quieren repasar las bases.",
  requirements: ["Ganas de aprender", "Una libreta para tus respuestas"],
  durationHours: 2,
  certificate: true,
  color: "from-cyan-500/70 to-blue-700/70",
  modules: [
    {
      id: `${F}-m1`,
      title: "Dios y su Palabra",
      lessons: [
        lesson(F, 1, "Dios creador", ["genesis", 1],
          ["La Biblia empieza presentando a Dios como creador de todo. No es una fuerza impersonal: habla, crea con orden y llama bueno a lo que hace.",
           "El punto más alto de la creación es el ser humano, hecho a imagen de Dios. Eso da dignidad a cada persona, sin importar su origen o condición."],
          ["¿Qué dice Génesis 1 sobre el carácter de Dios?", "¿Qué significa para ti haber sido creado a imagen de Dios?", "¿Cómo cambia esto la forma en que tratas a otros?"]),
        lesson(F, 2, "La Biblia, Palabra de Dios", ["salmos", 19],
          ["Dios se da a conocer en la creación y, de forma más clara, en su Palabra. El salmo 19 celebra ambas.",
           "La Biblia no es solo un libro antiguo: es la manera en que Dios sigue hablando. Por eso se lee con humildad y con disposición a obedecer."],
          ["Según el salmo 19, ¿qué produce la Palabra de Dios en quien la recibe?", "¿Qué hábito concreto puedes empezar para leer la Biblia cada día?"]),
      ],
    },
    {
      id: `${F}-m2`,
      title: "Jesucristo",
      lessons: [
        lesson(F, 3, "El Verbo se hizo carne", ["juan", 1],
          ["Juan presenta a Jesús como el Verbo eterno que estaba con Dios y era Dios, y que se hizo hombre para habitar entre nosotros.",
           "En Jesús, Dios se acercó. Quien quiere conocer cómo es Dios, mira a Jesús."],
          ["¿Qué títulos recibe Jesús en Juan 1?", "¿Qué significa que «a todos los que le recibieron» les dio potestad de ser hechos hijos de Dios?"]),
        lesson(F, 4, "La cruz y la resurrección", ["1-corintios", 15],
          ["Pablo resume el evangelio: Cristo murió por nuestros pecados, fue sepultado y resucitó al tercer día, conforme a las Escrituras.",
           "Sin resurrección la fe sería vana. Con ella, la muerte ya no tiene la última palabra."],
          ["¿Cuáles son los hechos centrales del evangelio según 1 Corintios 15:3-4?", "¿Qué esperanza nos da la resurrección de Jesús?"]),
      ],
    },
    {
      id: `${F}-m3`,
      title: "La nueva vida",
      lessons: [
        lesson(F, 5, "Salvos por gracia", ["efesios", 2],
          ["Estábamos muertos en nuestros pecados y Dios, por su gran amor, nos dio vida juntamente con Cristo. La salvación es un regalo, no un premio.",
           "Las buenas obras no son el camino para ser salvos, sino el camino que Dios preparó para quienes ya lo son."],
          ["¿Cómo describe Efesios 2 nuestra condición sin Cristo?", "¿Qué papel tienen las buenas obras en la vida cristiana?"]),
        lesson(F, 6, "El Espíritu Santo", ["romanos", 8],
          ["Quien está en Cristo tiene al Espíritu Santo. Él nos da vida, nos guía, nos ayuda a orar y nos asegura que somos hijos de Dios.",
           "Romanos 8 empieza con «ninguna condenación» y termina con «nada nos podrá separar del amor de Dios»."],
          ["¿Qué hace el Espíritu Santo según Romanos 8?", "¿Qué te consuela más de este capítulo?"]),
      ],
    },
    {
      id: `${F}-m4`,
      title: "Vivir en comunidad",
      lessons: [
        lesson(F, 7, "La iglesia", ["hechos", 2],
          ["La primera iglesia perseveraba en la enseñanza de los apóstoles, en la comunión, en el partimiento del pan y en las oraciones.",
           "La fe no se vive sola. Dios nos une a otros creyentes para crecer, servir y alcanzar a quienes aún no le conocen."],
          ["¿Qué cuatro prácticas marcaban a la iglesia en Hechos 2:42?", "¿En cuál de ellas necesitas crecer?"]),
        lesson(F, 8, "Amar y servir", ["juan", 13],
          ["Jesús lavó los pies de sus discípulos y les dio un mandamiento nuevo: amarse como él los amó.",
           "El servicio no es un extra de la vida cristiana: es la forma en que el amor se vuelve visible."],
          ["¿Qué enseña Jesús al lavar los pies de sus discípulos?", "¿A quién puedes servir esta semana de forma concreta?"]),
      ],
    },
  ],
};

/* ------------------------------------------------- El Evangelio de Juan */

const J = "evangelio-de-juan";
const JUAN = [
  "El Verbo hecho carne", "Agua en vino", "Nacer de nuevo", "La mujer samaritana",
  "El paralítico de Betesda", "El pan de vida", "Ríos de agua viva", "La luz del mundo",
  "El ciego de nacimiento", "El buen pastor", "La resurrección de Lázaro", "La entrada a Jerusalén",
  "El lavamiento de pies", "El camino, la verdad y la vida", "La vid verdadera", "El Consolador",
  "La oración de Jesús", "El arresto y el juicio", "La cruz", "La tumba vacía", "Apacienta mis ovejas",
];
const juan = {
  id: J,
  title: "El Evangelio de Juan en 21 lecciones",
  category: "Biblia",
  level: "Inicial",
  modality: "Online",
  description:
    "Un capítulo por lección para conocer a Jesús a través del evangelio que se escribió «para que creáis que Jesús es el Cristo, el Hijo de Dios».",
  requirements: ["Ninguno"],
  durationHours: 6,
  certificate: true,
  color: "from-amber-400/70 to-orange-700/70",
  modules: [
    { id: `${J}-m1`, title: "Señales (capítulos 1–12)", range: [1, 12] },
    { id: `${J}-m2`, title: "La hora de Jesús (capítulos 13–21)", range: [13, 21] },
  ].map((m) => ({
    id: m.id,
    title: m.title,
    lessons: Array.from({ length: m.range[1] - m.range[0] + 1 }, (_, i) => {
      const ch = m.range[0] + i;
      return lesson(J, ch, `Juan ${ch}: ${JUAN[ch - 1]}`, ["juan", ch],
        [`Lee Juan ${ch} completo, sin prisa. Fíjate en lo que Jesús dice de sí mismo y en cómo responden las personas que lo rodean.`],
        [`¿Qué revela Juan ${ch} sobre quién es Jesús?`, "¿Cómo responden las personas a Jesús en este capítulo?", "¿Qué respuesta te pide a ti?"],
        12);
    }),
  })),
};

/* -------------------------------------------------------- Aprender a orar */

const O = "aprender-a-orar";
const orar = {
  id: O,
  title: "Aprender a orar",
  category: "Vida espiritual",
  level: "Inicial",
  modality: "Online",
  description:
    "Seis lecciones con las oraciones de la Biblia para pasar de no saber qué decir a hablar con Dios con confianza.",
  requirements: ["Un momento tranquilo cada día"],
  durationHours: 1.5,
  certificate: false,
  color: "from-emerald-400/70 to-teal-800/70",
  modules: [
    {
      id: `${O}-m1`,
      title: "Orar como Jesús enseñó",
      lessons: [
        lesson(O, 1, "El Padre nuestro", ["mateo", 6],
          ["Jesús no dio una fórmula para repetir, sino un modelo: empezar por Dios (su nombre, su reino, su voluntad) y luego presentar nuestras necesidades.",
           "La oración comienza llamando a Dios «Padre»: hablamos con alguien que nos ama."],
          ["¿Qué partes tiene el Padre nuestro?", "Escribe una oración propia siguiendo ese mismo orden."]),
        lesson(O, 2, "Orar con fe y perseverancia", ["lucas", 18],
          ["Jesús contó la parábola de la viuda insistente para enseñar que hay que orar siempre y no desmayar.",
           "Perseverar en oración no es convencer a Dios, es mantener la confianza mientras esperamos."],
          ["¿Qué enseña la parábola de la viuda sobre la oración?", "¿Por qué cosa has dejado de orar y quieres retomar?"]),
      ],
    },
    {
      id: `${O}-m2`,
      title: "Las oraciones de la Biblia",
      lessons: [
        lesson(O, 3, "Una oración de arrepentimiento", ["salmos", 51],
          ["David escribió este salmo después de su pecado con Betsabé. No se justifica: confiesa y pide un corazón limpio.",
           "Dios no desprecia al corazón contrito. El arrepentimiento sincero siempre encuentra misericordia."],
          ["¿Qué pide David a Dios en el salmo 51?", "¿Hay algo que necesitas confesar hoy?"]),
        lesson(O, 4, "Orar en la angustia", ["lucas", 22],
          ["En Getsemaní, Jesús oró con angustia y aun así se sometió: «no se haga mi voluntad, sino la tuya».",
           "Podemos llevar a Dios nuestro dolor tal como es, y a la vez confiar en su voluntad."],
          ["¿Cómo oró Jesús en el monte de los Olivos?", "¿Qué te enseña su oración para tus momentos difíciles?"]),
        lesson(O, 5, "Orar en lugar de afanarse", ["filipenses", 4],
          ["Pablo cambia la ansiedad por oración y gratitud, y promete que la paz de Dios guardará el corazón.",
           "Dar gracias mientras pedimos nos recuerda lo que Dios ya hizo."],
          ["¿Qué receta da Filipenses 4:6-7 para la ansiedad?", "Haz una lista de cinco cosas por las que dar gracias hoy."]),
        lesson(O, 6, "Orar unos por otros", ["santiago", 5],
          ["Santiago anima a orar unos por otros, a confesarnos y a confiar en que la oración del justo puede mucho.",
           "La oración también es comunitaria: cargamos juntos las necesidades de los hermanos."],
          ["¿Qué situaciones menciona Santiago 5 para orar?", "¿Por quién vas a orar esta semana? Escríbelo en Peticiones."]),
      ],
    },
  ],
};

const courses = [fundamentos, juan, orar].map((c) => ({
  ...c,
  instructorId: "heseria",
  instructor: "Equipo Heseria",
  students: 0,
  rating: 0,
}));

fs.writeFileSync("src/content/courses.json", JSON.stringify(courses));
for (const c of courses) {
  const n = c.modules.reduce((t, m) => t + m.lessons.length, 0);
  console.log(`${c.title}: ${c.modules.length} módulos, ${n} lecciones`);
}
