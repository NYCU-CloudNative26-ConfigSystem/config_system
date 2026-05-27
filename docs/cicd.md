# CI/CD & Architecture Guide

This document explains how the config system is structured, how each piece fits together, and exactly what happens when code is pushed.

---

## 1. System Architecture

```
Browser
  │
  ▼
┌─────────────────────┐
│   service-frontendui│  Nuxt 3 (SSR)  port 3000
│   (the only public  │  ← GKE HTTP Load Balancer points here
│    entry point)     │
└──────┬──────────────┘
       │ server-side proxy (Nuxt /server/api/* routes)
       │
       ├──► service-login         (Python/FastAPI)  port 8000
       │      └── PostgreSQL (auth_service DB)
       │      └── Redis (session tokens)
       │
       ├──► service-config-table  (Python/FastAPI)  port 18001
       │      └── PostgreSQL (config_table_db DB)
       │      └── Redis (cache)
       │
       └──► service-ssot          (Bun/Hono)        port 3000
              └── Neo4j (truth node graph)
              └── Redis (cache)
```

### Why this shape?

- **One public IP**: the GKE ingress only exposes the Nuxt frontend. All backend services are internal (ClusterIP) — browsers can never call them directly.
- **Nuxt proxies everything**: when the browser calls `/api/login/...`, Nuxt's server-side route calls `http://service-login:8000/...` inside the cluster. This avoids CORS issues and hides internal URLs.
- **Redis is shared**: all services connect to the same Redis instance for caching and session data.
- **Two databases**:
  - `auth_service` — users, passwords, JWT refresh tokens (in PostgreSQL)
  - `config_table_db` — configuration rows (in PostgreSQL)
  - Neo4j — the "Single Source of Truth" graph: TruthNodes, ValueNodes, GroupNodes, NameNodes

---

## 2. Repository Layout

```
config_system/               ← this repo (the "parent")
  .github/workflows/
    cicd.yml                 ← the entire CI/CD pipeline
  k8s/
    namespace.yaml           ← creates the "config-system" namespace
    ingress.yaml             ← GKE HTTP load balancer → frontend
    infra/
      configmap.yaml         ← shared non-secret config (REDIS_URL)
      secret.yaml            ← placeholder only; real values injected by CI
      postgres.yaml          ← StatefulSet + Service
      redis.yaml             ← Deployment + Service
      neo4j.yaml             ← StatefulSet + Service + PVC
    services/
      login.yaml             ← Deployment + ClusterIP Service
      config-table.yaml      ← Deployment + ClusterIP Service
      ssot.yaml              ← Deployment + ClusterIP Service
      frontend.yaml          ← Deployment + NodePort Service
  docker-compose.yml         ← local dev only (mirrors k8s layout)
  docs/
    cicd.md                  ← this file

  Service_Login/             ← git submodule (private repo)
  Service_SSOT/              ← git submodule (private repo)
  Service_Config_Table/      ← git submodule (private repo)
  Service_FrontendUI/        ← git submodule (private repo)
```

Each `Service_*` directory is a **git submodule** — a pointer to a specific commit in a separate private repo. When you `git submodule update --init --recursive`, git clones each service at the pinned commit. This means the parent repo controls which version of each service is deployed.

---

## 3. The CI/CD Pipeline (`.github/workflows/cicd.yml`)

The pipeline has three stages that run in order:

```
[push to main / PR to main]
        │
        ▼
┌───────────────────────────────────────────┐
│  Stage 1: Tests (4 jobs, run in parallel) │
│  test-ssot  test-login  test-config-table │
│  test-frontend                            │
└───────────────────┬───────────────────────┘
                    │ all pass?
                    ▼
        ┌───────────────────────┐
        │  Stage 2: build-push  │  ← only on push to main (not PRs)
        │  Build 4 Docker images│
        │  Push to Artifact Reg.│
        └──────────┬────────────┘
                   │ succeeds?
                   ▼
        ┌───────────────────────┐
        │  Stage 3: deploy      │  ← only on push to main
        │  kubectl apply k8s/   │
        │  Wait for rollouts    │
        └───────────────────────┘
```

### Stage 1 — Tests

| Job | Language | Infra spun up |
|---|---|---|
| `test-ssot` | Bun | nothing (mocked) |
| `test-login` | Python 3.11 | postgres + redis sidecar containers |
| `test-config-table` | Python 3.12 | redis sidecar; SQLite in-memory for DB |
| `test-frontend` | — | runs `docker build` as a smoke test |

Tests run on every push AND every pull request. This means you get feedback before merging.

### Stage 2 — Build & Push

Runs only when code is pushed directly to `main` (merging a PR counts as a push to main). Skipped for PRs.

