/**
 * Guías de estudio en PDF, hechas con el contenido real del curso: enseñanza, pasaje,
 * preguntas y líneas para responder. Una por lección o el curso completo. Se generan en el
 * teléfono (sin servidor) y se guardan o comparten como cualquier archivo.
 */
import type { Course, Lesson } from "@/types";

const bookName = (id: string, names: Record<string, string>) => names[id] ?? id;

export async function studyGuide(course: Course, names: Record<string, string>, only?: Lesson): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 56;
  let y = M;

  const ensure = (h: number) => {
    if (y + h > H - M) {
      pdf.addPage();
      y = M;
    }
  };
  const text = (t: string, size: number, opts: { bold?: boolean; color?: number; gap?: number } = {}) => {
    pdf.setFont("helvetica", opts.bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(opts.color ?? 30);
    const lines = pdf.splitTextToSize(t, W - M * 2) as string[];
    for (const line of lines) {
      ensure(size * 1.4);
      pdf.text(line, M, y);
      y += size * 1.4;
    }
    y += opts.gap ?? 6;
  };
  const answerLines = (n: number) => {
    pdf.setDrawColor(200);
    for (let i = 0; i < n; i++) {
      ensure(22);
      y += 18;
      pdf.line(M, y, W - M, y);
    }
    y += 12;
  };

  const lessonPage = (l: Lesson, n: number) => {
    text(`Lección ${n}: ${l.title}`, 16, { bold: true, gap: 4 });
    if (l.passage) text(`Pasaje: ${bookName(l.passage.book, names)} ${l.passage.chapter} · Léelo en Heseria antes de empezar.`, 10, { color: 90, gap: 10 });
    for (const p of l.body ?? []) text(p, 11.5, { gap: 8 });
    if (l.questions?.length) {
      text("Para reflexionar y conversar", 12.5, { bold: true, gap: 4 });
      l.questions.forEach((q, i) => {
        text(`${i + 1}. ${q}`, 11);
        answerLines(3);
      });
    }
    text("Mi aplicación esta semana", 12.5, { bold: true, gap: 4 });
    answerLines(3);
  };

  const all = course.modules.flatMap((m) => m.lessons);
  text("HESERIA · Academia", 9, { color: 120, gap: 2 });
  text(course.title, 22, { bold: true, gap: 6 });
  if (only) {
    lessonPage(only, all.findIndex((l) => l.id === only.id) + 1);
  } else {
    text(course.description, 11.5, { gap: 8 });
    text(`Nivel ${course.level} · ${all.length} lecciones · ${course.durationHours} h aprox.`, 10, { color: 90, gap: 10 });
    if (course.requirements.length) text(`Necesitas: ${course.requirements.join(", ")}.`, 10.5, { gap: 12 });
    text("Contenido", 13, { bold: true, gap: 4 });
    for (const m of course.modules) {
      text(m.title, 11.5, { bold: true, gap: 2 });
      for (const l of m.lessons) text(`• ${l.title}${l.passage ? ` (${bookName(l.passage.book, names)} ${l.passage.chapter})` : ""}`, 10.5, { gap: 1 });
      y += 6;
    }
    all.forEach((l, i) => {
      pdf.addPage();
      y = M;
      lessonPage(l, i + 1);
    });
  }
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    pdf.setFontSize(8);
    pdf.setTextColor(140);
    pdf.text(`${course.title} · página ${p} de ${pages} · heseria.web.app`, M, H - 28);
  }
  return pdf.output("blob");
}
