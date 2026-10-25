from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.errors import ServerErrorMiddleware

from app.api_router import api_router
from app.core.config import settings
from app.core.exceptions import AppError, app_error_handler, unhandled_exception_handler
from app.core.logging import get_logger, setup_logging
from app.core.middleware import RequestLoggingMiddleware

UPLOADS_DIR = Path(settings.UPLOAD_DIR).resolve()
STATIC_DIR = Path(__file__).resolve().parent / "static"

log = get_logger("app")


def create_app() -> FastAPI:
    setup_logging()

    app = FastAPI(
        title="Pesaa API",
        debug=settings.DEBUG,
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None if settings.is_production else "/redoc",
        openapi_url=None if settings.is_production else "/openapi.json",
    )

    app.add_middleware(RequestLoggingMiddleware)
    # Handle failures inside CORS so browsers can read the JSON error envelope.
    # Starlette’s outer error handler otherwise sends 500s without CORS headers.
    app.add_middleware(
        ServerErrorMiddleware, handler=unhandled_exception_handler, debug=False,
    )
    cors_origins = settings.cors_origins_list
    is_wildcard = "*" in cors_origins
    app.add_middleware(CORSMiddleware,
        allow_origins=[] if is_wildcard else cors_origins,
        allow_origin_regex=r".*" if is_wildcard else settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")
    # Bundled (non-user-uploaded) assets, e.g. per-industry default product images.
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

    app.include_router(api_router)

    @app.on_event("startup")
    async def on_startup():
        log.info("app.startup", extra={"_extra_fields": {
            "environment": settings.ENVIRONMENT,
            "debug": settings.DEBUG,
            "log_level": settings.LOG_LEVEL,
        }})

        from app.modules.support import background as support_background

        app.state.support_task = support_background.start()

        from app.modules.marketing import background as marketing_background

        app.state.marketing_task = marketing_background.start()

    @app.on_event("shutdown")
    async def on_shutdown():
        for name in ("marketing_task",):
            if t := getattr(app.state, name, None):
                t.cancel()
        task = getattr(app.state, "support_task", None)
        if task:
            task.cancel()
        log.info("app.shutdown")

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
