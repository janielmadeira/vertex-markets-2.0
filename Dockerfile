FROM node:20-alpine

WORKDIR /app

COPY apps/api/package*.json ./
COPY apps/api/prisma ./prisma/

RUN npm install

COPY apps/api/ .

RUN npm run build

EXPOSE 3001

CMD ["npm", "start"]
