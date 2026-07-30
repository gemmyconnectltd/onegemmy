import json
import logging
import sys
import traceback
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

from app.core.config import settings

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)


class colored:
    HEADER = "\033[95m"
    BLUE = "\033[94m"
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RESET = "\033[0m"


LEVEL_COLORS = {
    "DEBUG": colored.CYAN,
    "INFO": colored.GREEN,
    "WARNING": colored.YELLOW,
    "ERROR": colored.RED,
    "CRITICAL": colored.RED + colored.BOLD,
}


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_entry: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        req_id = request_id_var.get()
        if req_id:
            log_entry["request_id"] = req_id

        if record.exc_info and record.exc_info[0] is not None:
            log_entry["exception"] = {
                "type": record.exc_info[0].__name__,
                "message": str(record.exc_info[1]),
                "traceback": traceback.format_exception(*record.exc_info),
            }

        extra_fields = getattr(record, "_extra_fields", {})
        if extra_fields:
            log_entry["extra"] = extra_fields

        return json.dumps(log_entry, default=str)


class ConsoleFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        ts = datetime.fromtimestamp(record.created, tz=UTC).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        level_color = LEVEL_COLORS.get(record.levelname, "")
        name_color = colored.DIM

        req_id = request_id_var.get()
        req_part = f" {colored.DIM}[{req_id[:8]}]{colored.RESET}" if req_id else ""

        msg = record.getMessage()

        parts = [
            f"{colored.DIM}{ts}{colored.RESET}",
            f"{level_color}{record.levelname:<8}{colored.RESET}",
            f"{name_color}{record.name}{colored.RESET}{req_part}",
            msg,
        ]

        if record.exc_info and record.exc_info[0] is not None:
            exc_lines = traceback.format_exception(*record.exc_info)
            parts.append("".join(exc_lines))

        return " ".join(parts)


def setup_logging() -> None:
    root = logging.getLogger()
    root.setLevel(settings.LOG_LEVEL.upper())

    for h in list(root.handlers):
        root.removeHandler(h)

    if settings.LOG_FORMAT == "json":
        formatter: logging.Formatter = JSONFormatter()
    else:
        formatter = ConsoleFormatter()

    console = logging.StreamHandler(sys.stdout)
    console.setLevel(settings.LOG_LEVEL.upper())
    console.setFormatter(formatter)
    root.addHandler(console)

    if settings.LOG_FILE:
        file_handler = logging.FileHandler(settings.LOG_FILE, encoding="utf-8")
        file_handler.setLevel(settings.LOG_LEVEL.upper())
        file_handler.setFormatter(JSONFormatter())
        root.addHandler(file_handler)

    for noisy in ("httpcore", "httpx", "uvicorn.access", "urllib3"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    logging.getLogger("uvicorn").setLevel(logging.INFO)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(f"onegemmy.{name}")
