from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.config import settings
from app.database import engine, Base, SessionLocal
from app.api.v1.router import router as v1_router
from app.seed import seed_all
from app.middleware import RequestLoggingMiddleware, setup_logging

setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_all(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="OneGemmy API",
    description="All-in-One Business Management Platform API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(CORSMiddleware, **{
    "allow_origins": settings.cors_origins_list,
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
})

app.add_middleware(RequestLoggingMiddleware)

app.include_router(v1_router, prefix="/api/v1")


@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": "OneGemmy", "version": "1.0.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
