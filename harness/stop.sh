#!/bin/sh
# stop.sh: SIGTERM the program's process group, SIGKILL it 10 s later if it is still there.
pid=$(cat /run/program.pid)
kill -TERM -"$pid" 2>/dev/null
for i in $(seq 100); do
  kill -0 -"$pid" 2>/dev/null || break
  sleep 0.1
done
kill -KILL -"$pid" 2>/dev/null
for i in $(seq 20); do [ -s /run/program.exit ] && exit 0; sleep 0.1; done
