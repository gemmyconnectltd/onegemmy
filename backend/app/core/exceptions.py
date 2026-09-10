from fastapi import Request, status
from fastapi.responses import JSONResponse

from app.core.logging import get_logger
from app.core.response import error_response

log = get_logger("exceptions")


class AppError(Exception):
    status_code: int = status.HTTP_400_BAD_REQUEST
    detail: str = "Something went wrong"

    def __init__(self, detail: str | None = None, status_code: int | None = None):
        self.detail = detail or self.detail
        self.status_code = status_code or self.status_code


class NotFoundError(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    detail = "Resource not found"


class ConflictError(AppError):
    status_code = status.HTTP_409_CONFLICT
    detail = "Resource already exists"


class UnauthorizedError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    detail = "Not authenticated"


class ForbiddenError(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    detail = "Not permitted to perform this action"


class ValidationError(AppError):
    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT
    detail = "Validation error"


class QuotaExceededError(AppError):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    detail = "Usage limit exceeded"


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    log.warning(
        "app.error",
        extra={"_extra_fields": {
            "status_code": exc.status_code,
            "detail": exc.detail,
            "path": request.url.path,
            "method": request.method,
        }},
    )
    return error_response(message=exc.detail, status_code=exc.status_code)


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catches anything AppError doesn't (DB errors, bugs, etc). Without this,
    FastAPI/Starlette falls through to its default handler, which in debug
    mode returns the full traceback — file paths, SQL, table/column names —
    to whoever sent the request. Always log the real detail server-side and
    only ever return a generic message to the client.
    """
    log.exception(
        "app.unhandled_error",
        extra={"_extra_fields": {
            "path": request.url.path,
            "method": request.method,
            "exception_type": type(exc).__name__,
        }},
    )
    return error_response(message="Internal server error", status_code=500)
