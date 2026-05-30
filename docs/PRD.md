# Correction Notebook PRD

## Product Boundary

Correction Notebook is an iPad-first, local-first math mistake review product. The current product version is an MVP in which the mobile app owns the learning session and local notebook state, while the backend provides OCR and AI enrichment without becoming the durable source of truth.

The first release targets iPad. Web is used for development, demos, and lightweight verification, but the PRD does not promise a full production Web experience. iPhone and Android are outside first-release acceptance.

The MVP includes:

- Capturing or importing a math mistake image.
- Cropping the mistake area.
- Running OCR through the backend first, then local fallback paths.
- Letting the user review and edit the recognized question text and original student answer.
- Creating a mistake in the active correction notebook.
- Producing error analysis and related generated questions through backend AI.
- Recording practice attempts.
- Updating mastery status and review timing.
- Moving confirmed mastered mistakes into the archived collection.
- Producing a weekly report and printable test paper materials.

The MVP does not include:

- User accounts.
- Multi-device sync.
- Teacher or parent dashboards.
- Full production Web, iPhone, or Android support.
- Server-side durable notebook storage.
- Payment, subscription, classroom, or school administration workflows.
- Production-grade audit history or compliance controls.

## Target Users

The primary operator is a self-motivated middle-school or high-school student with enough self-study ability to capture mistakes, review OCR text, read error analysis, complete generated practice, and decide whether a mistake has been mastered.

Parents or study companions are secondary helpers. They may help with setup, OCR correction, review reminders, or printing test papers, but the MVP should not depend on a parent-driven workflow.

The MVP should accept middle-school and high-school math mistakes, but first-release quality acceptance should focus on middle-school through common Grade 10 problem types. Full high-school coverage, especially complex algebra, geometry, functions, probability, and proof-heavy problems, is a later quality expansion.

## Problem

Self-motivated middle-school and high-school students often know that they should review mistakes, but their mistake review process is fragmented. Paper mistakes are hard to preserve, OCR and copying are error-prone, explanations are often too generic to change future behavior, and students may mark a mistake as learned before they can solve a related problem independently.

The product exists to turn each math mistake into a durable learning loop. A student should be able to capture the mistake, understand the specific error, practice related questions, receive DeepSeek V4 grading, revisit due mistakes, and generate focused retest papers from their own weak knowledge-point distribution.

## Goals

- Help self-motivated students turn each math mistake into an explicit learning loop: capture, understand, practice, judge, review, and retest.
- Make the reason for each mistake concrete enough that the student can change future problem-solving behavior, not only copy the correct answer.
- Provide generated practice that tests whether the same knowledge point or error pattern has been corrected.
- Support student autonomy while reducing premature self-confirmation of mastery.

## Product Principles

- **Student-led**: The student should be able to operate the full loop independently after initial setup.
- **Correction before collection**: A mistake belongs in the active correction notebook until the student has practiced and reviewed it.
- **Mastery needs evidence**: The student may confirm mastery, but the product should first show recent generated-question results, error analysis, and review advice. The MVP should not encourage archiving without practice evidence.
- **Editable AI assistance**: OCR and AI output must be reviewable by the student because math recognition and analysis can be wrong.

## Non-Goals

- Automatically segmenting a full exam paper into multiple mistakes.
- Batch importing many mistakes at once.
- Supporting non-math subjects in the MVP.
- Building a general question bank unrelated to captured mistakes.
- Replacing the student's own review judgment with fully automatic AI mastery decisions.
- Counting casual manual grading as official mastery evidence.

## Core Workflow

1. Student captures or imports a mistake image.
2. Student crops the image to the relevant mistake area.
3. OCR fills the question text; the student reviews and edits it.
4. Student enters or corrects the original answer.
5. The mistake enters the active correction notebook.
6. Backend AI produces error analysis and generated questions.
7. Student reads the analysis and completes generated questions.
8. Practice attempts update mastery status and review timing.
9. DeepSeek V4 grades practice attempts; ungraded attempts do not update mastery.
10. Student confirms mastery only after reviewing practice evidence.
11. Confirmed mastered mistakes move to the archived collection.
12. Student uses reports and test papers to plan review.

## Functional Requirements

### Capture

