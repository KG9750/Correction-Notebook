# Architecture Review

## Current Shape

Correction Notebook is a TypeScript monorepo with four main workspaces:

- `apps/mobile`: Expo React Native app for capture, notebook review, practice, reports, settings, and PDF actions.
- `services/api`: Fastify API for OCR, mistake creation, AI analysis, practice generation, grading, and test-paper metadata.
- `packages/shared`: Zod schemas, domain types, taxonomy, mastery rules, review priority, and generated-question filtering.
- `packages/ai`: LLM provider boundary with DeepSeek and deterministic mock implementations.

The current product flow is:

1. The mobile app captures or imports an image.
2. OCR runs through the backend first, then iOS native Vision, then deterministic fallback text.
3. The user edits the question text and student answer.
4. The mobile app creates a local mistake and asks the API to create, analyze, and generate practice for a server-side copy.
5. Returned analysis and generated questions are merged back into the local notebook state.
6. Practice attempts update local mastery state.
7. Confirmed mastered mistakes move into the archived collection.
8. Test papers and reports are generated from local state.

## Strengths

- The domain model is concentrated in `packages/shared`, which keeps schemas and learning rules visible to both the API and app.
- The AI boundary is explicit. `packages/ai` hides DeepSeek-specific prompting behind `LLMProvider`, and the API can use a deterministic mock in tests.
- OCR credentials stay on the backend. The mobile app does not call OCR vendors directly.
- The mobile app now has a local persistence boundary, so reloads preserve mistakes, edits, attempts, archives, and settings.
- The main React Native entry point has been split into screens and shared UI, reducing the immediate maintenance risk of one oversized component.
- Tests cover the most important state transitions: capture, edit, delete, practice attempt, mastery confirmation, archive, OCR fallback, and API behavior.

## Design Risks

### 1. Two Sources Of Truth For Mistakes

The mobile app creates a local mistake immediately, then the API creates a separate server-side mistake for analysis and practice generation. The returned analysis and questions are remapped onto the local mistake ID.

This is pragmatic for an MVP, but it means the app and API do not share a durable identity model. If a future release adds accounts, sync, multi-device use, or server persistence, this becomes the first architectural fault line.

Recommended direction: keep local-first capture for responsiveness, but introduce an explicit `server_mistake_id` or a sync record before adding real persistence.

### 2. API Store Is Development-Only

`services/api` uses an in-memory `Map` store. This makes tests and local development simple, but all API-side mistakes, analyses, questions, attempts, and papers disappear on process restart.

Recommended direction: treat API storage as a swappable port now. Do not add production auth or multi-device sync before deciding the durable store and ownership model.

### 3. Mastery Rules Diverge Between Client And API

Both the mobile reducer and API compute practice outcomes. The mobile app intentionally requires explicit confirmation before an all-correct local practice becomes `mastered`; the API marks mastery directly from practice results.

This is a product decision disguised as implementation. If confirmation is part of the learning method, the API should model it too. If automatic mastery is intended on the server, the mobile exception needs to be documented as a UI-only safeguard.

Recommended direction: make “confirmed mastery” a first-class domain transition in `packages/shared`.

For the agreed target user, this risk is higher: the primary operator is a self-motivated student, not a parent. Direct mastery confirmation without practice evidence can let a student archive a mistake too early. The product target should require recent generated-question evidence before confirmation.

There is a second mismatch: current mobile practice attempts are marked locally with a boolean, while the PRD target requires DeepSeek V4 to judge practice answers and provide feedback. The API has a grading endpoint, but the mobile workflow does not yet use it as the default practice path.

DeepSeek grading failure also needs a distinct state. The product target is to leave attempts temporarily ungraded and not update mastery until grading succeeds or a deliberate human review mode exists.

The archive flow is also one-way today. The PRD target keeps `错题集` as a reviewable mastered collection where failed retesting can move a mistake back into `错题本`.

### 4. Mastery Status Vocabulary Is Wider Than The Implemented State Machine

The schema allows `analyzed`, `review_due`, `consolidated`, and `relapsed`, but current code mainly uses `pending_analysis`, `pending_practice`, `practicing`, `not_mastered`, `partially_mastered`, and `mastered`.

This is not wrong, but it creates ambiguity for future engineers and product specs.

The PRD first-release state machine commits to `pending_analysis`, `pending_practice`, `practicing`, `not_mastered`, `partially_mastered`, `mastered`, and `relapsed`. It treats `review_due` as a view derived from `review_due_at`, and does not commit to `analyzed` or `consolidated`.

Recommended direction: align the schema with the PRD state machine or document the extra schema values as reserved future states.

### 5. AI Verification Is A Production Quality Gate

Generated questions are filtered by `verification_status`, but DeepSeek generation currently returns questions with `verification_status: "passed"` directly. The mock verifier checks only required fields.

For the agreed student-led product, this cannot remain a cosmetic field. Generated questions and answers directly shape practice and test papers, so production use should require an independent verification step before generated questions are shown as valid.

Recommended direction: separate generation from verification before relying on generated questions in student practice or printed materials.

