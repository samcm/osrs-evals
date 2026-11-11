#!/bin/sh
# start-world.sh: start rs-sdk's engine and gateway with the eval's world settings (passed as env), wait until up.
WORLD_FEED=true nohup /opt/server/entrypoint.sh > /run/out/world.log 2>&1 &
for i in $(seq 300); do
  bun -e "await fetch('http://localhost:8888/api/version')" 2>/dev/null && exit 0
  sleep 1
done
echo "world did not start" >&2; tail -50 /run/out/world.log >&2; exit 1