- The student can capture a single math mistake using the camera.
- The student can import a single math mistake image from the photo library.
- The student can crop the image to the relevant mistake area.
- The product should treat each saved capture as one mistake.
- The product should allow both middle-school and high-school math inputs, while first-release quality acceptance focuses on middle-school through common Grade 10 problem types.

### OCR Review

- The product runs OCR after image capture or crop.
- The student can edit the recognized question text before saving or reviewing.
- The student can enter or correct the original student answer.
- Low-confidence or fallback OCR should be presented as requiring student review.

### Correction Notebook

- The active correction notebook shows mistakes that are not confirmed mastered.
- The product keeps both `错题本` and `错题集` as separate navigation concepts.
- `错题本` means the active correction notebook: mistakes still needing analysis, practice, review, or mastery confirmation.
- `错题集` means the archived collection: mistakes explicitly confirmed as mastered and moved out of active review.
- `错题集` is not a deletion area or permanent completion state. The student should be able to review archived mistakes, retest them, and move them back to `错题本` if a retest shows the mistake has relapsed.
- The student can select a mistake, edit its question text, answer, knowledge points, and error tags.
- The student can delete a mistake and its related generated content.

### Error Analysis

- The product should explain the main error type, supporting error tags, wrong step, correct solution steps, and an avoidance tip.
- The product should make AI output reviewable rather than treating it as unquestionable truth.
- Error analysis should be written for the student, not as a parent or teacher diagnostic report.
- Error analysis should help the student act on the next problem: identify the wrong step, explain the correction, and name the concrete habit or check to use next time.
- Error analysis should avoid vague encouragement, generic teacher comments, and overdiagnosis that does not translate into a next action.
- Main error type should use a fixed product taxonomy so reports and review planning stay consistent.
- Secondary error tags may be more specific, but they should be normalized and limited so the student's review language does not fragment.
- Knowledge points may be suggested by AI and edited by the student in the MVP.
- The MVP does not require a complete textbook chapter taxonomy, but knowledge points should be normalized enough to support useful reports and review planning.
- A standard curriculum or textbook knowledge map is a later enhancement.

### Generated Questions

- The product should generate 3 or 5 generated questions related to the captured mistake.
- Generated questions should target the same knowledge point or error pattern, while changing numbers, conditions, wording, or traps.
- Failed or unusable generated questions should not be shown as valid practice.
- The MVP must filter obviously unusable generated questions before showing them.
- The production target requires generated questions to pass an independent verification step before they can be used for practice or test papers.

### Practice And Mastery

- The student can answer generated questions.
- DeepSeek V4 should judge whether each practice attempt is correct and provide feedback.
- The student should be able to review an AI grading result and request correction or regrading when it is clearly wrong.
- If DeepSeek V4 grading is unavailable, the product should show that the attempt is temporarily ungraded, allow the student to study the standard answer and solution, and support retrying grading later.
- Ungraded attempts should not update mastery status.
- Human review mode is not a default MVP grading source and should not update mastery unless a later explicit review workflow is added.
- Practice results update the mistake's mastery status and review due date.
- The product should require practice evidence before encouraging the student to confirm mastery.
- Confirmed mastered mistakes move from the active correction notebook to the archived collection.
- A mastered mistake that fails later retesting should return from `错题集` to `错题本`.

### Mastery State Machine

The first release promises these stored mastery states:

- `pending_analysis`: the mistake has been captured and is waiting for DeepSeek V4 error analysis.
- `pending_practice`: the mistake has error analysis and is waiting for generated questions or practice.
- `practicing`: the student is working through generated questions or has ungraded practice in progress.
- `not_mastered`: recent graded practice shows the mistake is not yet corrected.
- `partially_mastered`: recent graded practice shows partial correction and requires follow-up review.
- `mastered`: the student has enough practice evidence and has confirmed mastery.
- `relapsed`: a previously mastered mistake failed later retesting and should return to `错题本`.

`review_due` should be treated as a view derived from `review_due_at`, not as a required stored state for the first release. `analyzed` and `consolidated` are not first-release commitments.

### Review Planning

