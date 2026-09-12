# PHGC 자동 빌드 & 릴리즈 & 푸시 스크립트
# - GitHub (github.com): 메인 배포 및 릴리즈 저장소 (v$Version 릴리즈 생성 및 PHGC.exe 바이너리 자동 업로드)
# - Gitea (gitea.gguk.link): 내부 소스 백업 및 옵션별 릴리즈 업로드
param (
    [string]$Notes = @"
- 진학상담 대시보드 1:1 프라이버시 상담 모드 (실시간 학생 번호/이름 검색 및 다차원 정렬)
- 대시보드 희망학교 원클릭 즉시 삭제([✕]) 버튼 구현
- 진학상담 기록/삭제 후 대시보드 실시간 자동 반영 및 상단 [🔄 새로고침] 버튼 추가
- 키보드 ESC 키로 열려있는 모든 모달(창) 즉시 닫기 전역 지원
- 고입원서대장 서식 명칭 정비 및 원클릭 엑셀(.xls) 다운로드 기능 탑재
- 마이스터고/특성화고 합격 예측 모달의 내신 석차 표기 버그 수정(전교 총원 기준)
- 비밀번호 재설정 저장 버그 및 배포 패키지 파일 비밀번호 인증 보강
"@.Trim(),
    [string]$Version = "1.5.1",
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

# ===== 2. 실행 중인 PHGC 프로세스 종료 (버전명 실행파일 포함) =====
Get-Process | Where-Object { $_.ProcessName -like "PHGC*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

# ===== 3. Wails 빌드 =====
Write-Host ">>> Wails 빌드 실행 중..." -ForegroundColor Cyan
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
# 개발 PC의 사용자명·절대 경로가 EXE 디버그 정보에 남지 않도록 경로와
# 디버그 심볼을 제거한 배포용 바이너리를 생성한다.
$wailsArgs = @("build", "-trimpath", "-ldflags", "-s -w")
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
Write-Host ">>> 실행 파일 확인: $exePath" -ForegroundColor Green

# 압축 배포 파일 생성 (phgc_v$newVer.zip)
$zipName = "phgc_v$newVer.zip"
$zipPath = "build\bin\$zipName"

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Compress-Archive -Path $exePath -DestinationPath $zipPath -Force
Write-Host ">>> 압축 배포 파일 생성 완료 ($zipName)" -ForegroundColor Green

# server-data 및 배포 폴더 복사
Copy-Item $exePath "server-data\PHGC.exe" -Force
Copy-Item $zipPath "server-data\$zipName" -Force
Copy-Item $exePath "D:\PHGC\PHGC.exe" -Force -ErrorAction SilentlyContinue

$desktopPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
$schoolTarget = Join-Path $desktopPath "푸른파도소리중학교\PHGC.exe"
$testTarget = Join-Path $desktopPath "test\PHGC.exe"
if (Test-Path (Split-Path $schoolTarget -Parent)) { Copy-Item $exePath $schoolTarget -Force -ErrorAction SilentlyContinue }
if (Test-Path (Split-Path $testTarget -Parent)) { Copy-Item $exePath $testTarget -Force -ErrorAction SilentlyContinue }
Write-Host ">>> server-data 및 로컬 배포 폴더 복사 완료" -ForegroundColor Green

# ===== 4. Git 커밋 & 태그 & 푸시 =====
Write-Host ">>> Git 커밋 및 GitHub/Gitea 양방향 푸시 중..." -ForegroundColor Cyan

$firstLineSummary = ($Notes -split "\r?\n")[0].TrimStart('-* ').Trim()
$releaseTitle = "v$newVer - $firstLineSummary 등 주요 기능 개선"
$commonReleaseBody = @"
## 🌟 v$newVer 릴리즈 안내

### 📋 주요 개선 사항
$Notes

### 📥 다운로드 안내
- **단독 실행 파일**: 아래 Assets 항목의 **PHGC.exe**를 다운로드하여 바로 실행하시면 됩니다.
- **압축 배포 파일**: 압축 해제 후 사용하실 경우 아래 Assets 항목의 **$zipName**을 다운로드하시면 됩니다.
- 본 프로그램은 학생 개인정보 보호 및 학교 정보보안 지침을 철저히 준수하는 100% 로컬 독립형 소프트웨어입니다.
"@

$commitMsgFile = Join-Path $PWD ".git\temp_commit_msg.txt"
$commitText = @"
release: v$newVer

$Notes

GitHub 공식 릴리즈: https://github.com/$ghOwner/$ghRepo/releases/tag/v$newVer
"@
[System.IO.File]::WriteAllText($commitMsgFile, $commitText, (New-Object System.Text.UTF8Encoding($false)))

git add -A
git commit -F "$commitMsgFile" -q 2>$null
if (git tag -l "v$newVer") {
    git tag -d "v$newVer" > $null 2>&1
}
$tagMsgFile = Join-Path $PWD ".git\temp_tag_msg.txt"
[System.IO.File]::WriteAllText($tagMsgFile, $commonReleaseBody, (New-Object System.Text.UTF8Encoding($false)))
git tag -a "v$newVer" -F "$tagMsgFile" -f
Remove-Item $commitMsgFile -Force -ErrorAction SilentlyContinue
Remove-Item $tagMsgFile -Force -ErrorAction SilentlyContinue

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

            $payload = @{
                tag_name         = "v$newVer"
                target_commitish = "main"
                name             = $releaseTitle
                body             = $commonReleaseBody
                draft            = $false
                prerelease       = $false
            } | ConvertTo-Json -Depth 5 -Compress

            $newRel = Invoke-RestMethod -Uri "https://api.github.com/repos/$ghOwner/$ghRepo/releases" -Headers $headers -Method Post -Body ([System.Text.Encoding]::UTF8.GetBytes($payload)) -ContentType "application/json; charset=utf-8"
            $relId = $newRel.id

            # 기존 에셋 삭제 (깔끔한 2종 에셋 유지: PHGC.exe & phgc_v1.3.0.zip)
            try {
                $ghAssets = Invoke-RestMethod -Uri "https://api.github.com/repos/$ghOwner/$ghRepo/releases/$relId/assets" -Headers $headers -Method Get -ErrorAction SilentlyContinue
                foreach ($asset in $ghAssets) {
                    Invoke-RestMethod -Uri "https://api.github.com/repos/$ghOwner/$ghRepo/releases/assets/$($asset.id)" -Headers $headers -Method Delete -ErrorAction SilentlyContinue
                }
            } catch {}

            # 1. 표준 PHGC.exe 파일 업로드
            $uploadUrl = "https://uploads.github.com/repos/$ghOwner/$ghRepo/releases/$relId/assets?name=PHGC.exe"
            $absExe = (Resolve-Path $exePath).Path
            & curl.exe -s -S -X POST "$uploadUrl" `
                -H "Authorization: Bearer $ghToken" `
                -H "Accept: application/vnd.github+json" `
                -H "Content-Type: application/octet-stream" `
                --data-binary "@$absExe" > $null
            Write-Host ">>> GitHub Releases (PHGC.exe) 업로드 완료!" -ForegroundColor Green

            # 2. 압축 배포 파일 업로드 (phgc_v1.3.0.zip)
            $uploadUrlZip = "https://uploads.github.com/repos/$ghOwner/$ghRepo/releases/$relId/assets?name=$zipName"
            $absZip = (Resolve-Path $zipPath).Path
            & curl.exe -s -S -X POST "$uploadUrlZip" `
                -H "Authorization: Bearer $ghToken" `
                -H "Accept: application/vnd.github+json" `
                -H "Content-Type: application/zip" `
                --data-binary "@$absZip" > $null
            Write-Host ">>> GitHub Releases ($zipName) 업로드 완료!" -ForegroundColor Green

            Write-Host ">>> GitHub 릴리즈 링크: https://github.com/$ghOwner/$ghRepo/releases/tag/v$newVer" -ForegroundColor Green
        } else {
            Write-Host ">>> [안내] GitHub 자격 증명을 찾을 수 없어 릴리즈 바이너리 업로드는 건너뛰었습니다." -ForegroundColor Yellow
        }
    } catch {
        Write-Host ">>> GitHub 릴리즈 업로드 예외: $_" -ForegroundColor Yellow
    }
}

