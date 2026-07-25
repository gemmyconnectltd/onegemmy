import time
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger("onegemmy.access")


def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.time()
        response = await call_next(request)
        duration_ms = round((time.time() - start) * 1000, 1)

        user_id = "-"
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            from app.security import decode_access_token
            payload = decode_access_token(auth_header[7:])
            if payload:
                user_id = payload.get("sub", "-")

        logger.info(
            "%s %s %d %dms user=%s",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            user_id,
        )
        return response
