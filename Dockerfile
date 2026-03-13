FROM node:20-slim AS builder

WORKDIR /app

# Install all deps (including devDeps for TypeScript)
# Use npm ci for deterministic lockfile-based installs
COPY package*.json ./
RUN npm ci

# Copy source and compile
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ---- Production image ----
FROM node:20-slim

WORKDIR /app

# Production deps only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output and static files
COPY --from=builder /app/dist ./dist
COPY openapi.json ./
COPY index.html ./
COPY runtime-entrypoint.mjs ./

ARG DJD_RELEASE_SHA=
ARG DJD_BUILD_TIMESTAMP=
ENV DJD_RELEASE_SHA=${DJD_RELEASE_SHA}
ENV DJD_BUILD_TIMESTAMP=${DJD_BUILD_TIMESTAMP}

EXPOSE 3000

CMD ["node", "--max-old-space-size=1536", "runtime-entrypoint.mjs"]
