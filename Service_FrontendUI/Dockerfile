FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=build /app/.output /app/.output
EXPOSE 3000
ENV NITRO_PORT=3000
CMD ["node", ".output/server/index.mjs"]
