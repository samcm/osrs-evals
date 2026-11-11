#!/bin/sh
# each.sh <command...>: run a one-account program once per account in $EVAL, with ACCOUNT set to
# the account's index, and wait for all of them.
n=$(bun -e 'console.log((await Bun.file(process.env.EVAL).json()).accounts.length)')
i=0
while [ "$i" -lt "$n" ]; do
  ACCOUNT=$i "$@" &
  i=$((i + 1))
done
wait
