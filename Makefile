# Storegate: one command from a fresh checkout to a running demo.
#   make up        create a k3d cluster, build images, install the chart
#   make demo      create the demo users and API keys, print how to try everything
#   make down      delete the cluster
SHELL := /bin/bash
CLUSTER  ?= storegate
TAG      ?= dev
RELEASE  ?= storegate
CHART    := charts/storegate
VALUES   ?= $(CHART)/values-local.yaml
HELM_SET ?=
IMAGES   := gateway dashboard woo-mcp fx-mcp tickets-mcp evil-mcp

.PHONY: up cluster images import deploy demo verify evil-token down clean test chart-lint lint status logs

up: cluster images import deploy ## Everything, from nothing
	@echo; echo "Ready. Run 'make demo' next."

cluster: ## k3d cluster with Traefik on localhost:80/443
	@k3d cluster list $(CLUSTER) >/dev/null 2>&1 || k3d cluster create --config deploy/k3d.yaml

images: ## Build all container images
	docker build -f docker/node.Dockerfile --build-arg WORKSPACE=apps/gateway --build-arg ENTRY=dist/main.js -t storegate-gateway:$(TAG) .
	docker build -f docker/dashboard.Dockerfile -t storegate-dashboard:$(TAG) .
	docker build -f docker/node.Dockerfile --build-arg WORKSPACE=mcp-servers/woo-mcp -t storegate-woo-mcp:$(TAG) .
	docker build -f docker/node.Dockerfile --build-arg WORKSPACE=mcp-servers/fx-mcp -t storegate-fx-mcp:$(TAG) .
	docker build -f docker/node.Dockerfile --build-arg WORKSPACE=mcp-servers/tickets-mcp -t storegate-tickets-mcp:$(TAG) .
	docker build -f docker/node.Dockerfile --build-arg WORKSPACE=mcp-servers/evil-mcp -t storegate-evil-mcp:$(TAG) .

import: ## Load the images into the cluster (no registry needed locally)
	k3d image import $(foreach i,$(IMAGES),storegate-$(i):$(TAG)) -c $(CLUSTER)

deploy: ## Install or upgrade the chart; waits until everything, including the WooCommerce setup, is done
	helm upgrade --install $(RELEASE) $(CHART) -f $(VALUES) --set image.tag=$(TAG) $(HELM_SET) \
	  --namespace default --wait --wait-for-jobs --timeout 20m

demo: ## Two users (admin + member) with API keys, written to .demo/credentials.txt
	scripts/demo-users.sh

verify: ## Prove the network isolation and credential handling claims against the live cluster
	scripts/verify-isolation.sh

evil-token: ## Bearer token for the evil-mcp fixture (paste it when adding the server in the dashboard)
	@kubectl -n platform get secret upstream-tokens -o jsonpath='{.data.EVIL_MCP_TOKEN}' | base64 -d; echo

status:
	@kubectl get pods,pvc,ingress -n store; kubectl get pods,ingress -n platform

logs:
	kubectl logs -n store job/wordpress-setup --tail=50; kubectl logs -n platform deploy/gateway --tail=50

down clean: ## Delete the cluster (and with it every volume)
	k3d cluster delete $(CLUSTER)

test: ## Unit and integration tests (needs Postgres: see README)
	npm test

chart-lint: ## Real Helm lint + render of every profile, then the repo's own policy checks
	helm lint $(CHART) -f $(VALUES)
	helm lint $(CHART) -f $(CHART)/values-prod.yaml
	node scripts/render-charts.mjs

lint: chart-lint
