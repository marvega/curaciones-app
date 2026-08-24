# syntax=docker/dockerfile:1

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# Cloud Run mounts the uploads bucket over this path. It has to exist in the
# image so the app also starts with no volume attached, and be owned by the
# runtime user so gcsfuse can be mounted with a matching uid/gid.
RUN mkdir -p uploads && chown node:node uploads
USER node

EXPOSE 8080
CMD ["node", "dist/main"]
