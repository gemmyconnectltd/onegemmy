import time
import uuid

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from app.core.logging import get_logger, request_id_var

log = get_logger("middleware")


def generate_request_id() -> str:
    return uuid.uuid4().hex


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        req_id = request.headers.get("X-Request-ID", generate_request_id())
        request_id_var.set(req_id)

        request.state.request_id = req_id

        start = time.perf_counter()

        log.info(
            "request.start",
            extra={"_extra_fields": {
                "method": request.method,
                "path": request.url.path,
                "query": str(request.query_params) if request.query_params else None,
                "client": request.client.host if request.client else None,
            }},
        )

        response: Response = await call_next(request)

        elapsed_ms = round((time.perf_counter() - start) * 1000, 2)

        status_code = response.status_code
        level = "INFO"
        if status_code >= 500:
            level = "ERROR"
        elif status_code >= 400:
            level = "WARNING"

        log.log(
            getattr(logging, level),
            "request.complete",
            extra={"_extra_fields": {
                "method": request.method,
                "path": request.url.path,
                "status_code": status_code,
                "elapsed_ms": elapsed_ms,
            }},
        )

        response.headers["X-Request-ID"] = req_id
        response.headers["X-Response-Time"] = f"{elapsed_ms}ms"

        return response


import logging
