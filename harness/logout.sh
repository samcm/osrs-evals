#!/bin/sh
# logout.sh: stop the headless clients; the engine saves each account once it drops the session.
kill $(cat /run/out/clients.pid) 2>/dev/null
sleep 45
