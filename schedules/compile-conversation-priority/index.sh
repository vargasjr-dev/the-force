#!/bin/sh
set -eu

PLUGIN_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
exec bun "$PLUGIN_DIR/scripts/compile-conversation-priority.ts"
