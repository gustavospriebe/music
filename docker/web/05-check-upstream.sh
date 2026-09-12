#!/bin/sh
set -eu

# Only an origin belongs here; a path would replace the private API request path.
if ! printf '%s' "${API_UPSTREAM:-}" | grep -Eq '^https?://[a-zA-Z0-9.-]+(:[0-9]{1,5})?$'; then
  echo 'API_UPSTREAM must be an HTTP(S) origin without a path.' >&2
  exit 1
fi
