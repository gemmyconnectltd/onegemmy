#!/bin/bash
# PROPOSED replacement for ~/apps/onegemmy/deploy.sh once the website / app / admin split is live.
# Same safety rules as before (one Alembic head, health checks, stops on the first failure) plus three frontends:
#   website  -> pesaa.io        (website/)
#   app      -> app.pesaa.io    (frontend/  - the customer ERP/POS, formerly served at pesaa.io)
#   admin    -> admin.pesaa.io  (super-admin/)
# The mobile app is no longer deployed by this script.
set -e

ROOT="$HOME/apps/onegemmy"
TARGET="${1:-all}"

echo "======================================"
echo "🚀 PESAA Deployment"
echo "Target: $TARGET"
echo "======================================"

case "$TARGET" in
    backend|website|app|admin|staging-backend|staging-website|staging-app|staging-admin|staging|production|all)
        ;;
    frontend|staging-frontend)
        echo "❌ '$TARGET' was split into separate sites:"
        echo "   website -> pesaa.io | app -> app.pesaa.io | admin -> admin.pesaa.io"
        echo "   (staging: staging-website | staging-app | staging-admin)"
        exit 1
        ;;
    *)
        echo "❌ Invalid option: $TARGET"
        echo
        echo "Usage:"
        echo "  ./deploy.sh backend | website | app | admin"
        echo "  ./deploy.sh staging-backend | staging-website | staging-app | staging-admin"
        echo "  ./deploy.sh staging      (staging backend + website + app + admin)"
        echo "  ./deploy.sh production   (backend + website + app + admin)"
        echo "  ./deploy.sh all          (staging, then production)"
        exit 1
        ;;
esac

cd "$ROOT"

echo
echo "📥 Pulling latest code..."
git pull origin main

echo
echo "🔎 Checking Alembic migration tree..."
cd "$ROOT/backend"

HEAD_OUTPUT=$(docker run --rm     -v "$ROOT/backend:/app"     -w /app     --entrypoint sh     onegemmy-staging-api     -c "uv run alembic heads" 2>&1) || {
    echo "❌ Could not inspect Alembic migrations:"
    echo "$HEAD_OUTPUT"
    exit 1
}

HEAD_COUNT=$(printf "%s\n" "$HEAD_OUTPUT" | grep -c "(head)" || true)

if [ "$HEAD_COUNT" -ne 1 ]; then
    echo
    echo "❌ DEPLOYMENT BLOCKED"
    echo "Alembic must have exactly ONE migration head."
    echo
    echo "$HEAD_OUTPUT"
    echo
    echo "Fix the migration branches in Git before deployment."
    echo "The existing application has NOT been rebuilt or restarted."
    exit 1
fi

echo "✅ Alembic OK: exactly one migration head."
echo "$HEAD_OUTPUT"
cd "$ROOT"


# wait_for_200 <url> <label> <container> — polls up to <tries> times; prints the container log and stops on failure.
wait_for_200() {
    local url="$1" label="$2" container="$3" tries="${4:-15}" status=000
    echo "⏳ Checking $label..."
    for _ in $(seq 1 "$tries"); do
        sleep 2
        status=$(curl -s -o /dev/null -w "%{http_code}" "$url" || true)
        [ "$status" = "200" ] && break
    done
    echo "$label HTTP: $status"
    if [ "$status" != "200" ]; then
        echo "❌ $label health check failed"
        docker logs "$container" --tail 100
        exit 1
    fi
}


deploy_backend() {
    echo
    echo "🐍 Deploying PRODUCTION BACKEND..."
    cd "$ROOT/backend"
    APP_ENV_FILE=.env.production \
    docker compose -p onegemmy-production -f docker-compose.prod.yml up -d --build
    wait_for_200 https://api.pesaa.io/health "Production backend" onegemmy-production-api-1 30
    echo "✅ Production backend deployed"
}

deploy_website() {
    echo
    echo "🌐 Deploying PRODUCTION WEBSITE (pesaa.io)..."
    cd "$ROOT/website"
    docker compose -p pesaa-website -f docker-compose.prod.yml up -d --build
    wait_for_200 https://pesaa.io "Production website" pesaa-website-website-1
    echo "✅ Production website deployed"
}

