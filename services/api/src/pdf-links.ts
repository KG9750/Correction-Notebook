import type { GeneratedQuestion, TestPaper } from "@correction-notebook/shared";

export function createVirtualPdfUrl(paperId: string, variant: "student" | "answer"): string {
  return `local://test-papers/${paperId}/${variant}.pdf`;
}

export function renderStudentPaperHtml(paper: TestPaper, questions: GeneratedQuestion[]): string {
  const rows = questions
    .map(
      (question, index) => `
        <section class="question">
          <h2>${index + 1}. ${escapeHtml(question.question_text)}</h2>
          <div class="answer-space"></div>
        </section>`
    )
    .join("");

  return renderPaperShell(`${paper.title} 学生卷`, rows);
}

export function renderAnswerPaperHtml(paper: TestPaper, questions: GeneratedQuestion[]): string {
  const rows = questions
    .map(
      (question, index) => `
        <section class="question">
          <h2>${index + 1}. ${escapeHtml(question.question_text)}</h2>
          <p><strong>答案：</strong>${escapeHtml(question.answer)}</p>
          <p><strong>解析：</strong>${question.solution_steps.map(escapeHtml).join("；")}</p>
          <p><strong>对应原错因：</strong>${escapeHtml(question.target_error_type)}</p>
        </section>`
    )
    .join("");

  return renderPaperShell(`${paper.title} 答案与解析`, rows);
}

function renderPaperShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; color: #1c2430; }
    header { display: flex; justify-content: space-between; border-bottom: 1px solid #9aa5b1; padding-bottom: 8px; margin-bottom: 18px; }
    h1 { font-size: 22px; margin: 0; }
    h2 { font-size: 15px; line-height: 1.5; margin: 0 0 12px; }
    .meta { font-size: 12px; color: #5f6b7a; }
    .question { break-inside: avoid; page-break-inside: avoid; margin: 0 0 22px; }
    .answer-space { height: 96px; border: 1px dashed #9aa5b1; border-radius: 6px; }
    p { font-size: 13px; line-height: 1.6; margin: 6px 0; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">姓名：______ 日期：______ 用时：______</div>
  </header>
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
