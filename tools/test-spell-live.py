#!/usr/bin/env python3
"""Exercise Pike's level-5 magic missile in an isolated temporary runtime."""

import secrets
import shutil
import socket
import subprocess
import tempfile
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / ".runtime" / "pike"


def wait_for_line(sock, pending, seen, predicate, seconds=10):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        while b"\n" in pending[0]:
            raw, pending[0] = pending[0].split(b"\n", 1)
            line = raw.decode("utf-8", "replace").strip()
            seen.append(line)
            if predicate(line):
                return line
        sock.settimeout(max(0.1, deadline - time.monotonic()))
        chunk = sock.recv(65536)
        if not chunk:
            raise ConnectionError("Pike closed the test connection")
        pending[0] += chunk
    raise TimeoutError("Pike did not send the expected reply")


def main():
    if not (SOURCE / "servd.pike").exists():
        raise RuntimeError("Prepare the Pike runtime first")
    with tempfile.TemporaryDirectory(prefix="spell-test-", dir=ROOT / ".runtime") as temporary:
        runtime = Path(temporary) / "pike"
        shutil.copytree(SOURCE, runtime, ignore=lambda directory, names:
                        {"players", "server.pid"} if Path(directory) == SOURCE else set())
        (runtime / "players").mkdir()

        # Only this temporary copy starts outside the church's no-fight area.
        game = runtime / "game.pike"
        original = game.read_text()
        prefix, suffix = original.split("void find_free_spot(object who) {", 1)
        for before, after in (("x=150;\n  z=150;", "x=50;\n  z=50;"),
                              ("if(x>160)", "if(x>60)"),
                              ("x=150;\n        z++", "x=50;\n        z++")):
            if before not in suffix:
                raise RuntimeError(f"Temporary spawn patch no longer matches: {before}")
            suffix = suffix.replace(before, after, 1)
        game.write_text(prefix + "void find_free_spot(object who) {" + suffix)

        name = "SpellTest"
        password = secrets.token_hex(32)
        (runtime / "players" / f"{name}.o").write_text(
            f"name={name}\npassword={password}\ngender=1\n"
            "model=brwm.ani\ntexture=woman8_.tm2\nlevel=5\n")
        with socket.socket() as reserve:
            reserve.bind(("127.0.0.1", 0))
            port = reserve.getsockname()[1]
        with (Path(temporary) / "pike.log").open("wb") as log:
            server = subprocess.Popen(["pike", "servd.pike", str(port)], cwd=runtime,
                                      stdout=log, stderr=subprocess.STDOUT)
            try:
                for _ in range(50):
                    try:
                        connection = socket.create_connection(("127.0.0.1", port), timeout=0.2)
                        break
                    except OSError:
                        if server.poll() is not None:
                            raise RuntimeError("Isolated Pike exited during startup")
                        time.sleep(0.1)
                else:
                    raise RuntimeError("Isolated Pike did not listen")
                with connection:
                    pending = [b""]
                    seen = []
                    connection.sendall(f"login {name} {password}\n".encode())
                    wait_for_line(connection, pending, seen, lambda line: line.startswith("005 "))
                    if not any(line.startswith("000 Welcome") for line in seen):
                        wait_for_line(connection, pending, seen,
                                      lambda line: line.startswith("000 Welcome"))
                    connection.sendall(b"score\n")
                    wait_for_line(connection, pending, seen, lambda line: line == "016 COR level: 5")
                    before_spell = len(seen)
                    connection.sendall(b"spell east\n")
                    wait_for_line(connection, pending, seen,
                                  lambda line: line.startswith("015 REMOVE spell"), seconds=5)
                    spell_lines = seen[before_spell:]
                    named = [line.split()[2] for line in spell_lines
                             if line.startswith("001 NAME spell")]
                    if len(named) != 1:
                        raise RuntimeError("Expected one new spell projectile")
                    projectile = named[0]
                    checks = {
                        "successful cast": any("cast magic missile" in line for line in spell_lines),
                        "launch and destination": sum(line.startswith(f"003 LOCATE {projectile} ")
                                                      for line in spell_lines) == 2,
                        "rotation": f"017 ROTATEY {projectile}" in spell_lines,
                        "speed": f"022 SPEED {projectile} 3" in spell_lines,
                        "removal": f"015 REMOVE {projectile}" in spell_lines,
                    }
                    failed = [label for label, good in checks.items() if not good]
                    if failed:
                        raise RuntimeError("Spell protocol missing: " + ", ".join(failed))
                    print("Isolated level-5 Pike spell: cast, two positions, rotation, speed, removal OK")
            finally:
                server.terminate()
                try:
                    server.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait(timeout=5)


if __name__ == "__main__":
    main()
