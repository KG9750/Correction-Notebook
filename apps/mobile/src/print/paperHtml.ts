import type { GeneratedQuestion, TestPaper } from "@correction-notebook/shared";

export function buildStudentPaperHtml(paper: TestPaper, questions: GeneratedQuestion[]): string {
  return buildPaperHtml(`${paper.title} 学生卷`, questions, false);
}

export function buildAnswerPaperHtml(paper: TestPaper, questions: GeneratedQuestion[]): string {
  return buildPaperHtml(`${paper.title} 答案与解析`, questions, true);
}

function buildPaperHtml(title: string, questions: GeneratedQuestion[], includeAnswers: boolean): string {
  const body = questions
    .map((question, index) => {
      const answerBlock = includeAnswers
        ? `<p><strong>答案：</strong>${escapeHtml(question.answer)}</p><p><strong>解析：</strong>${question.solution_steps.map(escapeHtml).join("；")}</p><p><strong>对应原错因：</strong>${escapeHtml(question.target_error_type)}</p>`
        : `<div class="answer-space"></div>`;
      return `<section class="question"><h2>${index + 1}. ${escapeHtml(question.question_text)}</h2>${answerBlock}</section>`;
    })
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; color: #17202a; }
    header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #8d99a8; padding-bottom: 8px; margin-bottom: 18px; }
    h1 { font-size: 22px; margin: 0; }
    h2 { font-size: 15px; line-height: 1.5; margin: 0 0 12px; }
    p { font-size: 13px; line-height: 1.65; margin: 6px 0; }
    .meta { font-size: 12px; color: #647184; }
    .question { break-inside: avoid; page-break-inside: avoid; margin-bottom: 22px; }
    .answer-space { height: 104px; border: 1px dashed #9aa5b1; border-radius: 6px; }
  </style>
</head>
<body>
  <header><h1>${escapeHtml(title)}</h1><div class="meta">姓名：______ 日期：______ 用时：______</div></header>
  ${body}
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
