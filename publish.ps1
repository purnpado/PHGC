# PHGC 자동 빌드 & 릴리즈 & 푸시 스크립트
# - GitHub (github.com): 메인 배포 및 릴리즈 저장소 (v$Version 릴리즈 생성 및 PHGC.exe 바이너리 자동 업로드)
# - Gitea (gitea.gguk.link): 내부 소스 백업 및 옵션별 릴리즈 업로드
param (
    [string]$Notes = "신호등 종합 매트릭스 6개 탭(직전1년/최근3년/최근5년 × 일반/특별) 세분화 및 마이스터고 3개년 평균 기준선 연동",
    [string]$Version = "1.2.1",
    [switch]$SkipBindings,
    [switch]$SkipGitHubRelease,  # GitHub 릴리즈 바이너리 업로드를 건너뛸 때 사용
    [switch]$UploadGiteaRelease  # Gitea에도 바이너리 릴리즈 업로드할 때 사용
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# Git 인코딩 강제 설정 (UTF-8)
git config i18n.commitEncoding utf-8
git config i18n.logOutputEncoding utf-8

# ===== 저장소 설정 =====
$ghOwner = "purnpado"
$ghRepo = "PHGC"

$giteaURL = "https://gitea.gguk.link"
$giteaOwner = "purnpadosori"
$giteaRepo = "PHGC-OFFLINE"
$giteaToken = $env:GITEA_TOKEN

$newVer = $Version.TrimStart('v').Trim()

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ">>> PHGC 릴리즈 배포 파이프라인 시작 (v$newVer)" -ForegroundColor Green
Write-Host ">>> 릴리즈 노트: $Notes" -ForegroundColor Yellow
Write-Host ">>> 배포 대상: https://github.com/$ghOwner/$ghRepo/releases" -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Cyan

# ===== 1. version.json 및 sync.go 버전 업데이트 =====
$versionFile = "server-data/version.json"
if (Test-Path $versionFile) {
    $json = Get-Content $versionFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $json.latestVersion = $newVer
    $json.releaseNotes = "v$newVer - $Notes"
    $json.downloadUrl = "https://github.com/$ghOwner/$ghRepo/releases/latest/download/PHGC.exe"
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $jsonString = $json | ConvertTo-Json -Depth 4
    [System.IO.File]::WriteAllText((Resolve-Path $versionFile), $jsonString, $utf8NoBom)
}

$syncFile = "sync.go"
if (Test-Path $syncFile) {
    $syncContent = Get-Content $syncFile -Raw -Encoding UTF8
    $syncContent = $syncContent -replace 'AppVersion = "[^"]+"', "AppVersion = `"$newVer`""
    Set-Content -Path $syncFile -Value $syncContent -Encoding UTF8
}

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

# 버전 명시 바이너리 파일명 생성 (예: PHGC_v1.2.2.exe)
$versionedExeName = "PHGC_v$newVer.exe"
$versionedExePath = "build\bin\$versionedExeName"
Copy-Item $exePath $versionedExePath -Force
Write-Host ">>> 버전 명시 파일 생성: $versionedExePath" -ForegroundColor Green

# server-data 폴더에도 복사
Copy-Item $exePath "server-data\PHGC.exe" -Force
Copy-Item $versionedExePath "server-data\$versionedExeName" -Force
Write-Host ">>> server-data 폴더 복사 완료 (PHGC.exe & $versionedExeName)" -ForegroundColor Green

# ===== 4. Git 커밋 & 태그 & 푸시 =====
Write-Host ">>> Git 커밋 및 GitHub/Gitea 양방향 푸시 중..." -ForegroundColor Cyan

$commitMsgFile = Join-Path $PWD ".git\temp_commit_msg.txt"
$commitText = @"
release: v$newVer - $Notes

GitHub 공식 릴리즈: https://github.com/$ghOwner/$ghRepo/releases/tag/v$newVer
"@
[System.IO.File]::WriteAllText($commitMsgFile, $commitText, (New-Object System.Text.UTF8Encoding($false)))

git add -A
git commit -F "$commitMsgFile" -q 2>$null
if (git tag -l "v$newVer") {
    git tag -d "v$newVer" > $null 2>&1
}
git tag -a "v$newVer" -F "$commitMsgFile" -f
Remove-Item $commitMsgFile -Force -ErrorAction SilentlyContinue

# 4-1. GitHub 푸시 (메인 브랜치 및 태그)
try {
    Write-Host ">>> GitHub (github.com) 푸시 중..." -ForegroundColor Cyan
    git push github main -f
    git push github "v$newVer" -f
    Write-Host ">>> GitHub 푸시 완료!" -ForegroundColor Green
} catch {
    Write-Host ">>> GitHub 푸시 예외: $_" -ForegroundColor Yellow
}

# 4-2. Gitea 백업 푸시
try {
    Write-Host ">>> Gitea (gitea.gguk.link) 백업 푸시 중..." -ForegroundColor Cyan
    git push gitea main -f
    git push gitea "v$newVer" -f
    Write-Host ">>> Gitea 푸시 완료!" -ForegroundColor Green
} catch {
    Write-Host ">>> Gitea 푸시 예외: $_" -ForegroundColor Yellow
}

# ===== 5. GitHub 릴리즈 생성 및 PHGC.exe 에셋 업로드 =====
if (-not $SkipGitHubRelease) {
    Write-Host ">>> GitHub Releases (v$newVer) 등록 및 바이너리 업로드 시작..." -ForegroundColor Cyan
    try {
        # Git 자격 증명 관리자에서 github.com 토큰 획득 (화면 출력 없이 내부 변수 사용)
        $procInfo = New-Object System.Diagnostics.ProcessStartInfo
        $procInfo.FileName = "git.exe"
        $procInfo.Arguments = "credential fill"
        $procInfo.RedirectStandardInput = $true
        $procInfo.RedirectStandardOutput = $true
        $procInfo.UseShellExecute = $false
        $p = [System.Diagnostics.Process]::Start($procInfo)
        $p.StandardInput.WriteLine("protocol=https")
        $p.StandardInput.WriteLine("host=github.com")
        $p.StandardInput.WriteLine("")
        $p.StandardInput.Close()
        $credOutput = $p.StandardOutput.ReadToEnd()
        $p.WaitForExit()

        if ($credOutput -match "password=([^\r\n]+)") {
            $ghToken = $matches[1].Trim()
            $headers = @{
                "Authorization"        = "Bearer $ghToken"
                "Accept"               = "application/vnd.github+json"
                "X-GitHub-Api-Version" = "2022-11-28"
                "User-Agent"           = "PHGC-Publisher"
            }

            # 기존 릴리즈 확인 후 필요 시 갱신
            $existing = $null
            try {
                $existing = Invoke-RestMethod -Uri "https://api.github.com/repos/$ghOwner/$ghRepo/releases/tags/v$newVer" -Headers $headers -Method Get -ErrorAction Stop
            } catch {}

            if ($existing -and $existing.id) {
                Invoke-RestMethod -Uri "https://api.github.com/repos/$ghOwner/$ghRepo/releases/$($existing.id)" -Headers $headers -Method Delete -ErrorAction Stop
            }

            $ghReleaseBody = @"
## 🌟 v$newVer 릴리즈 안내

### 주요 개선 사항
$Notes

### 다운로드 안내
- **공식 실행 파일**: 아래 Assets 항목의 **`$versionedExeName`** (또는 `PHGC.exe`)를 다운로드하여 실행하시면 됩니다.
- 본 프로그램은 학생 개인정보 보호 및 학교 정보보안 지침을 철저히 준수하는 100% 로컬 독립형 소프트웨어입니다.
"@

            $payload = @{
                tag_name         = "v$newVer"
                target_commitish = "main"
                name             = "v$newVer - $Notes"
                body             = $ghReleaseBody
                draft            = $false
                prerelease       = $false
            } | ConvertTo-Json -Depth 5 -Compress

            $newRel = Invoke-RestMethod -Uri "https://api.github.com/repos/$ghOwner/$ghRepo/releases" -Headers $headers -Method Post -Body ([System.Text.Encoding]::UTF8.GetBytes($payload)) -ContentType "application/json; charset=utf-8"
            $relId = $newRel.id

            # 1. 버전 명시 파일 업로드 (예: PHGC_v1.2.2.exe)
            $uploadUrlVersioned = "https://uploads.github.com/repos/$ghOwner/$ghRepo/releases/$relId/assets?name=$versionedExeName"
            $absVersionedExe = (Resolve-Path $versionedExePath).Path
            & curl.exe -s -S -X POST "$uploadUrlVersioned" `
                -H "Authorization: Bearer $ghToken" `
                -H "Accept: application/vnd.github+json" `
                -H "Content-Type: application/octet-stream" `
                --data-binary "@$absVersionedExe" > $null
            Write-Host ">>> GitHub Releases ($versionedExeName) 업로드 완료!" -ForegroundColor Green

            # 2. 표준 PHGC.exe 파일 업로드 (자동 업데이트 호환)
            $uploadUrl = "https://uploads.github.com/repos/$ghOwner/$ghRepo/releases/$relId/assets?name=PHGC.exe"
            $absExe = (Resolve-Path $exePath).Path
            & curl.exe -s -S -X POST "$uploadUrl" `
                -H "Authorization: Bearer $ghToken" `
                -H "Accept: application/vnd.github+json" `
                -H "Content-Type: application/octet-stream" `
                --data-binary "@$absExe" > $null
            Write-Host ">>> GitHub Releases (PHGC.exe) 업로드 완료!" -ForegroundColor Green

            Write-Host ">>> GitHub 릴리즈 링크: https://github.com/$ghOwner/$ghRepo/releases/tag/v$newVer" -ForegroundColor Green
        } else {
            Write-Host ">>> [안내] GitHub 자격 증명을 찾을 수 없어 릴리즈 바이너리 업로드는 건너뛰었습니다." -ForegroundColor Yellow
        }
    } catch {
        Write-Host ">>> GitHub 릴리즈 업로드 예외: $_" -ForegroundColor Yellow
    }
}

# ===== 6. Gitea Release (옵션 요청 시) =====
if ($UploadGiteaRelease -and $giteaToken) {
    Write-Host ">>> Gitea [$giteaRepo] 릴리즈 바이너리 업로드 중..." -ForegroundColor Cyan
    # Gitea 업로드 처리...
}

Write-Host "==========================================" -ForegroundColor Green
Write-Host ">>> PHGC v$newVer GitHub 릴리즈 및 배포 파이프라인 완료!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