- Review due date is a first-class part of the MVP.
- Each not-mastered or partially mastered mistake should have a review due date.
- The home screen should make today's due review work visible and actionable.
- Review priority should consider mastery status, whether the mistake is due, repeated error hints, and age.
- Mastered mistakes may have later follow-up review dates, but they should not outrank active not-mastered or partially mastered mistakes.

### Reports And Test Papers

- Reports are for student self-review and planning, not score ranking or ability labeling.
- The product summarizes recent mistakes, high-frequency error types, weak knowledge points, practice pass rate, and suggested next review focus.
- Reports should help the student decide what to review next.
- Reports should avoid parent-style judgment, ranking language, or fixed ability labels.
- The student can create printable student and answer versions of a test paper.
- Test paper questions should be newly generated by DeepSeek V4 from the student's mistake knowledge-point distribution, not merely selected from previously generated questions.
- DeepSeek V4 owns test-paper content: question text, answer, solution, difficulty, target knowledge point, and retested error pattern.
- Local Claude Code owns test-paper production: converting DeepSeek V4 generated content into LaTeX/PDF student and answer versions.
- Claude Code test-paper production should run on the local machine in `/Users/leo/Library/Mobile Documents/com~apple~CloudDocs/Personal/M3U Codex Workspace/Zan/latex-exams` using the local exam-production skill or workflow.
- Test paper production should be an asynchronous local task. The student should see that the test paper is being produced, be able to leave the page, and later access the completed student PDF and answer PDF.
- Test paper production failures should show a reason and offer retry rather than blocking the learning interface.
- Test paper handoff should include the student's grade range, selected question count, selected difficulty, knowledge-point distribution, error-type distribution, DeepSeek V4 generated questions, answers, solutions, target knowledge points, expected outputs, task status, output paths, and failure reason when applicable.
- A formal test paper must come from the Claude Code plus LaTeX production flow.
- If Claude Code production fails, the app may show a temporary preview or simple print view, but it must be labeled as non-final and should not replace the formal student and answer PDFs.
- Test papers should preserve the relationship between each new question and the knowledge point or error pattern it is intended to retest.
- Test paper generation defaults to an adaptive distribution based on high-frequency weak knowledge points, not-mastered mistakes, and partially mastered mistakes.
- Students may choose question count and difficulty before generation.
- Default question count is 10, with 5, 10, 15, and 20 as supported options.
- Default difficulty is adaptive, with basic, standard, and challenge as selectable modes.
- Mastered mistakes may be sampled lightly for retention checks but should not dominate the test paper.

## Data And State Requirements

- The mobile app owns the active local notebook state for the MVP.
- The product must preserve mistakes, OCR edits, student answers, error analyses, generated questions, practice attempts, archived collection membership, test-paper records, and app settings across app restarts.
- Mistake images, OCR text, student answers, AI analysis, practice attempts, and reports are student learning data and should be treated as private.
- Offline access should allow the student to view and edit existing local mistakes, error analyses, generated questions, archived collection content, and existing test-paper records.
- Offline use should not promise new backend OCR, DeepSeek V4 analysis, generated questions, AI grading, or fresh test-paper generation.
- Offline or network-unavailable states should be clearly shown rather than leaving AI-dependent actions stuck.
- The MVP does not require cloud sync, conflict resolution, or multi-device merge.
- The MVP must provide a local backup path into a user-visible iCloud Drive folder so the student can confirm that their notebook has a recoverable file outside the app's private runtime state.
- The backup should be restorable on the same or a replacement device before the product is considered production-ready.
- The backup must include the mistake image assets, not only image URIs. A restorable backup should preserve structured notebook data plus the original and cropped mistake images needed for review.
- The backup must include formal test paper outputs: student PDF, answer PDF, and the generation manifest needed to understand or reproduce the paper.
- A future backup format may use a folder or archive layout such as a manifest plus an image asset directory.
- Backup content should avoid storing backend vendor credentials or secrets.
- Backup content includes student learning data, so the product should communicate where the backup is stored and avoid uploading it anywhere other than the user-selected iCloud Drive location in the MVP.
- iCloud Drive backup encryption is not required for the MVP, but it is a production security enhancement to evaluate before broader release.

## AI And OCR Requirements

### OCR

