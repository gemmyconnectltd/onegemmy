from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api_router import api_router
from app.core.config import settings
from app.core.exceptions import AppError, app_error_handler
from app.core.logging import get_logger, setup_logging
from app.core.middleware import RequestLoggingMiddleware

log = get_logger("app")


def create_app() -> FastAPI:
    setup_logging()

    app = FastAPI(title="OneGemmy API", debug=settings.DEBUG)

    app.add_middleware(CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestLoggingMiddleware)

    app.add_exception_handler(AppError, app_error_handler)

    app.include_router(api_router)

    @app.on_event("startup")
    async def on_startup():
        log.info("app.startup", extra={"_extra_fields": {
            "environment": settings.ENVIRONMENT,
            "debug": settings.DEBUG,
            "log_level": settings.LOG_LEVEL,
        }})

    @app.on_event("shutdown")
    async def on_shutdown():
        log.info("app.shutdown")

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
