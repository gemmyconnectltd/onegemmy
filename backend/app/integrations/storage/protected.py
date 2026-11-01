"""Private documents share the upload volume but are never publicly served."""
import posixpath

from starlette.exceptions import HTTPException
from starlette.staticfiles import StaticFiles


class PublicUploads(StaticFiles):
    async def get_response(self, path: str, scope):
        if posixpath.normpath(path).lstrip("/").split("/")[0] == "private":
            raise HTTPException(status_code=404)
        return await super().get_response(path, scope)
