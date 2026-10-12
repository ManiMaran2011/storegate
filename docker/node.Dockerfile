# One Dockerfile for every Node service in the repo (gateway and the MCP servers).
#   docker build -f docker/node.Dockerfile --build-arg WORKSPACE=apps/gateway --build-arg ENTRY=dist/main.js -t storegate/gateway .
#   docker build -f docker/node.Dockerfile --build-arg WORKSPACE=mcp-servers/woo-mcp -t storegate/woo-mcp .
# Build context is the repository root (npm workspaces).

# ---- build: full dependency set, compile TypeScript ----
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/mcp-kit/package.json packages/mcp-kit/
COPY apps/gateway/package.json apps/gateway/
COPY apps/dashboard/package.json apps/dashboard/
COPY mcp-servers/woo-mcp/package.json mcp-servers/woo-mcp/
COPY mcp-servers/fx-mcp/package.json mcp-servers/fx-mcp/
COPY mcp-servers/tickets-mcp/package.json mcp-servers/tickets-mcp/
COPY mcp-servers/evil-mcp/package.json mcp-servers/evil-mcp/
RUN npm ci --ignore-scripts
COPY packages packages
COPY apps/gateway apps/gateway
COPY mcp-servers mcp-servers
ARG WORKSPACE
RUN test -n "$WORKSPACE" || (echo "pass --build-arg WORKSPACE=<apps/gateway|mcp-servers/...>" && exit 1)
RUN npm run build -w packages/mcp-kit && npm run build -w "$WORKSPACE"

# ---- runtime: production dependencies only, no compiler, no sources ----
FROM node:22-alpine AS runtime
ARG WORKSPACE
ARG ENTRY=dist/index.js
ENV NODE_ENV=production
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/mcp-kit/package.json packages/mcp-kit/
COPY ${WORKSPACE}/package.json ${WORKSPACE}/
# Workspace package.json files that are not part of this image still need to exist for npm ci.
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/gateway/package.json apps/gateway/
COPY mcp-servers/woo-mcp/package.json mcp-servers/woo-mcp/
COPY mcp-servers/fx-mcp/package.json mcp-servers/fx-mcp/
COPY mcp-servers/tickets-mcp/package.json mcp-servers/tickets-mcp/
COPY mcp-servers/evil-mcp/package.json mcp-servers/evil-mcp/
RUN npm ci --omit=dev --ignore-scripts -w packages/mcp-kit -w "${WORKSPACE}" && npm cache clean --force
COPY --from=build /repo/packages/mcp-kit/dist packages/mcp-kit/dist
COPY --from=build /repo/${WORKSPACE}/dist ${WORKSPACE}/dist
ENV WORKSPACE=${WORKSPACE} ENTRY=${ENTRY}
USER 10001:10001
EXPOSE 8080
# Shell form so $WORKSPACE expands; `exec` keeps node as PID 1 so SIGTERM reaches it.
CMD exec node ${WORKSPACE}/${ENTRY}
