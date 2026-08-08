# Deploying Money Hater to Kubernetes

## Prerequisites

1. A Kubernetes cluster with an ingress controller (manifests assume `nginx`).
2. The **CloudNativePG operator** installed cluster-wide:
   ```bash
   kubectl apply --server-side -f \
     https://raw.githubusercontent.com/cloudnative-pg/cloudnative-pg/release-1.25/releases/cnpg-1.25.0.yaml
   ```
3. The application image pushed somewhere the cluster can pull
   (`docker build -t ghcr.io/jeeyo/money-hater:latest . && docker push …`).

## Deploy

```bash
# 1. Namespace + database + storage + app
kubectl apply -k deploy/

# 2. Application secrets (after the namespace exists)
kubectl -n money-hater create secret generic money-hater-secrets \
  --from-literal=JWT_SECRET="$(openssl rand -hex 32)" \
  --from-literal=OPENAI_API_KEY="sk-..." \
  --from-literal=GOOGLE_MAPS_API_KEY="AIza..."
```

Edit `ingress.yaml` for your hostname/TLS before applying, and set the image
tag in `kustomization.yaml`.

## How the pieces fit

- **`postgres-cluster.yaml`** — a CloudNativePG `Cluster` (2 instances, 10Gi).
  The operator provisions the `moneyhater` database and writes the app user's
  connection URI into Secret **`money-hater-db-app`** (key `uri`); the
  Deployment reads `DATABASE_URL`/`QUEUE_DATABASE_URL` from it. The backend
  rewrites the URI for its two drivers (asyncpg for the app, psycopg for the
  Procrastinate queue) automatically.
- **`media-pvc.yaml`** — filesystem storage for originals + thumbnails.
  Postgres stores metadata only, so the CNPG backups stay small; back up the
  PVC with your volume snapshot tooling.
- **`deployment.yaml`** — one pod with:
  - an **initContainer** running `alembic upgrade head` + the Procrastinate
    schema (idempotent, safe on every rollout);
  - the **api** container (FastAPI serving `/api` and the built SPA);
  - the **worker** container (image analysis pipeline).
  api + worker are colocated deliberately: a ReadWriteOnce PVC can only be
  mounted by one node. `strategy: Recreate` prevents rollouts from deadlocking
  on the volume.
- Vision analysis (OpenAI) and place naming (Google) degrade gracefully: leave
  either key empty in the secret and the rest keeps working.

## Scaling up later

Single-pod is plenty for personal use. To scale horizontally:

1. Move the media PVC to a ReadWriteMany StorageClass (NFS, CephFS, EFS, …) —
   or swap `app/services/storage.py` for S3/MinIO.
2. Split `worker` into its own Deployment and raise `replicas` on both — the
   Procrastinate queue already coordinates competing workers through Postgres.
3. Add CNPG `backup:` config (see comments in `postgres-cluster.yaml`).

## Ops quick reference

```bash
kubectl -n money-hater get cluster money-hater-db     # database health
kubectl -n money-hater logs deploy/money-hater -c worker -f
kubectl -n money-hater exec -it money-hater-db-1 -- psql moneyhater
```
