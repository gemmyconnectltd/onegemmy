from typing import Any

from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse


def success_response(
    data: Any = None,
    message: str = "Success",
    status_code: int = 200
):
    return JSONResponse(
        status_code=status_code,
        content=jsonable_encoder({
            "success": True,
            "message": message,
            "data": data
        })
    )


def paginated_response(
    items: list,
    total: int,
    page: int,
    page_size: int,
    message: str = "Success"
):
    return JSONResponse(
        status_code=200,
        content=jsonable_encoder({
            "success": True,
            "message": message,
            "data": {
                "items": items,
                "total": total,
                "page": page,
                "page_size": page_size,
                "total_pages": -(-total // page_size) if page_size else 0,
            }
        })
    )


def error_response(
    message: str,
    status_code: int = 400,
    errors: Any = None
):
    return JSONResponse(
        status_code=status_code,
        content=jsonable_encoder({
            "success": False,
            "message": message,
            "errors": errors
        })
    )