# Correction Notebook

Correction Notebook is the learning context for turning a student's math mistake into an explainable review loop. Its language centers on mistake capture, error analysis, related practice, mastery, and review materials.

## Language

**Mistake**:
A math problem the student got wrong or needs to review, together with the student's original answer and the captured source image or OCR text.
_Avoid_: Note, item, record

**Correction Notebook**:
The active collection of mistakes that still need analysis, practice, review, or mastery confirmation. In the product UI this is called `错题本`.
_Avoid_: Notebook, archive, question bank

**Archived Collection**:
The collection of mistakes that have been explicitly confirmed as mastered and moved out of the active correction notebook. In the product UI this is called `错题集`.
_Avoid_: History, deleted mistakes, completed list

**OCR Text**:
The raw text recognized from the captured problem image before the student reviews and edits it.
_Avoid_: Scan result, extracted note

**Normalized Question Text**:
The reviewed and cleaned question text used for analysis, practice generation, and display.
_Avoid_: OCR text when referring to reviewed text

**Student Answer**:
The student's original answer to the captured mistake, used to explain the specific error.
_Avoid_: Attempt, response

**Error Analysis**:
The student-facing explanation of why the mistake happened, including the main error type, secondary error tags, wrong step, correct solution steps, and prevention advice.
_Avoid_: Diagnosis, feedback

**Main Error Type**:
The fixed primary category that explains the mistake, such as knowledge, reading, method, process, or expression error.
_Avoid_: Category, label

**Secondary Error Tag**:
An optional supporting tag that sharpens the main error type without repeating it. Secondary tags may be more specific than main error types, but they should be normalized enough to support review and reporting.
_Avoid_: Subcategory, secondary type

**Generated Question**:
A related practice question generated from a mistake to test whether the same knowledge point or error pattern has been corrected.
_Avoid_: Exercise, quiz question, variant

**Practice Attempt**:
One student's answer to one generated question, including whether it was correct and the feedback.
_Avoid_: Student answer, submission

**Mastery Status**:
The learning state of a mistake as it moves from analysis to practice, partial mastery, non-mastery, or confirmed mastery.
_Avoid_: Completion status, workflow status

**Review Due Date**:
The date when a mistake should be revisited based on its current mastery status.
_Avoid_: Deadline, reminder date

**Test Paper**:
A printable review paper generated from the student's mistake knowledge-point distribution, with separate student and answer versions.
_Avoid_: Worksheet, PDF, exam
