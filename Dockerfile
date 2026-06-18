# syntax=docker/dockerfile:1.7
# Base: Debian slim para compatibilidad con módulos nativos (sharp, canvas, etc.)
FROM node:20-bookworm-slim AS base
WORKDIR /app

# --- Stage: deps ---
FROM base AS deps
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev

# --- Stage: builder ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Suprimir warning de serwist con turbopack — usamos webpack a propósito.
ENV SERWIST_SUPPRESS_TURBOPACK_WARNING=1
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# --- Stage: runner ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Usuario no-root.
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
