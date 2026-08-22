# Transfers between local and SSH contexts

ZeroWall transfers one exact file or directory from a registered, probed SSH
execution context either to another SSH context or to the local machine, and
uploads one exact local file or directory to a selected SSH context.
Agent-generated free-form `ssh`, `scp`, and `rsync -e ssh` commands remain
disabled.

## Routes

`transfer_between_contexts` accepts `route=auto|direct|relay`.

- `auto` uses a previously verified directed trust edge, otherwise relay.
- `direct` requires a verified A→B edge. It runs on A, prefers rsync when it is
  installed on both servers, and falls back to scp.
- `relay` downloads into a private temporary directory on the ZeroWall machine and
  then uploads with B's separately configured credentials. The temporary
  directory is removed after success, failure, or cancellation.

For SSH-to-SSH transfers, the source and destination paths must be exact
absolute or `~/` paths. Globs and filesystem/home roots are rejected. Neither
route adds `--delete`.

## Download to the local machine

Set `destination_context_id` to `local` and provide the exact new absolute
local file or directory path. If the user has not chosen that path, ask before
calling the tool. Local downloads accept `route=auto|relay` and
`transport=auto|scp`.

ZeroWall authenticates through the selected source context once and downloads with
scp into a private staging directory beside the destination. After a complete
download, it renames the staged item to the requested path. Existing
destinations are rejected and partial downloads are removed after failure,
cancellation, or timeout.

## Upload from the local machine

Set `source_context_id` to `local`, provide an exact existing absolute local
path, and select an SSH destination. Local uploads accept `route=auto|relay`
and `transport=auto|scp`. Globs, roots, missing paths, symbolic links, and
special files are rejected.

Before uploading, ZeroWall checks through the configured SSH connection that the
exact remote destination does not exist. It then uploads with scp as a
persisted `file_transfer` Run, preserving cancellation, timeout, progress, and
audit records. Existing remote destinations are never silently overwritten.

## User-approved trust

`configure_ssh_trust` always requires approval.

With `action=install`, ZeroWall:

1. Generates a dedicated Ed25519 key on A under `~/.ssh/`.
2. Reads only the public key through the managed A connection.
3. Adds that public key idempotently to B's `authorized_keys` through the
   managed B connection.
4. Verifies A→B non-interactive authentication.
5. Records only the directed edge and remote key path in settings.

The private key never leaves A and no password is written to SQLite or a
command. A→B and B→A are separate edges.

With `action=verify`, ZeroWall verifies and records trust the user configured
themselves; it does not generate or copy a key.

## Current limitations

- Direct rsync is resumable at rsync's file-transfer level; scp relay is not.
- SSH-to-local downloads use scp and are not resumable yet.
- Local-to-SSH uploads use scp and are not resumable yet.
- Relay temporarily needs local free space approximately equal to the source.
- scp recursive copies follow symlinks according to the installed OpenSSH
  implementation.
- Trust removal is currently manual on the two servers.
