"""Create and log in a disposable local test character; print no credentials."""

from pathlib import Path
import secrets
import socket
import sys


ROOT = Path(__file__).resolve().parents[1]
PLAYERS = ROOT / ".runtime" / "pike" / "players"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 15318
name = "Probe" + secrets.token_hex(4)
credential = secrets.token_urlsafe(32)
PLAYERS.mkdir(parents=True, exist_ok=True)
save = PLAYERS / f"{name}.o"
with save.open("x", encoding="ascii", newline="\n") as output:
    output.write(f"name={name}\npassword={credential}\ngender=1\n")

with socket.create_connection(("127.0.0.1", PORT), timeout=5) as connection:
    connection.settimeout(5)
    connection.sendall(f"login {name} {credential}\n".encode("ascii"))
    received = bytearray()
    while len(received) < 2_000_000:
        chunk = connection.recv(65536)
        if not chunk:
            break
        received.extend(chunk)
        if b"005 Description end\n" in received and b"000 Welcome\n" in received:
            break
    response = received.decode("utf-8", errors="replace")
    codes = [line[:3] for line in response.splitlines() if len(line) >= 3 and line[:3].isdigit()]
    print(f"character={name} first_code={codes[0] if codes else 'none'} welcome={'000' in codes} lines={len(codes)} description_end={'005' in codes}")
    if "000" not in codes or "005" not in codes:
        raise SystemExit("Local login/room snapshot did not complete")
