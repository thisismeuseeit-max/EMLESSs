FROM node:20-alpine

WORKDIR /app

# Create volume mount point for persistent storage
RUN mkdir -p /data

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 8080
EXPOSE 8444

ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "server.js"]
