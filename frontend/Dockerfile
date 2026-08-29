# --- Build stage -------------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

# npm ci installs exactly the lockfile, so a CI build cannot silently pick up a
# different transitive version than the one that was tested.
COPY package*.json ./
RUN npm ci

COPY . .

# Vite inlines env vars at BUILD time, not at runtime, so the API URL has to be
# supplied here rather than as a container environment variable.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# --- Runtime stage -----------------------------------------------------------
# Only the built assets and a static server ship; node_modules stays behind.
FROM node:20-alpine AS runtime

WORKDIR /app
RUN npm install -g serve@14

COPY --from=build /app/dist ./dist

USER node
EXPOSE 80

# -s serves the SPA fallback, so a deep link like /cases/12/assessment is
# handed to index.html instead of 404ing.
CMD ["serve", "-s", "dist", "-l", "80"]