deploy_app() {
    echo
    echo "🧾 Deploying PRODUCTION APP (app.pesaa.io)..."
    cd "$ROOT/frontend"
    docker compose -p onegemmy-frontend -f docker-compose.prod.yml up -d --build
    wait_for_200 https://app.pesaa.io "Production app" onegemmy-frontend-frontend-1
    echo "✅ Production app deployed"
}

deploy_admin() {
    echo
    echo "🛡️  Deploying PRODUCTION ADMIN (admin.pesaa.io)..."
    cd "$ROOT/super-admin"
    docker compose -p pesaa-admin -f docker-compose.prod.yml up -d --build
    wait_for_200 https://admin.pesaa.io/login "Production admin" pesaa-admin-admin-1
    echo "✅ Production admin deployed"
}


deploy_staging_backend() {
    echo
    echo "🧪 Deploying STAGING BACKEND..."
    cd "$ROOT/backend"
    APP_ENV_FILE=.env.staging \
    docker compose -p onegemmy-staging -f docker-compose.prod.yml up -d --build --force-recreate

    echo "⏳ Checking staging backend..."
    local api_status=000
    for _ in $(seq 1 30); do
        sleep 2
        api_status=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8001/health || true)
        [ "$api_status" = "200" ] && break
    done
    echo "Local API HTTP: $api_status"
    if [ "$api_status" != "200" ]; then
        echo "❌ Staging backend health check failed"
        docker logs onegemmy-staging-api-1 --tail 150
        exit 1
    fi

    local public_status
    public_status=$(curl -s -o /dev/null -w "%{http_code}" https://api-staging.pesaa.io/health || true)
    echo "Public API HTTP: $public_status"
    if [ "$public_status" != "200" ]; then
        echo "❌ Public staging API health check failed"
        docker logs onegemmy-staging-api-1 --tail 100
        exit 1
    fi
    echo "✅ Staging backend deployed"
}

deploy_staging_website() {
    echo
    echo "🧪 Deploying STAGING WEBSITE (staging.pesaa.io)..."
    cd "$ROOT/website"
    docker compose -p pesaa-website-staging -f docker-compose.staging.yml up -d --build --force-recreate
    wait_for_200 https://staging.pesaa.io "Staging website" pesaa-website-staging-website-1
    echo "✅ Staging website deployed"
}

deploy_staging_app() {
    echo
    echo "🧪 Deploying STAGING APP (staging-app.pesaa.io)..."
    cd "$ROOT/frontend"
    docker compose -p onegemmy-frontend-staging -f docker-compose.staging.yml up -d --build --force-recreate
    wait_for_200 https://staging-app.pesaa.io "Staging app" onegemmy-frontend-staging-frontend-1
    echo "✅ Staging app deployed"
}

deploy_staging_admin() {
    echo
    echo "🧪 Deploying STAGING ADMIN (staging-admin.pesaa.io)..."
    cd "$ROOT/super-admin"
    docker compose -p pesaa-admin-staging -f docker-compose.staging.yml up -d --build --force-recreate
    wait_for_200 https://staging-admin.pesaa.io/login "Staging admin" pesaa-admin-staging-admin-1
    echo "✅ Staging admin deployed"
}


case "$TARGET" in
    backend)          deploy_backend ;;
    website)          deploy_website ;;
    app)              deploy_app ;;
    admin)            deploy_admin ;;
    staging-backend)  deploy_staging_backend ;;
    staging-website)  deploy_staging_website ;;
    staging-app)      deploy_staging_app ;;
    staging-admin)    deploy_staging_admin ;;
    staging)
        deploy_staging_backend
        deploy_staging_website
        deploy_staging_app
        deploy_staging_admin
        ;;
    production)
        deploy_backend
        deploy_website
        deploy_app
        deploy_admin
        ;;
    all)
        deploy_staging_backend
        deploy_staging_website
        deploy_staging_app
        deploy_staging_admin
        deploy_backend
        deploy_website
        deploy_app
        deploy_admin
        ;;
esac


echo
echo "📦 Running PESAA containers:"
docker ps --format "table {{.Names}}\t{{.Status}}" | \
grep -E "NAMES|onegemmy|pesaa"

echo
echo "======================================"
echo "🎉 DEPLOYMENT COMPLETE"
echo "======================================"
