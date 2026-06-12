FROM node:20-slim

RUN npx playwright install chromium --with-deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3001

CMD ["node", "src/server.js"]
