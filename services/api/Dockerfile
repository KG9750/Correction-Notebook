FROM public.ecr.aws/docker/library/node:22-bookworm

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY services/api/package.json services/api/package.json

RUN npm ci

COPY packages packages
COPY services/api services/api

RUN npm run build -w @correction-notebook/shared \
  && npm run build -w @correction-notebook/ai \
  && npm run build -w @correction-notebook/api

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787

EXPOSE 8787

CMD ["npm", "run", "start", "-w", "@correction-notebook/api"]
