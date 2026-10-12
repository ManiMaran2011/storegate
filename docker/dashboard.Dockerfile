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
COPY apps/dashboard apps/dashboard
RUN npm run build -w apps/dashboard

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/dashboard/dist /usr/share/nginx/html
EXPOSE 8080
