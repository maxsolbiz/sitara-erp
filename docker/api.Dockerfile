# Stage 1: Development
FROM node:20-alpine AS development
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json

RUN npm ci

COPY . .

EXPOSE 3000

# Stage 2: Production build
FROM development AS builder
RUN npm run build -w apps/api

# Stage 3: Production
FROM node:20-alpine AS production
WORKDIR /app

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 3000
CMD ["node", "apps/api/dist/index.js"]
