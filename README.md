# Correction Notebook

Correction Notebook is an iPad-first math mistake notebook. The MVP captures a student's paper mistake, keeps the image and editable OCR text, classifies the error, explains the root cause, generates three related practice questions, grades attempts, updates mastery, and creates separate student/answer PDF handouts.

## Workspace

- `apps/mobile`: Expo React Native iPad app.
- `services/api`: Fastify API with mock AI provider and in-memory persistence for local development.
- `packages/shared`: Zod schemas, domain types, taxonomy, mastery and review logic.
- `packages/ai`: Provider abstraction plus deterministic mock provider.

## Commands

```bash
npm install
npm test
npm run build
npm run dev:api
npm run dev:mobile
```

## Local Services

For iPad testing, keep the API in Docker and run Expo separately:

```bash
docker compose up -d --build correction-notebook-api
docker logs -f correction-notebook-api
docker compose stop correction-notebook-api
```

The desktop launcher `~/Desktop/Start Correction Notebook.command` starts the API in Docker background mode and opens only the Expo terminal window.

## OCR

The iPad/Web client never calls OCR vendors directly. It sends image Base64 to the local API at `/api/v1/ocr`; the API keeps vendor credentials server-side.

The current default backend OCR provider is Google Cloud Vision document text detection. Set this environment variable before starting the API:

```bash
export GOOGLE_CLOUD_VISION_API_KEY="your-google-vision-api-key"
npm run dev:api
```

Optional override:

```bash
export GOOGLE_VISION_ENDPOINT="https://vision.googleapis.com/v1/images:annotate"
```

If backend OCR is not configured or the request fails, the mobile app shows an explicit OCR failure and keeps the editable question field empty. It must not silently insert sample problem text into a real student notebook.

Baidu OCR client code remains in `services/api/src/ocr/baidu.ts` for future provider switching, but it is not the API default.

## AI Provider

The API intentionally works in tests without real DeepSeek or Volcengine keys. Real provider keys must stay on the backend only.

Set DeepSeek before running the API in production-like local development:

```bash
export DEEPSEEK_API_KEY="your-deepseek-api-key"
npm run dev:api
```
