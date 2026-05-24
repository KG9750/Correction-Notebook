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

## Baidu OCR

The iPad/Web client never calls Baidu directly. It sends image Base64 to the local API at `/api/v1/ocr`; the API keeps Baidu credentials server-side.

Set these environment variables before starting the API:

```bash
export BAIDU_OCR_API_KEY="your-baidu-api-key"
export BAIDU_OCR_SECRET_KEY="your-baidu-secret-key"
npm run dev:api
```

By default the API uses Baidu's formula OCR endpoint because this app primarily handles math mistakes:

```text
https://aip.baidubce.com/rest/2.0/ocr/v1/formula
```

This endpoint can return LaTeX formulas. Baidu's current docs mark the formula endpoint as stopped-updating and pending migration, so the endpoint remains configurable.

Optional override:

```bash
export BAIDU_OCR_ENDPOINT="https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic"
```

If Baidu OCR is not configured or the request fails, the mobile app falls back to local/native OCR behavior so the capture flow remains usable.

The API intentionally works without real DeepSeek or Volcengine keys. Real providers should be added behind the `LLMProvider` interface and must keep API keys on the backend only.
