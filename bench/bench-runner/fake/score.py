import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
import results

LOG_DIR = results.BENCH.parent / ".log"


def main():
    rows, invalid, corrupt = results.load()
    LOG_DIR.mkdir(exist_ok=True)
    with open(LOG_DIR / "invocations.log", "a") as log:
        log.write(f"SCORE {int(time.time())} files={sum(map(len, rows.values()))} invalid={invalid}\n")
    if corrupt:
        sys.exit(f"corrupt result file: {corrupt[0]}")
    output = results.table(rows)
    (LOG_DIR / "score.out").write_text(output + "\n")
    print(output)


main()
