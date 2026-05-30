# Local-First MVP With Backend Enrichment

Correction Notebook treats the mobile app as the owner of the current learning session and local correction notebook state, while the backend owns OCR and AI enrichment calls. This keeps the MVP usable without accounts or server persistence, keeps vendor credentials off the device, and postpones the harder durable identity and sync model until the product needs multi-device or classroom workflows.
