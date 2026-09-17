import { pathToFileURL } from 'node:url'

const [dshEntryPath, ...dshArguments] = process.argv.slice(2)

function formatError(value, depth = 0) {
  if (depth > 8) return '[nested error depth exceeded]'
  if (!(value instanceof Error)) return String(value)

  const lines = [value.stack ?? `${value.name}: ${value.message}`]
  if (value.cause !== undefined) lines.push(`cause:\n${formatError(value.cause, depth + 1)}`)
  if (value instanceof AggregateError) {
    for (const [index, error] of [...value.errors].entries()) {
      lines.push(`errors[${index}]:\n${formatError(error, depth + 1)}`)
    }
  }
  return lines.join('\n')
}

function report(label, value) {
  process.stderr.write(`[harness-node] ${label}: ${formatError(value)}\n`)
}

function failStartup(error) {
  report('DSH entry failed', error)
  process.send?.({ type: 'zerowall:host:failed', message: error instanceof Error ? error.message : String(error) })
  // Failed plugins can leave servers/timers alive. exitCode alone never ends
  // that process; give the desktop time to terminate its entire child tree.
  process.exitCode = 1
  setTimeout(() => process.exit(1), 1_000).unref()
}

process.on('uncaughtException', (error) => report('uncaught exception', error))
process.on('unhandledRejection', (error) => report('unhandled rejection', error))

if (!dshEntryPath) {
  report('startup error', 'missing DSH entry path')
  process.exitCode = 1
} else {
  process.argv = [process.execPath, dshEntryPath, ...dshArguments]
  try {
    const { runCli } = await import(pathToFileURL(dshEntryPath).href)
    await runCli()
    process.send?.({ type: 'zerowall:host:booted' })
  } catch (error) {
    failStartup(error)
  }
}
