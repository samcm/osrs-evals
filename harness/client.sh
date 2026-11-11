#!/bin/sh
# client.sh: log one account in with rs-sdk's headless client, attached to the gateway; wait until it is in game.
cd /opt/server/webclient
nohup bun src/lite/runner.ts "$1" > "/run/out/client-$1.log" 2>&1 &
echo $! >> /run/out/clients.pid
for i in $(seq 90); do
  grep -q "logged into" "/run/out/client-$1.log" && exit 0
  sleep 1
done
echo "client $1 did not log in" >&2; cat "/run/out/client-$1.log" >&2; exit 1
