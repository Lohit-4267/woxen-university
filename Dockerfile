FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production DB_FILE=/data/arzon.db
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["npm", "start"]
