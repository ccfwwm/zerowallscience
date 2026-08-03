#!/bin/bash
# Full flow: initialize -> session/new -> capture sessionId -> session/prompt.
export ANTHROPIC_API_KEY=""
CWD="C:/Users/ccf/Documents/ZeroWallScience"
PIPE=/tmp/acp_in
rm -f "$PIPE"; mkfifo "$PIPE"

# Reader: feed the fifo to the agent, tee output so we can grep the sessionId.
timeout 40 npx --yes @zed-industries/claude-code-acp < "$PIPE" 2>&1 | while IFS= read -r line; do
  echo "OUT: $line"
  if [[ "$line" == *'"id":1'* && "$line" == *'sessionId'* ]]; then
    SID=$(echo "$line" | grep -oE '"sessionId":"[^"]+"' | head -1 | cut -d'"' -f4)
    echo ">>> got session $SID, sending prompt"
    printf '%s\n' "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"session/prompt\",\"params\":{\"sessionId\":\"$SID\",\"prompt\":[{\"type\":\"text\",\"text\":\"say hi in one word\"}]}}" > "$PIPE"
  fi
done &
READER=$!

# Writer: keep the fifo open, send init then new-session.
exec 3>"$PIPE"
printf '%s\n' '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{"fs":{"readTextFile":true,"writeTextFile":true},"terminal":true}}}' >&3
sleep 3
printf '%s\n' "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"session/new\",\"params\":{\"cwd\":\"$CWD\",\"mcpServers\":[]}}" >&3
sleep 30
exec 3>&-
wait $READER
echo "=== DONE ==="
