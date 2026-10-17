"""Probe the local Pike server without using copied character credentials."""

import socket
import sys


port = int(sys.argv[1]) if len(sys.argv) > 1 else 15318
with socket.create_connection(("127.0.0.1", port), timeout=5) as connection:
    connection.settimeout(5)
    connection.sendall(b"who\n")
    response = connection.recv(4096).decode("utf-8", errors="replace")
    print(response.strip())
    if not response.startswith("991 "):
        raise SystemExit("Unexpected pre-login response")
