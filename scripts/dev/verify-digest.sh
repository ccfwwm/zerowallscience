#!/usr/bin/env bash
# Portable SHA-256 verification for the bundled sidecars and asset packs.
#
# The fetch-*.sh scripts source this file and call verify_pinned_digest after
# every download; a mismatch or a missing pin aborts the build before the bytes
# can reach an installer. Pins live in one auditable place:
# scripts/dev/sidecar-lock.txt (which also documents how to add/bump one).
#
# Usage as a library:
#   . "$(dirname "$0")/verify-digest.sh"
#   verify_pinned_digest <artifact> <version> <target|any> <file>
#
# Usage as a CLI, to obtain a digest when pinning a new artifact:
#   bash scripts/dev/verify-digest.sh --print <file>
set -euo pipefail

# Resolve the lockfile relative to this script so callers need not know the path.
_VERIFY_DIGEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIDECAR_LOCKFILE="${SIDECAR_LOCKFILE:-$_VERIFY_DIGEST_DIR/sidecar-lock.txt}"

# Print the lowercase hex SHA-256 of "$1".
#
# No single tool is present everywhere: sha256sum is missing on stock macOS,
# shasum is missing on some minimal Linux images and on Windows git-bash
# installs without core_perl, so try each in turn and fall back to openssl,
# then to certutil (always present on Windows), then to node. All branches are
# normalized to bare lowercase hex.
sha256_of() {
  local file="$1" out=""
  if [ ! -f "$file" ]; then
    echo "verify-digest: no such file: $file" >&2
    return 1
  fi

  if command -v sha256sum >/dev/null 2>&1; then
    out="$(sha256sum "$file")"
    out="${out%% *}"
  elif command -v shasum >/dev/null 2>&1; then
    out="$(shasum -a 256 "$file")"
    out="${out%% *}"
  elif command -v openssl >/dev/null 2>&1; then
    # "SHA2-256(file)= <hex>" (OpenSSL 3) or "SHA256(file)= <hex>" (1.x).
    out="$(openssl dgst -sha256 "$file")"
    out="${out##*= }"
  elif command -v certutil >/dev/null 2>&1; then
    # certutil prints a banner, the hex digest on its own line, then a footer.
    # Older versions space-separate the hex bytes, so strip whitespace and CRs.
    out="$(certutil -hashfile "$file" SHA256 | sed -n '2p' | tr -d ' \r\n')"
  elif command -v node >/dev/null 2>&1; then
    out="$(node -e 'const c=require("crypto"),f=require("fs");const h=c.createHash("sha256");h.update(f.readFileSync(process.argv[1]));console.log(h.digest("hex"))' "$file")"
  else
    echo "verify-digest: found no SHA-256 tool (need one of: sha256sum, shasum, openssl, certutil, node)" >&2
    return 1
  fi

  # Lowercase (certutil emits uppercase) and drop any stray CR.
  out="$(printf '%s' "$out" | tr 'A-F' 'a-f' | tr -d ' \r\n')"

  case "$out" in
    [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ;;
    *)
      echo "verify-digest: could not compute a SHA-256 for $file (got: '$out')" >&2
      return 1 ;;
  esac

  printf '%s\n' "$out"
}

# Look up the pinned digest for <artifact> <version> <target>. Prints the digest,
# or nothing when there is no matching row.
lookup_pinned_digest() {
  local artifact="$1" version="$2" target="$3"
  [ -f "$SIDECAR_LOCKFILE" ] || {
    echo "verify-digest: lockfile not found: $SIDECAR_LOCKFILE" >&2
    return 1
  }
  # Strip comments/blank lines, then match the three key fields exactly.
  awk -v a="$artifact" -v v="$version" -v t="$target" '
    { sub(/#.*/, "") }
    $1 == a && $2 == v && $3 == t { print $4; found = 1; exit }
    END { if (!found) exit 0 }
  ' "$SIDECAR_LOCKFILE"
}

# Verify <file> against the pin for <artifact> <version> <target>.
# Exits non-zero (aborting the caller, which runs under `set -e`) when the pin
# is missing or the digest does not match.
verify_pinned_digest() {
  local artifact="$1" version="$2" target="$3" file="$4"
  local pinned actual

  pinned="$(lookup_pinned_digest "$artifact" "$version" "$target")"

  if [ -z "$pinned" ]; then
    actual="$(sha256_of "$file")" || actual="<could not compute>"
    cat >&2 <<EOF

ERROR: no pinned SHA-256 for $artifact $version ($target).

  Refusing to bundle an unverified download. Every artifact a build fetches off
  the network must be pinned in:
    $SIDECAR_LOCKFILE

  A maintainer pins it by adding this line to that lockfile, AFTER confirming
  the digest against a checksum published by upstream for this exact release
  (see the HOW TO ADD OR BUMP A PIN section at the top of the lockfile):

    $artifact $version $target $actual

  Do not paste that value in without checking it upstream first. It is the hash
  of what this machine just downloaded, which is only trustworthy if it agrees
  with what upstream published.
EOF
    return 1
  fi

  actual="$(sha256_of "$file")"

  if [ "$actual" != "$pinned" ]; then
    cat >&2 <<EOF

ERROR: SHA-256 mismatch for $artifact $version ($target) - ABORTING.

  file:     $file
  expected: $pinned  (pinned in $SIDECAR_LOCKFILE)
  actual:   $actual

  The downloaded bytes are not the bytes this repo pinned. Do NOT "fix" this by
  updating the pin to the actual value - that disables the check entirely.
  Treat it as one of:
    - a corrupted or truncated download (retry first),
    - a mirror/proxy serving different content,
    - an upstream release that was re-tagged or re-uploaded,
    - a supply-chain compromise.
  Only change the pin after re-confirming the digest against a checksum that
  upstream publishes for this release.
EOF
    return 1
  fi

  echo "Verified $artifact $version ($target) sha256=$actual"
}

# CLI: `verify-digest.sh --print <file>` prints a digest for pinning.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  case "${1:-}" in
    --print)
      [ -n "${2:-}" ] || { echo "usage: $0 --print <file>" >&2; exit 2; }
      sha256_of "$2"
      ;;
    *)
      cat >&2 <<EOF
usage: $0 --print <file>

Prints the SHA-256 of <file>, for pinning in scripts/dev/sidecar-lock.txt.
Sourced by the fetch-*.sh scripts to verify downloads; see the lockfile header
for how to add or bump a pin.
EOF
      exit 2
      ;;
  esac
fi
