param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments)
& "$PSScriptRoot\zws.cmd" @Arguments
exit $LASTEXITCODE
