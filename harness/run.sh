#!/bin/sh
# run.sh <command>: start the program in its own process group (so stop.sh stops all of it) with its
# output in /run/out/program.log, record its exit code in /run/program.exit, and return at once.
mkdir -p /run/out/program
nohup sh -c '
  setsid sh -c "$1" > /run/out/program.log 2>&1 &
  echo $! > /run/program.pid
  wait $!
  echo $? > /run/program.exit
' _ "$1" > /dev/null 2>&1 &
while [ ! -s /run/program.pid ]; do sleep 0.1; done
