# Stage 1: Development
FROM node:20-alpine AS development
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json

RUN npm ci

COPY . .

EXPOSE 3000

# Stage 2: Production build
FROM development AS builder
RUN npm run build -w apps/web

# Stage 3: Production
FROM node:20-alpine AS production
WORKDIR /app

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
