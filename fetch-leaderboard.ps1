param(
    [string]$Season = 'Season 1',
    [string]$OutputPath = (Join-Path $PSScriptRoot 'leaderboard-season-1.json')
)

$ErrorActionPreference = 'Stop'
$limit = 200
$encodedSeason = [Uri]::EscapeDataString($Season)
$entries = [System.Collections.Generic.List[object]]::new()
$metadata = $null

function Get-LeaderboardPage([int]$Offset) {
    $uri = "https://points-api.arcus.xyz/v1/leaderboard?season=$encodedSeason&limit=$limit&offset=$Offset"
    for ($attempt = 1; $attempt -le 4; $attempt++) {
        try {
            return Invoke-RestMethod -Uri $uri -Method Get -TimeoutSec 30
        } catch {
            if ($attempt -eq 4) { throw }
            Start-Sleep -Seconds ([Math]::Pow(2, $attempt))
        }
    }
}

for ($offset = 0; ; $offset += $limit) {
    $page = Get-LeaderboardPage $offset
    if ($null -eq $metadata) {
        if ($page.season -ne $Season -or $null -eq $page.total -or $null -eq $page.points_visible) {
            throw 'Unexpected API metadata.'
        }
        $metadata = $page
    } elseif ($page.total -ne $metadata.total -or $page.season -ne $metadata.season -or $page.points_visible -ne $metadata.points_visible) {
        throw 'Leaderboard metadata changed during pagination. Run again for a consistent snapshot.'
    }
    $expected = [Math]::Min($limit, [int]$metadata.total - $offset)
    if (@($page.entries).Count -ne $expected) {
        throw "Unexpected entry count at offset ${offset}: expected $expected, got $(@($page.entries).Count)."
    }
    foreach ($entry in $page.entries) {
        $entries.Add([ordered]@{
            rank = $entry.rank
            name = $entry.name
            tier = $entry.tier
            points = $entry.points
        })
    }
    Write-Host "Downloaded $($entries.Count)/$($metadata.total) entries"
    if ($entries.Count -ge $metadata.total) { break }
}

$byName = [ordered]@{}
$ranks = [System.Collections.Generic.HashSet[int]]::new()
for ($i = 0; $i -lt $entries.Count; $i++) {
    $entry = $entries[$i]
    if ([string]::IsNullOrWhiteSpace($entry.name)) { throw "Missing name at index $i." }
    $key = $entry.name.ToLowerInvariant()
    if ($byName.Contains($key)) { throw "Duplicate normalized name: $key" }
    if (-not $ranks.Add([int]$entry.rank)) { throw "Duplicate rank: $($entry.rank)" }
    if ($i -gt 0 -and $entry.rank -le $entries[$i - 1].rank) { throw 'Ranks are not ascending.' }
    $byName[$key] = $i
}

$snapshot = [ordered]@{
    season = $metadata.season
    points_visible = $metadata.points_visible
    total = $metadata.total
    updated_at = [DateTime]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'")
    entries = $entries.ToArray()
    by_name = $byName
}
$json = ConvertTo-Json -InputObject $snapshot -Depth 8
$absoluteOutput = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
[System.IO.File]::WriteAllText($absoluteOutput, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "Saved $absoluteOutput"
