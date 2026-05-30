FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/db ./db
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/drizzle.config.ts ./
RUN npm ci --omit=dev

EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && npm start"]
