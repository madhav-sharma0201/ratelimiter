FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY src ./src

EXPOSE 3000 3001 3002 3003

ENV NODE_ENV=production
ENV REDIS_URL=redis://redis:6379

CMD ["node", "src/cluster.js"]