Steps:
1. **Authenticate to GCP** via Workload Identity Federation (see section 4)
2. **`setup-gcloud`** — initialises the gcloud CLI using the credentials from step 1
3. **`gcloud auth configure-docker`** — registers gcloud as Docker's credential helper for `us-central1-docker.pkg.dev`
4. **Build + push** — for each service, `docker build` then `docker push` with two tags:
   - `:COMMIT_SHA` — immutable, identifies exactly which commit built this image
   - `:latest` — floating tag, always points to the newest push

The registry path is: `us-central1-docker.pkg.dev/PROJECT_ID/config-system/NAME:SHA`

### Stage 3 — Deploy

Also only runs on push to main, after build-push succeeds.

Steps:
1. **Authenticate to GCP** (same WIF approach)
2. **`get-gke-credentials`** — writes a kubeconfig so kubectl can talk to the GKE cluster
3. **Apply namespace** — `kubectl apply -f k8s/namespace.yaml` (idempotent, safe to re-run)
4. **Apply shared secrets** — injects real passwords from GitHub Secrets into the cluster using `kubectl create secret --dry-run=client -o yaml | kubectl apply -f -` (this trick makes it idempotent: creates on first run, updates on subsequent runs)
5. **Apply infra** — applies postgres, redis, neo4j manifests, then waits for each to be ready
6. **Deploy services** — uses `envsubst` to replace `${IMAGE_LOGIN}` etc. placeholders in the yaml files with real registry+sha URLs, then applies them
7. **Apply ingress** — sets up the GKE HTTP load balancer
8. **Wait for rollouts** — polls each deployment until all pods are healthy
9. **Print IP** — gets the external IP from the ingress

---

## 4. Authentication: Workload Identity Federation (WIF)

This is the trickiest part. WIF lets GitHub Actions prove its identity to GCP **without storing a secret JSON key** anywhere.

### The concept

Normally you'd create a service account key (a JSON file with a private key) and store it as a GitHub secret. The problem: keys are long-lived, can leak, and need manual rotation.

WIF replaces keys with OIDC tokens:

```
GitHub Actions runner
  │
  │ 1. GitHub generates a short-lived OIDC token
  │    (signed by GitHub, contains: repo, branch, workflow, etc.)
  │
  ▼
Google STS (Security Token Service)
  │
  │ 2. STS validates: "Is this token from a trusted GitHub org?"
  │    (checked against the WIF Pool + Provider config)
  │
  │ 3. STS issues a short-lived Google federated token
  │
  ▼
Google APIs (Artifact Registry, GKE, etc.)
  │
  │ 4. Google API checks: "Does this federated identity have permission?"
  │    (checked against IAM bindings on the project)
```

### Components you set up in GCP

| Component | What it is |
|---|---|
| **WIF Pool** (`github-pool`) | A container that holds trusted external identity providers |
| **WIF Provider** (inside the pool) | Configured with GitHub's OIDC issuer URL; maps GitHub token claims to Google attributes |
| **Attribute mapping** | Maps `assertion.repository_owner` → `attribute.repository_owner` so you can filter by org |
| **Attribute condition** | Only allows tokens where `repository_owner == 'NYCU-CloudNative26-ConfigSystem'` |

### Why no `service_account` in auth@v2?

The `google-github-actions/auth@v2` action has two modes:

**Mode A** (with `service_account`):
```
GitHub OIDC token → STS federated token → generateAccessToken → SA token
```
The last step (`generateAccessToken`) requires `roles/iam.serviceAccountTokenCreator` on the SA. This permission kept failing, so this mode doesn't work in this setup.

**Mode B** (without `service_account`, what we use):
```
GitHub OIDC token → STS federated token → [used directly]
```
The federated token is used directly. No SA impersonation. No `serviceAccountTokenCreator` needed.

The trade-off: the WIF pool principal (instead of a SA) needs to have permissions granted to it directly on the project.

### What IAM bindings are needed

| Role | Granted to | Used by |
|---|---|---|
| `roles/iam.workloadIdentityUser` | `principalSet://...POOL_ID/*` on the SA | allows WIF federation |
| `roles/artifactregistry.writer` | `principalSet://...POOL_ID/*` on the project | allows `docker push` |
| `roles/container.admin` | `principalSet://...POOL_ID/*` on the project | allows `get-gke-credentials` + kubectl |

### GitHub Secrets required

| Secret | What it is |
|---|---|
| `GCP_WIF_PROVIDER` | Full resource name: `projects/NUMBER/locations/global/workloadIdentityPools/POOL/providers/PROVIDER` |
| `GCP_PROJECT_ID` | Your GCP project ID (e.g. `my-project-123`) |
| `GH_PAT` | GitHub personal access token — needed to clone private submodule repos |
| `SECRET_KEY` | JWT signing secret (min 32 chars) |
| `ENCRYPTION_KEY` | AES-256 key (64 hex chars) |
| `POSTGRES_PASSWORD` | Postgres password injected into the k8s secret |
| `NEO4J_PASSWORD` | Neo4j password injected into the k8s secret |

