const [expectedPlatform, expectedArch] = process.argv.slice(2)
if (process.platform !== expectedPlatform || process.arch !== expectedArch) {
  throw new Error(`Packaging target requires ${expectedPlatform}/${expectedArch}; current host is ${process.platform}/${process.arch}.`)
}
