"""Verify that SIGTERM saves a connected player before the Pike process exits."""

from pathlib import Path
import signal
import socket
import subprocess
import tempfile
import time


root = Path(__file__).resolve().parents[1] / ".runtime" / "pike"
name = "CodexShutdownProbe"
path = root / "players" / f"{name}.o"
if path.exists():
    raise RuntimeError("Refusing to overwrite an existing test character")
path.write_text(f"name={name}\npassword=testonly\ngender=1\n", encoding="ascii")
process = None
try:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    with tempfile.TemporaryFile() as log:
        process = subprocess.Popen(["pike", "servd.pike", str(port)], cwd=root,
                                   stdout=log, stderr=log)
        for _ in range(100):
            try:
                connection = socket.create_connection(("127.0.0.1", port), timeout=0.5)
                break
            except OSError:
                if process.poll() is not None:
                    raise RuntimeError("Pike exited before accepting connections")
                time.sleep(0.05)
        else:
            raise RuntimeError("Pike did not start")
        with connection:
            connection.settimeout(5)
            connection.sendall(f"login {name} testonly\n".encode("ascii"))
            response = connection.recv(4096)
            if name.encode("ascii") not in response:
                raise RuntimeError(f"Login failed: {response!r}")
            process.send_signal(signal.SIGTERM)
            if process.wait(timeout=10) != 0:
                raise RuntimeError("Pike shutdown failed")
            saved = path.read_text(encoding="latin-1")
            if "hp=" not in saved or "password=testonly\n" not in saved:
                raise RuntimeError("Connected player was not saved")
        print("Pike SIGTERM saved the connected player and exited")
finally:
    if process is not None and process.poll() is None:
        process.kill()
        process.wait()
    path.unlink(missing_ok=True)
