param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments)
& "$PSScriptRoot\dsh.cmd" @Arguments
exit $LASTEXITCODE
