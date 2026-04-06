FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY apps/web/package*.json ./apps/web/
COPY apps/backoffice/package*.json ./apps/backoffice/
COPY apps/api/package*.json ./apps/api/
COPY packages/ui/package*.json ./packages/ui/
COPY packages/pricing/package*.json ./packages/pricing/
COPY packages/types/package*.json ./packages/types/

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev", "-w", "apps/web"]
