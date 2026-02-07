# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Production Stage
FROM node:20-alpine AS runner

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY --from=builder /app/dist ./dist
# If you have static assets or env files needed, copy them here too
# COPY .env .env (Better to use Dockploy Env Vars)

EXPOSE 5000

CMD ["npm", "start"]
