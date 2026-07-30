# AI interview agent — deploy as a long-running background worker (Render "Background Worker",
# Railway, Fly, or a container host). It holds a persistent connection to LiveKit; it is NOT
# an HTTP service and has no inbound port.
FROM node:22-slim

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

COPY tsconfig.json ./
COPY src ./src
RUN npm install --no-save tsx typescript

# `start` connects to LiveKit and waits for interview rooms to be dispatched.
CMD ["npm", "start"]
