# PHGC 자동 빌드 & 릴리즈 & 푸시 스크립트 (오프라인 전용 에디션)
# - Gitea (gitea.gguk.link): 커밋, 푸시, 태그 + 사용자가 원할 때만(-UploadGiteaRelease) 릴리즈 파일(.exe) 업로드
# - GitHub (github.com): 커밋, 푸시, 태그만 수행 (순수 원본 소스 보관용, 바이너리 업로드 금지)
# - 배포자료실 (gguk.link 게시판): 사용자가 수동 업로드
param (
    [string]$Notes = "100% 오프라인 전용 모드 전환 (정보보안 지침 준수, 외부 통신 차단, 기존 데이터 100% 호환)",
    [string]$Version = "1.2.0",
    [switch]$SkipBindings,
    [switch]$UploadGiteaRelease # 사용자가 명시적으로 업로드 지시할 때만 활성화
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# Git 인코딩 강제 설정 (UTF-8)
git config i18n.commitEncoding utf-8
git config i18n.logOutputEncoding utf-8

# ===== 저장소 설정 =====
$giteaURL = "https://gitea.gguk.link"
$giteaOwner = "purnpadosori"
$giteaRepo = "PHGC-OFFLINE"
$giteaToken = $env:GITEA_TOKEN

$newVer = $Version.TrimStart('v').Trim()

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ">>> PHGC 오프라인 전용 릴리즈 빌드 시작 (v$newVer)" -ForegroundColor Green
Write-Host ">>> 릴리즈 노트: $Notes" -ForegroundColor Yellow
if ($UploadGiteaRelease) {
    Write-Host ">>> [옵션] Gitea 릴리즈 바이너리(.exe) 업로드 활성화됨" -ForegroundColor Magenta
} else {
    Write-Host ">>> [안내] 소스 및 태그만 푸시 (Gitea 릴리즈 파일 업로드는 건너뜀)" -ForegroundColor DarkGray
}
Write-Host "==========================================" -ForegroundColor Cyan

# ===== 1. version.json 및 sync.go 버전 업데이트 =====
$versionFile = "server-data/version.json"
if (Test-Path $versionFile) {
    $json = Get-Content $versionFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $json.latestVersion = $newVer
    $json.releaseNotes = "v$newVer - $Notes"
    $json.downloadUrl = "https://gguk.link/boards/phgc?category=%EB%B0%B0%ED%8F%AC%EC%9E%90%EB%A3%8C"
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $jsonString = $json | ConvertTo-Json -Depth 4
    [System.IO.File]::WriteAllText((Resolve-Path $versionFile), $jsonString, $utf8NoBom)
}

$syncFile = "sync.go"
$syncContent = Get-Content $syncFile -Raw -Encoding UTF8
$syncContent = $syncContent -replace 'AppVersion = "[^"]+"', "AppVersion = `"$newVer`""
Set-Content -Path $syncFile -Value $syncContent -Encoding UTF8

# ===== 2. 실행 중인 PHGC 종료 =====
Stop-Process -Name "PHGC" -Force -ErrorAction SilentlyContinue

# ===== 3. Wails 빌드 =====
Write-Host ">>> Wails 빌드 실행 중..." -ForegroundColor Cyan
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$wailsArgs = @("build")
if ($SkipBindings) {
    $wailsArgs += "-skipbindings"
}
& wails @wailsArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host ">>> Wails 빌드 실패!" -ForegroundColor Red
    exit 1
}

$exePath = "build\bin\PHGC.exe"
if (-not (Test-Path $exePath)) {
    Write-Host ">>> 생성된 exe 파일을 찾을 수 없습니다: $exePath" -ForegroundColor Red
    exit 1
}
Write-Host ">>> 빌드 성공: $exePath" -ForegroundColor Green

# server-data/PHGC.exe 로도 복사
Copy-Item $exePath "server-data\PHGC.exe" -Force
Write-Host ">>> server-data\PHGC.exe 복사 완료" -ForegroundColor Green

# ===== 4. Git 커밋 & 태그 & 푸시 (한글 인코딩 안전 보장) =====
Write-Host ">>> Git 커밋 및 양방향 푸시 (Gitea 메인 & GitHub 원본 보관용)..." -ForegroundColor Cyan

$commitMsgFile = Join-Path $PWD ".git\temp_commit_msg.txt"
$commitText = @"
release: v$newVer - $Notes

100% 오프라인 전용 전환 및 보안 지침 준수 (외부 통신 원천 차단, 기존 데이터 완벽 보존)
"@
[System.IO.File]::WriteAllText($commitMsgFile, $commitText, (New-Object System.Text.UTF8Encoding($false)))

git add -A
git commit -F "$commitMsgFile" -q 2>$null
if (git tag -l "v$newVer") {
    git tag -d "v$newVer" > $null 2>&1
}
git tag -a "v$newVer" -F "$commitMsgFile" -f
Remove-Item $commitMsgFile -Force -ErrorAction SilentlyContinue

# 4-1. Gitea 푸시 (커밋 및 태그)
try {
    Write-Host ">>> Gitea (gitea.gguk.link) 푸시 중..." -ForegroundColor Cyan
    git push gitea main -f
    git push gitea "v$newVer" -f
    Write-Host ">>> Gitea 푸시 완료!" -ForegroundColor Green
} catch {
    Write-Host ">>> Gitea 푸시 예외: $_" -ForegroundColor Yellow
}

# 4-2. GitHub 백업 푸시 (원본 소스 보관용, 릴리즈 바이너리 업로드 금지)
try {
    Write-Host ">>> GitHub (원본 소스 보관용) 푸시 중..." -ForegroundColor Cyan
    git push github main -f
    git push github "v$newVer" -f
    Write-Host ">>> GitHub 푸시 완료! (소스 및 태그 보관)" -ForegroundColor Green
} catch {
    Write-Host ">>> GitHub 푸시 예외: $_" -ForegroundColor Yellow
}

# ===== 5. Gitea Release 생성 및 exe 업로드 (사용자가 -UploadGiteaRelease 요청 시에만 실행) =====
if ($UploadGiteaRelease) {
    if (-not $giteaToken) {
        Write-Host ">>> [경고] Gitea 토큰이 설정되지 않아 릴리즈 업로드를 건너뜁니다 (\$env:GITEA_TOKEN 설정 필요)" -ForegroundColor Yellow
    } else {
        Write-Host ">>> Gitea [$giteaRepo] 릴리즈 생성 및 PHGC.exe 바이너리 업로드 중..." -ForegroundColor Cyan
        $headers = @{
            "Authorization" = "token $giteaToken"
            "Content-Type"  = "application/json; charset=utf-8"
        }

        try {
            $existing = Invoke-RestMethod -Uri "$giteaURL/api/v1/repos/$giteaOwner/$giteaRepo/releases/tags/v$newVer" -Headers $headers -Method Get -ErrorAction SilentlyContinue
            if ($existing.id) {
                Invoke-RestMethod -Uri "$giteaURL/api/v1/repos/$giteaOwner/$giteaRepo/releases/$($existing.id)" -Headers $headers -Method Delete -ErrorAction SilentlyContinue
            }
        } catch {}

        $releaseBody = [PSCustomObject]@{
            tag_name   = "v$newVer"
            name       = "v$newVer (오프라인 전용 보안 에디션)"
            body       = $Notes
            draft      = $false
            prerelease = $false
        } | ConvertTo-Json -Depth 4
        $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($releaseBody)

        try {
            $release = Invoke-RestMethod -Uri "$giteaURL/api/v1/repos/$giteaOwner/$giteaRepo/releases" -Headers $headers -Method Post -Body $bodyBytes
            $releaseId = $release.id
            $uploadUrl = "$giteaURL/api/v1/repos/$giteaOwner/$giteaRepo/releases/$releaseId/assets?name=PHGC.exe"
            $absExe = (Get-Item $exePath).FullName

            & curl.exe -s -S -X POST "$uploadUrl" `
                -H "Authorization: token $giteaToken" `
                -H "Accept: application/json" `
                -F "attachment=@$absExe" > $null

            Write-Host ">>> Gitea [$giteaRepo] PHGC.exe 릴리즈 파일 업로드 완료!" -ForegroundColor Green
        } catch {
            Write-Host ">>> Gitea [$giteaRepo] 릴리즈 업로드 예외: $_" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host ">>> [안내] Gitea 릴리즈 파일 업로드는 건너뛰었습니다." -ForegroundColor DarkGray
    Write-Host ">>> (릴리즈 파일 업로드가 필요하실 때: .\publish.ps1 -UploadGiteaRelease 실행)" -ForegroundColor DarkGray
}

Write-Host "==========================================" -ForegroundColor Green
Write-Host ">>> PHGC v$newVer 배포 파이프라인 처리 완료!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
