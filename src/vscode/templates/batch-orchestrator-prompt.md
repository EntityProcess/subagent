MANDATORY: Run #runSubagent tool in your Available Actions for each request file to process them in isolated contexts.
DO NOT read the request files yourself - only pass the file paths to each subagent:

{{requestFiles}}

After ALL queries complete, verify all responses exist and unlock:

```powershell
$responses = @({{responseList}})
$missing = $responses | Where-Object { -not (Test-Path "messages/$_") }
if ($missing.Count -eq 0) { del subagent.lock }
```
