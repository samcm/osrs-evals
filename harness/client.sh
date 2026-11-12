#!/bin/sh
# client.sh: log one account in with rs-sdk's headless client, attached to the gateway; wait until it is in game.
# The log is appended to, so a re-login (between attempts) waits for its own "logged into" line.
log="/run/out/client-$1.log"
before=$(grep -c "logged into" "$log" 2>/dev/null || echo 0)
cd /opt/server/webclient
nohup bun src/lite/runner.ts "$1" >> "$log" 2>&1 &
echo $! >> /run/out/clients.pid
for i in $(seq 90); do
  [ "$(grep -c "logged into" "$log")" -gt "$before" ] && exit 0
  sleep 1
done
echo "client $1 did not log in" >&2; tail -20 "$log" >&2; exit 1
