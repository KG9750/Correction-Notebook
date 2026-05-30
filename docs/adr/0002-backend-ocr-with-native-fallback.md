# Backend OCR With Native Fallback

Correction Notebook keeps OCR vendor credentials on the backend and uses Google Vision as the default backend OCR provider. iOS native Vision is the real device-side fallback when the backend is unavailable, while deterministic sample text is limited to development or clearly labeled demos because real student notebooks must not silently ingest unrelated sample problems.
