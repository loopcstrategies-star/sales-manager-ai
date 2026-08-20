FROM node:20-slim

WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

COPY backend/ ./
COPY shared/ /app/shared/

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "server.js"]
