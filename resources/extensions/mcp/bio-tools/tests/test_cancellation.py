"""Real MCP protocol regression for a domain that catches cancellation."""
import unittest

import anyio
from mcp import ClientSession
from mcp.shared.message import SessionMessage
from mcp.types import CancelledNotification, CancelledNotificationParams, ClientNotification, TextContent, Tool
from mcp_servers_common.cancellation import CancellationSafeServer, _CancellationSafeResponder


class CancellationTests(unittest.TestCase):
    def test_cancelled_call_preserves_connection(self):
        async def scenario():
            server = CancellationSafeServer('cancel-regression')
            entered = anyio.Event()

            @server.list_tools()
            async def tools():
                return [Tool(name='slow', inputSchema={'type': 'object'})]

            @server.call_tool()
            async def call(name, arguments):
                entered.set()
                try:
                    await anyio.sleep_forever()
                except anyio.get_cancelled_exc_class():
                    # Some third-party domain handlers return after cancellation.
                    return [TextContent(type='text', text='cancelled')]

            client_write, server_read = anyio.create_memory_object_stream[SessionMessage](10)
            server_write, client_read = anyio.create_memory_object_stream[SessionMessage](10)
            async with anyio.create_task_group() as group:
                group.start_soon(server.run, server_read, server_write, server.create_initialization_options())
                async with ClientSession(client_read, client_write) as client:
                    await client.initialize()  # request 0

                    async def pending():
                        try:
                            await client.call_tool('slow', {})  # request 1
                        except Exception as error:
                            self.assertIn('cancel', str(error).lower())

                    group.start_soon(pending)
                    await entered.wait()
                    await client.send_notification(ClientNotification(CancelledNotification(params=CancelledNotificationParams(requestId=1))))
                    await anyio.sleep(0.05)
                    self.assertEqual([t.name for t in (await client.list_tools()).tools], ['slow'])
                group.cancel_scope.cancel()

        anyio.run(scenario)

    def test_non_cancelled_duplicate_response_is_still_an_error(self):
        class Responder:
            cancelled = False
            async def respond(self, response):
                raise AssertionError('Request already responded to')

        async def scenario():
            with self.assertRaisesRegex(AssertionError, 'already responded'):
                await _CancellationSafeResponder(Responder()).respond(None)
        anyio.run(scenario)


if __name__ == '__main__':
    unittest.main()
