# Production image (Railway or any container host). Node 24, same as CI.
FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The build validates the environment, so it gets placeholder values here.
# The real values come from the host at runtime and are never baked into the image.
RUN NODE_ENV=production \
    APP_URL=https://build.invalid \
    DATABASE_URL=postgres://build@localhost/build \
    REDIS_URL=redis://localhost:6379 \
    SMTP_URL=smtp://localhost:25 \
    MAIL_FROM=build@example.com \
    PII_HASH_SECRET=build-only-placeholder-build-only-0000 \
    MFA_ENCRYPTION_KEY=build-only-placeholder-build-only-0000 \
    S3_ENDPOINT=https://build.invalid \
    S3_PUBLIC_ENDPOINT=https://build.invalid \
    S3_BUCKET=build-placeholder \
    S3_ACCESS_KEY=build-placeholder \
    S3_SECRET_KEY=build-placeholder-0000 \
    npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# Dev dependencies stay: migrations and the retention job run with tsx.
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
# next start reads PORT from the host.
CMD ["node", "node_modules/next/dist/bin/next", "start"]
