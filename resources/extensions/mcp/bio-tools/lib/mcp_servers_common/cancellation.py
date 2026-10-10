"""Keep cancelled Bio requests from responding twice in the MCP SDK.

A domain handler can finish while a cancellation is being delivered, or catch
the cancellation itself. The SDK's responder has already sent the cancellation
response at that point. Preserve every other response and error unchanged.
"""

from mcp.server import Server


class _CancellationSafeResponder:
    def __init__(self, responder):
        self._responder = responder

    def __getattr__(self, name):
        return getattr(self._responder, name)

    async def respond(self, response):
        if not self._responder.cancelled:
            await self._responder.respond(response)


class CancellationSafeServer(Server):
    async def _handle_request(self, message, *args, **kwargs):
        return await super()._handle_request(
            _CancellationSafeResponder(message), *args, **kwargs
        )