- Backend OCR is the preferred recognition path because vendor credentials must stay off the device.
- Google Vision is the default backend OCR provider for the MVP.
- iOS native Vision is the real fallback when backend OCR is unavailable on supported devices.
- Deterministic sample text is allowed only for development or demos. In student-facing use it must be clearly labeled as sample text requiring replacement, not as a real OCR result.
- The student must be able to edit OCR text before it becomes the normalized question text used for analysis and practice.

### AI

- Backend AI is responsible for error analysis, generated-question creation, practice grading, test-paper generation, and future generated-question verification.
- DeepSeek V4 is the formal AI engine for the MVP and should cover error analysis, generated questions, practice grading, and test-paper generation.
- DeepSeek model selection may appear in Settings, but it should not interrupt the student's normal capture, review, practice, or due-review workflow.
- Mock AI may be used for tests and local development only.
- Production-like usage must not silently fall back to mock AI when DeepSeek V4 is not configured. AI-dependent features should show a clear unavailable state and retry/setup guidance.
- DeepSeek V4 credentials must stay on the backend and must not be stored in mobile app state, local notebook backups, or iCloud Drive backup files.
- AI output must remain reviewable because OCR, classification, generated questions, and grading can be wrong.
- Generated-question verification is a product quality gate. A generated question should not enter student practice or a test paper unless it has passed the current verification policy.

## Success Metrics

- Reduction in repeated mistakes on the same knowledge point or error pattern.
- Percentage of active mistakes that move from `not_mastered` or `partially_mastered` toward confirmed mastery after generated-question practice.
- Completion rate for review-due mistakes.
- Generated-question practice pass rate after the student reads the error analysis.
- Accuracy and usefulness of error analysis as judged by student edits or confirmations.
- Generated-question verification pass rate and post-use correction rate.

Usage speed is not a primary success metric. However, the product must avoid silent stalls: OCR, AI analysis, practice generation, printing, and sharing flows should show visible progress, failure, or retry guidance rather than leaving the student unsure whether the system is stuck.

## Quality Requirements

- The iPad experience should remain readable during long study sessions.
- Primary actions should have clear text labels or accessible names.
- Important states such as OCR running, AI unavailable, grading pending, backup success, and backup failure should be expressed with text, not only color or icons.
- Text should remain legible and avoid overlapping on supported iPad layouts.

## Open Questions

- Current implementation allows direct mastery confirmation without checking practice evidence. The PRD target behavior requires a guard before archiving.
- Current schema includes `analyzed`, `review_due`, and `consolidated`, but the first-release PRD state machine does not commit to them as stored states.
- Current deterministic OCR fallback can populate sample text. The PRD target behavior requires development-only use or an explicit sample-text warning before student use.
- Current DeepSeek generated questions are marked as passed by the provider. The PRD production target requires an independent verification step.
- Long-running OCR, AI, print, and sharing operations need explicit progress, timeout, and retry states so the student does not interpret a stalled tool as a learning failure.
- Current home screen shows a broad overview; the PRD target behavior requires a first-class due review queue.
- Current archive flow is one-way. The PRD target requires mastered mistakes in `错题集` to support retesting and return to `错题本` when they relapse.
- Current mobile persistence writes app-local archived state. The PRD target requires a user-visible iCloud Drive backup and restore path.
- Current state stores image URIs. The PRD target requires image assets themselves to be included in backup and restore.
- Current prompts, examples, and tests are biased toward Grade 7 equation problems. The PRD target includes middle-school and high-school students, with first-release acceptance focused through common Grade 10 problem types.
- Current knowledge points are freeform strings. The PRD target allows this for MVP but requires enough normalization to avoid fragmented reports.
- Current mobile practice attempts are locally marked with a boolean result. The PRD target requires DeepSeek V4 grading with student regrading or correction requests when AI grading is wrong.
- iCloud Drive backups contain student learning data. Backup encryption is not required for MVP, but should be evaluated before broader release.
- Current test papers are assembled from existing generated questions. The PRD target requires DeepSeek V4 to generate fresh test paper questions from the student's mistake knowledge-point distribution.
- Current test-paper output is generated inside the mobile app as HTML/PDF. The PRD target delegates LaTeX/PDF production to local Claude Code in the `latex-exams` workspace after DeepSeek V4 creates the test-paper content.
