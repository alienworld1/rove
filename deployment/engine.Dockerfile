FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/engine/package.json apps/engine/package.json
COPY packages packages
RUN pnpm install --frozen-lockfile --filter @rove/engine... --ignore-scripts
COPY apps/engine apps/engine
COPY deployment/published-runs deployment/published-runs
ENV NODE_ENV=production ACCESS_MODE=hosted ENGINE_HOST=0.0.0.0 ENGINE_PORT=4100
EXPOSE 4100
USER node
CMD ["pnpm", "--filter", "@rove/engine", "start"]