### 6. OCR Fallback Is User-Friendly But Product-Sensitive

Deterministic fallback text keeps demos usable, but it can silently insert unrelated sample math text after backend and native OCR fail.

Recommended direction: keep deterministic fallback only in development mode or make the UI clearly label it as sample text requiring replacement.

### 7. Settings Are Local Only

Model choice, practice count, and difficulty live in local app state. This is fine for an MVP but will not survive multi-device use or parent/teacher policy controls.

Recommended direction: leave settings local until accounts exist; do not prematurely create a settings API.

### 8. High-School Coverage Is Under-Specified

The agreed target user includes self-motivated middle-school and high-school students, but the current prompts, mock data, examples, and tests are biased toward Grade 7 equation problems. The DeepSeek system prompt also frames generated questions around Grade 7 difficulty.

Recommended direction: keep first-release acceptance focused on middle-school through common Grade 10 problem types, then add explicit topic coverage, prompt variants, OCR/LaTeX expectations, and verification tests before claiming broad high-school support.

### 9. Knowledge Points Are Freeform

`knowledge_points` is currently a string array. This keeps capture and AI integration flexible, but it can fragment reports and review planning when the same concept appears under many names.

Recommended direction: allow AI-suggested and student-edited knowledge points for the MVP, but add lightweight normalization before building a full textbook or curriculum map.

### 10. Test Paper Generation Reuses Existing Generated Questions

Current test paper creation selects existing generated questions. The PRD target is stronger: DeepSeek V4 should generate fresh test paper questions from the student's mistake knowledge-point distribution.

The PRD also separates content generation from production: DeepSeek V4 owns the question content, answers, solutions, and knowledge-point mapping; local Claude Code in `/Users/leo/Library/Mobile Documents/com~apple~CloudDocs/Personal/M3U Codex Workspace/Zan/latex-exams` owns asynchronous LaTeX/PDF production.

Recommended direction: add a separate test-paper generation use case instead of reusing per-mistake generated questions as the test-paper source, and model Claude Code production as an asynchronous local job boundary.

The recommended job boundary is a JSON manifest. It should carry the grade range, question count, difficulty, knowledge-point distribution, error-type distribution, DeepSeek V4 generated questions, answers, solutions, target knowledge points, expected outputs, job status, output paths, and failure reason. The PRD defines the handoff content; implementation can still choose the exact file name and schema version.

### 11. iCloud Drive Backup Is Not Implemented

The current mobile persistence writes serialized notebook state into the app-local storage path, and web uses `localStorage`. The agreed product requirement is stronger: a student must have a user-visible iCloud Drive backup file that can be restored on the same or a replacement device.

The current model also stores image URIs, not a recoverable image asset package. A backup that preserves only `original_image_uri` and `cropped_image_uri` can restore broken references after device migration, app reinstall, or cache cleanup.

Recommended direction: add an explicit backup and restore boundary rather than treating app sandbox persistence as sufficient. This likely needs a platform capability decision for user-visible iCloud Drive file access and a backup format that includes structured notebook data plus image assets.

## Documentation Updates Added

This review added the missing documentation layer:

- `CONTEXT.md` defines the product language for mistake capture, correction notebook, archived collection, OCR text, normalized question text, error analysis, generated questions, mastery, review due dates, and test papers.
- `docs/PRD.md` defines the product boundary, target users, non-goals, core workflow, functional requirements, local/iCloud data requirements, AI/OCR requirements, success metrics, quality requirements, and implementation gaps.
- `docs/adr/0001-local-first-mvp-with-backend-enrichment.md` records the local-first architecture.
- `docs/adr/0002-backend-ocr-with-native-fallback.md` records OCR provider and fallback policy.
- `docs/adr/0003-user-visible-icloud-drive-backup.md` records the user-visible iCloud Drive backup requirement.
- `docs/adr/0004-deepseek-v4-as-formal-ai-engine.md` records DeepSeek V4 as the formal AI engine.
- `docs/adr/0005-claude-code-for-local-test-paper-production.md` records the Claude Code LaTeX/PDF production boundary.

## Recommended Near-Term Architecture

For the next iteration, keep the system as a local-first MVP:

- Mobile owns the immediate learning session and local persistence.
- API owns vendor integrations and stateless enrichment.
- Shared owns schemas and pure domain rules.
- AI owns provider-specific prompting and parsing.
- The shared domain rules should drive the mobile due-review queue, not only API sorting.

Before production sync, resolve these decisions in order:

1. Whether a Mistake has one durable global identity or separate local/server identities.
2. Whether mastered status is automatic or requires explicit confirmation everywhere.
3. Whether deterministic OCR fallback is allowed outside local development.
4. Which mastery statuses are in scope for the first production release.
5. Whether generated-question verification must be a real second pass.
6. How DeepSeek V4 should transform mistake knowledge-point distribution into fresh test paper questions.
7. How the app/API should hand off generated test-paper content to local Claude Code and receive student/answer PDF outputs.
8. How the iCloud Drive backup and restore package is created, selected, versioned, and mapped back to image assets.
