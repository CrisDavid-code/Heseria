/**
 * Actividades familiares por edad. Cada una parte de un pasaje real de la Biblia (se abre en la
 * app) y propone algo sencillo para hacer juntos; los textos son propios de Heseria.
 */
import type { AgeGroup } from "@/services";

export interface FamilyActivity { id: string; title: string; book: string; chapter: number; ref: string; todo: string }

export const FAMILY_ACTIVITIES: Record<AgeGroup, FamilyActivity[]> = {
  "3-5": [
    { id: "p-creacion", title: "Dios hizo todo", book: "genesis", chapter: 1, ref: "Génesis 1", todo: "Lean juntos la creación y salgan a buscar tres cosas que Dios hizo. Den gracias por cada una." },
    { id: "p-noe", title: "El arca de Noé", book: "genesis", chapter: 7, ref: "Génesis 7", todo: "Cuenten la historia con juguetes de animales, de dos en dos. Dios cuida de nosotros." },
    { id: "p-pastor", title: "Jesús, mi pastor", book: "salmos", chapter: 23, ref: "Salmo 23", todo: "Aprendan juntos «Jehová es mi pastor; nada me faltará». Dibujen una oveja." },
    { id: "p-ninos", title: "Jesús ama a los niños", book: "marcos", chapter: 10, ref: "Marcos 10:13-16", todo: "Lean cómo Jesús abrazó a los niños. Denle un abrazo y díganle que Jesús lo ama." },
  ],
  "6-8": [
    { id: "m-david", title: "David y Goliat", book: "1-samuel", chapter: 17, ref: "1 Samuel 17", todo: "Lean la historia. Conversen: ¿qué cosa grande te da miedo? Oren juntos confiando en Dios." },
    { id: "m-daniel", title: "Daniel ora siempre", book: "daniel", chapter: 6, ref: "Daniel 6", todo: "Elijan juntos una hora del día para orar esta semana, como Daniel." },
    { id: "m-samaritano", title: "El buen samaritano", book: "lucas", chapter: 10, ref: "Lucas 10:25-37", todo: "Piensen en alguien a quien ayudar hoy y háganlo juntos." },
    { id: "m-panes", title: "Cinco panes y dos peces", book: "juan", chapter: 6, ref: "Juan 6:1-14", todo: "Compartan algo suyo (un juguete, una merienda) con alguien. Dios multiplica lo que damos." },
  ],
  "9-12": [
    { id: "g-jose", title: "José perdona", book: "genesis", chapter: 45, ref: "Génesis 45", todo: "Lean cómo José perdonó a sus hermanos. ¿A quién necesitas perdonar? Escríbelo y oren." },
    { id: "g-ester", title: "Valiente como Ester", book: "ester", chapter: 4, ref: "Ester 4", todo: "Conversen sobre una situación en la escuela donde haga falta valentía para hacer lo correcto." },
    { id: "g-fruto", title: "El fruto del Espíritu", book: "galatas", chapter: 5, ref: "Gálatas 5:22-23", todo: "Memoricen la lista y escojan uno para practicar esta semana. Al final, cuenten cómo les fue." },
    { id: "g-armadura", title: "La armadura de Dios", book: "efesios", chapter: 6, ref: "Efesios 6:10-18", todo: "Dibujen la armadura y escriban qué significa cada pieza en su vida diaria." },
  ],
};
