#!/usr/bin/env bash
# usage: run.sh <case> <provider/model:effort> <rep>
exec python3 "$(dirname "$0")/lib/client.py" "$@"