---

## 5. Kubernetes Concepts Used Here

### Namespace (`config-system`)
A logical grouping. All resources in this project live in the `config-system` namespace. Namespaces prevent name collisions with other apps in the same cluster.

### ConfigMap vs Secret
- **ConfigMap** (`shared-config`): non-sensitive config. Stored as plain text. Contains: `REDIS_URL`.
- **Secret** (`shared-secrets`): sensitive values. Stored base64-encoded in etcd (and can be encrypted at rest). Contains: passwords, API keys, database URLs with passwords.

Pods reference these by name:
```yaml
env:
  - name: REDIS_URL
    valueFrom:
      configMapKeyRef: {name: shared-config, key: REDIS_URL}
  - name: SECRET_KEY
    valueFrom:
      secretKeyRef: {name: shared-secrets, key: SECRET_KEY}
```

### Deployment vs StatefulSet
- **Deployment** (login, config-table, ssot, frontend, redis): stateless. Pods can be killed and recreated anywhere. No persistent storage.
- **StatefulSet** (postgres, neo4j): stateful. Each pod gets a stable name (`postgres-0`) and its own PersistentVolumeClaim (PVC). The data survives pod restarts.

### Service types
- **ClusterIP** (default): internal only. Other pods in the cluster reach it by name (e.g., `http://service-login:8000`). Not accessible from outside.
- **NodePort** (frontend): exposes the pod on each node's IP at a random port. Used here because GKE's HTTP load balancer requires a NodePort backend for health checks.

### Ingress
```
Internet → GKE HTTP Load Balancer → Ingress → service-frontendui:3000
```
The GKE ingress (annotation `kubernetes.io/ingress.class: "gce"`) provisions a real Google Cloud HTTP load balancer with a public IP. All traffic for `path: /` goes to the Nuxt frontend.

### `envsubst` trick
The service YAML files contain placeholders like `${IMAGE_LOGIN}`. In the deploy step, the shell runs:
```bash
for f in k8s/services/*.yaml; do
  envsubst < "$f" | kubectl apply -f -
done
```
`envsubst` reads the file, substitutes every `${VAR}` with the value from the current shell environment, and prints the result. That result is piped directly to `kubectl apply`. This avoids Helm or Kustomize while still being able to inject dynamic values (the image SHA).

---

## 6. Local Development vs Production

| Aspect | docker-compose (local) | GKE (production) |
|---|---|---|
| Networking | Services talk via Docker network by container name | Services talk via Kubernetes DNS by service name |
| Secrets | Hardcoded in docker-compose.yml (for dev) | Injected from GitHub Secrets into k8s Secrets |
| Persistence | Named Docker volumes | PersistentVolumeClaims backed by GCP Persistent Disks |
| Ingress | Port mappings (`18000:8000`) | GKE HTTP Load Balancer with public IP |
| Auth | `SECRET_KEY` from `.env` file | `SECRET_KEY` from k8s Secret |

The service names are intentionally the same (`service-login`, `redis`, `postgres`, `neo4j`) so that environment variables like `DATABASE_URL=postgresql://user:pass@postgres:5432/...` work identically in both environments.

---

## 7. What Happens on a Typical Code Push

1. Developer pushes to a feature branch → only tests run (no build, no deploy)
2. Developer opens a PR to `main` → tests run again (CI check before merge)
3. PR is merged → GitHub triggers a push to `main`:
   - Tests run in parallel
   - All pass → build-push starts → 4 Docker images built and pushed to AR
   - build-push succeeds → deploy starts → 4 new image versions rolled out to GKE
   - GKE does a rolling update: old pod stays alive until new pod is healthy, then old pod is killed
   - Access URL printed at the end

---

## 8. Debugging Tips

### "Why is my pod crash-looping?"
```bash
kubectl get pods -n config-system
kubectl describe pod <pod-name> -n config-system
kubectl logs <pod-name> -n config-system --previous   # logs from crashed container
```

### "Why isn't the ingress getting an IP?"
```bash
kubectl describe ingress config-system-ingress -n config-system
```
GKE HTTP load balancers take ~5 minutes to provision. The "Events" section shows what's happening.

### "Why is a secret missing?"
The CI step that injects secrets uses `--dry-run=client -o yaml | kubectl apply -f -`. If the CI step didn't run (e.g., deploy was skipped), the secret won't exist. Apply manually:
```bash
kubectl create secret generic shared-secrets \
  --namespace=config-system \
  --from-literal=SECRET_KEY="..." \
  ...
  --dry-run=client -o yaml | kubectl apply -f -
```
(See `k8s/infra/secret.yaml` for the full command template.)

### "I want to check what's deployed"
```bash
kubectl get all -n config-system
kubectl get ingress -n config-system
```
