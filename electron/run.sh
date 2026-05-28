#!/bin/bash

# Legacy arguments.txt is still written for back-compat, but args are now also
# forwarded on the electron CLI so electron/main.js can re-inject them into the
# renderer's process.argv (see scripts/core/app_argv.ts).
echo $* > arguments.txt
electron main.js "$@"