# ===== 6. Gitea Release 릴리즈 노트 동기화 및 바이너리/압축 에셋 업로드 =====
try {
    Write-Host ">>> Gitea [$giteaRepo] 릴리즈 정보 동기화 중..." -ForegroundColor Cyan
    $procInfoG = New-Object System.Diagnostics.ProcessStartInfo
    $procInfoG.FileName = "git.exe"
    $procInfoG.Arguments = "credential fill"
    $procInfoG.RedirectStandardInput = $true
    $procInfoG.RedirectStandardOutput = $true
    $procInfoG.UseShellExecute = $false
    $pG = [System.Diagnostics.Process]::Start($procInfoG)
    $pG.StandardInput.WriteLine("protocol=https")
    $pG.StandardInput.WriteLine("host=gitea.gguk.link")
    $pG.StandardInput.WriteLine("")
    $pG.StandardInput.Close()
    $credOutputG = $pG.StandardOutput.ReadToEnd()
    $pG.WaitForExit()

    $gUser = ""
    $gPass = ""
    if ($credOutputG -match "username=([^\r\n]+)") { $gUser = $matches[1].Trim() }
    if ($credOutputG -match "password=([^\r\n]+)") { $gPass = $matches[1].Trim() }

    if ($gUser -and $gPass) {
        $basicAuth = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("$($gUser):$($gPass)"))
        $gHeaders = @{
            "Authorization" = "Basic $basicAuth"
            "Content-Type"  = "application/json; charset=utf-8"
        }

        # 태그 기반 Gitea 릴리즈 조회
        $gRelease = $null
        try {
            $gRelease = Invoke-RestMethod -Uri "$giteaURL/api/v1/repos/$giteaOwner/$giteaRepo/releases/tags/v$newVer" -Headers $gHeaders -Method Get -ErrorAction Stop
        } catch {}

        $gPayload = @{
            name = $releaseTitle
            body = $commonReleaseBody
        } | ConvertTo-Json -Depth 5 -Compress

        $gRelId = $null
        if ($gRelease -and $gRelease.id) {
            $gRelId = $gRelease.id
            Invoke-RestMethod -Uri "$giteaURL/api/v1/repos/$giteaOwner/$giteaRepo/releases/$($gRelease.id)" -Headers $gHeaders -Method Patch -Body ([System.Text.Encoding]::UTF8.GetBytes($gPayload)) > $null
            Write-Host ">>> Gitea 릴리즈 노트 업데이트 완료! (ID: $gRelId)" -ForegroundColor Green
        } else {
            $gCreatePayload = @{
                tag_name = "v$newVer"
                name     = $releaseTitle
                body     = $commonReleaseBody
            } | ConvertTo-Json -Depth 5 -Compress
            $createdRel = Invoke-RestMethod -Uri "$giteaURL/api/v1/repos/$giteaOwner/$giteaRepo/releases" -Headers $gHeaders -Method Post -Body ([System.Text.Encoding]::UTF8.GetBytes($gCreatePayload))
            $gRelId = $createdRel.id
            Write-Host ">>> Gitea 릴리즈 신규 생성 완료! (ID: $gRelId)" -ForegroundColor Green
        }

        if ($gRelId) {
            # 기존 동일 에셋 삭제 후 신규 업로드 (PHGC.exe & phgc_v1.3.0.zip 2종)
            try {
                $existingAssets = Invoke-RestMethod -Uri "$giteaURL/api/v1/repos/$giteaOwner/$giteaRepo/releases/$gRelId/assets" -Headers $gHeaders -Method Get -ErrorAction SilentlyContinue
                foreach ($asset in $existingAssets) {
                    Invoke-RestMethod -Uri "$giteaURL/api/v1/repos/$giteaOwner/$giteaRepo/releases/$gRelId/assets/$($asset.id)" -Headers $gHeaders -Method Delete -ErrorAction SilentlyContinue
                }
            } catch {}

            $absExe = (Resolve-Path $exePath).Path
            $absZip = (Resolve-Path $zipPath).Path

            & curl.exe -s -S -X POST "$giteaURL/api/v1/repos/$giteaOwner/$giteaRepo/releases/$gRelId/assets?name=PHGC.exe" -u "$($gUser):$($gPass)" -F "attachment=@$absExe" > $null
            & curl.exe -s -S -X POST "$giteaURL/api/v1/repos/$giteaOwner/$giteaRepo/releases/$gRelId/assets?name=$zipName" -u "$($gUser):$($gPass)" -F "attachment=@$absZip" > $null
            Write-Host ">>> Gitea 바이너리 및 압축 파일 에셋 (PHGC.exe, $zipName) 업로드 완료!" -ForegroundColor Green
        }
    }
} catch {
    Write-Host ">>> Gitea 릴리즈 동기화 예외: $_" -ForegroundColor Yellow
}

Write-Host "==========================================" -ForegroundColor Green
Write-Host ">>> PHGC v$newVer GitHub & Gitea 릴리즈 및 배포 파이프라인 완료!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
