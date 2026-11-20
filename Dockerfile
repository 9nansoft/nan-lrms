# Multi-stage Dockerfile for KK-LRMS
# Stage 1: Install ALL dependencies (dev included for build)
FROM node:24-alpine AS deps
WORKDIR /app
# npm ci REQUIRES the lockfile — copy both manifests, never just package.json.
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_BUILD_ID=dev
ARG NEXT_PUBLIC_BUILD_TIME
ENV NEXT_PUBLIC_BUILD_ID=$NEXT_PUBLIC_BUILD_ID
ENV NEXT_PUBLIC_BUILD_TIME=$NEXT_PUBLIC_BUILD_TIME
ENV NEXT_TELEMETRY_DISABLED=1
ENV DOCKER_BUILD=true
RUN npm run build

# Stage 3: Production (minimal image)
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user and data directory
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p /app/data && chown nextjs:nodejs /app/data

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# The runtime writes into .next: the image optimizer keeps its cache in
# .next/cache/images, and the server creates .next/cache on start. The
# copies above land as root, so without this the app user cannot create or
# write them and every optimized image 500s ("EACCES: permission denied,
# mkdir '/app/.next/cache'").
RUN mkdir -p /app/.next/cache && chown -R nextjs:nodejs /app/.next

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
