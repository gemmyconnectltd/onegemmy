"""Start the FastAPI dev server, picking a free port if 8000 is already taken.

`fastapi dev` (uvicorn underneath) has no built-in fallback like Next.js does —
it just fails with "address already in use" if the port is busy. This finds
the first free port at or after --port and starts there instead, so starting
a second dev instance never requires killing whatever's already running.

Usage: uv run python scripts/dev.py [--port 8000]
"""
import argparse
import os
import socket


def find_free_port(start: int, attempts: int = 20) -> int:
    for port in range(start, start + attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError(f"No free port found in range {start}-{start + attempts - 1}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000, help="Preferred port (default: 8000)")
    args, extra = parser.parse_known_args()

    port = find_free_port(args.port)
    if port != args.port:
        # flush explicitly: os.execvp replaces the process image without
        # running Python's normal buffered-stdout flush on exit.
        print(f"Port {args.port} is in use — starting on {port} instead.", flush=True)

    os.execvp("fastapi", ["fastapi", "dev", "app/main.py", "--port", str(port), *extra])


if __name__ == "__main__":
    main()
