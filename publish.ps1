# PHGC 자동 버전업 & 빌드 & 푸시 & 릴리즈 스크립트
param (
    [string]$Notes = "기능 개선 및 안정화 업데이트"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# ===== Gitea API 설정 =====
$giteaURL = "https://gitea.gguk.link"
$giteaOwner = "purnpadosori"
$giteaRepo = "PHGC"

# Gitea 토큰 읽기 (User 환경변수 또는 서버 .env)
$giteaToken = [System.Environment]::GetEnvironmentVariable("GITEA_TOKEN", "User")
if (-not $giteaToken) {
    $giteaToken = $env:GITEA_TOKEN
}
if (-not $giteaToken) {
    $envFile = "server/.env"
    if (Test-Path $envFile) {
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^\s*GITEA_TOKEN\s*=\s*(.+)$') {
                $giteaToken = $matches[1].Trim()
            }
        }
    }
}
if (-not $giteaToken) {
    Write-Host "GITEA_TOKEN not found. Gitea Release upload will be skipped." -ForegroundColor Yellow
} else {
    Write-Host ">>> GITEA_TOKEN 로드 성공! (자동 릴리즈 생성 활성화)" -ForegroundColor Green
}

# ===== 1. 현재 버전 읽기 =====
$versionFile = "server-data/version.json"
$json = Get-Content $versionFile -Raw -Encoding UTF8 | ConvertFrom-Json
$currentVer = $json.latestVersion

# ===== 2. 버전 번호 자동 증가 =====
$parts = $currentVer.Split('.')
if ($parts.Length -eq 3) {
    $patch = [int]$parts[2] + 1
    $newVer = "$($parts[0]).$($parts[1]).$patch"
} else {
    $newVer = "0.5.1"
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ">>> 버전 자동 증가: $currentVer -> $newVer" -ForegroundColor Green
Write-Host ">>> 릴리즈 노트: $Notes" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Cyan

# ===== 3. server-data/version.json 업데이트 =====
$json.latestVersion = $newVer
$json.releaseNotes = "v$newVer - $Notes"
$json.downloadUrl = "https://go.gguk.link/api/sync/server-data/PHGC.exe"
$json | ConvertTo-Json -Depth 4 | Set-Content $versionFile -Encoding UTF8

# ===== 4. sync.go AppVersion 업데이트 =====
$syncFile = "sync.go"
$syncContent = Get-Content $syncFile -Raw -Encoding UTF8
$syncContent = $syncContent -replace 'AppVersion = "[^"]+"', "AppVersion = `"$newVer`""
Set-Content -Path $syncFile -Value $syncContent -Encoding UTF8

# ===== 5. 실행 중인 PHGC 종료 =====
Stop-Process -Name "PHGC" -Force -ErrorAction SilentlyContinue

# ===== 6. Wails 빌드 =====
Write-Host ">>> Wails 빌드 실행 중..." -ForegroundColor Cyan
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
wails build

if ($LASTEXITCODE -ne 0) {
    Write-Host ">>> 빌드 실패!" -ForegroundColor Red
    exit 1
}

$exePath = "build\bin\PHGC.exe"
if (-not (Test-Path $exePath)) {
    Write-Host ">>> 빌드된 exe 파일을 찾을 수 없습니다: $exePath" -ForegroundColor Red
    exit 1
}
Write-Host ">>> 빌드 성공: $exePath" -ForegroundColor Green

# ===== 6-1. server-data/PHGC.exe 로 복사 (비공개 프록시 다운로드용) =====
Copy-Item -Path $exePath -Destination "server-data\PHGC.exe" -Force
Write-Host ">>> server-data\PHGC.exe 동기화 배포 파일 복사 완료" -ForegroundColor Green

# ===== 7. Git 커밋 & 태그 & 푸시 =====
Write-Host ">>> Git 커밋 및 태그 생성 중..." -ForegroundColor Cyan
git add .
git add -f server-data/PHGC.exe
git commit -m "release: v$newVer - $Notes"
git tag -a "v$newVer" -m "v$newVer - $Notes" -f
if ($giteaToken) {
    $authenticatedUrl = "https://${giteaToken}@gitea.gguk.link/purnpadosori/PHGC.git"
    git push $authenticatedUrl main
    git push $authenticatedUrl "v$newVer" -f
} else {
    git push
    git push origin "v$newVer" -f
}

# ===== 8. Gitea Release 생성 & exe Asset 업로드 =====
if ($giteaToken) {
    Write-Host ">>> Gitea Release 생성 중 (v$newVer)..." -ForegroundColor Cyan

    # 8-1. 기존 동일 태그 릴리즈가 있으면 삭제
    $headers = @{
        "Authorization" = "token $giteaToken"
        "Content-Type"  = "application/json"
    }
    try {
        $existingRelease = Invoke-RestMethod -Uri "$giteaURL/api/v1/repos/$giteaOwner/$giteaRepo/releases/tags/v$newVer" -Headers $headers -Method Get -ErrorAction SilentlyContinue
        if ($existingRelease.id) {
            Write-Host ">>> 기존 릴리즈 삭제 중 (ID: $($existingRelease.id))..." -ForegroundColor Yellow
            Invoke-RestMethod -Uri "$giteaURL/api/v1/repos/$giteaOwner/$giteaRepo/releases/$($existingRelease.id)" -Headers $headers -Method Delete -ErrorAction SilentlyContinue
        }
    } catch {
        # 기존 릴리즈 없으면 무시
    }

    # 8-2. 새 릴리즈 생성
    $releaseBody = @{
        tag_name = "v$newVer"
        name     = "v$newVer"
        body     = $Notes
        draft    = $false
        prerelease = $false
    } | ConvertTo-Json -Depth 4

    try {
        $release = Invoke-RestMethod -Uri "$giteaURL/api/v1/repos/$giteaOwner/$giteaRepo/releases" -Headers $headers -Method Post -Body $releaseBody
        $releaseId = $release.id
        Write-Host ">>> Gitea Release 생성 완료 (ID: $releaseId)" -ForegroundColor Green

        # 8-3. exe Asset 업로드 (curl.exe 활용)
        Write-Host ">>> PHGC.exe Asset 업로드 중..." -ForegroundColor Cyan
        $uploadUrl = "$giteaURL/api/v1/repos/$giteaOwner/$giteaRepo/releases/$releaseId/assets?name=PHGC.exe"
        $absExe = (Get-Item $exePath).FullName

        & curl.exe -s -S -X POST "$uploadUrl" `
            -H "Authorization: token $giteaToken" `
            -H "Accept: application/json" `
            -F "attachment=@$absExe" > $null

        Write-Host ">>> PHGC.exe Asset 업로드 완료!" -ForegroundColor Green
    } catch {
        Write-Host ">>> Gitea Release/Asset 오류: $_" -ForegroundColor Red
        Write-Host ">>> 수동으로 Gitea 웹에서 릴리즈에 exe를 첨부해 주세요." -ForegroundColor Yellow
    }
} else {
    Write-Host ">>> GITEA_TOKEN 없음 - Gitea Release 생성을 건너뜁니다." -ForegroundColor Yellow
    Write-Host ">>> 수동으로 Gitea 웹에서 릴리즈에 exe를 첨부해 주세요." -ForegroundColor Yellow
}

Write-Host "==========================================" -ForegroundColor Green
Write-Host ">>> v$newVer 배포 완료!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
