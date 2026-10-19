FROM node:22-slim AS frontend-builder
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build
FROM node:22-slim
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY backend/ ./backend/
WORKDIR /app/backend
RUN npm ci --omit=dev && npx prisma generate
COPY --from=frontend-builder /build/frontend/dist /app/frontend/dist
EXPOSE 8080
CMD ["node", "src/server.js"]