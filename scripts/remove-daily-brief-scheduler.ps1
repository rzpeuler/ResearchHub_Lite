param([string]$TaskPrefix = "ResearchHub-Lite-DailyBrief")
foreach ($kind in @("morning", "evening")) { Unregister-ScheduledTask -TaskName "$TaskPrefix-$kind" -Confirm:$false -ErrorAction SilentlyContinue }
Write-Output "Removed current-user daily brief tasks."
