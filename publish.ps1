# PHGC 자동 버전업 & 빌드 & 푸시 스크립트
param (
    [string]$Notes = "기능 개선 및 안정화 업데이트"
)

$ErrorActionPreference = "Stop"

# 1. 현재 버전 읽기
$versionFile = "server-data/version.json"
$json = Get-Content $versionFile -Raw -Encoding UTF8 | ConvertFrom-Json
$currentVer = $json.latestVersion

# 2. 버전 번호 자동 증가 (예: 0.5.0 -> 0.5.1)
$parts = $currentVer.Split('.')
if ($parts.Length -eq 3) {
    $patch = [int]$parts[2] + 1
    $newVer = "$($parts[0]).$($parts[1]).$patch"
} else {
    $newVer = "0.5.1"
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "🚀 버전 자동 증가: $currentVer -> $newVer" -ForegroundColor Green
Write-Host "📝 릴리즈 노트: $Notes" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Cyan

# 3. server-data/version.json 업데이트
$json.latestVersion = $newVer
$json.releaseNotes = "v$newVer — $Notes"
$json | ConvertTo-Json -Depth 4 | Set-Content $versionFile -Encoding UTF8

# 4. sync.go 업데이트
$syncFile = "sync.go"
$syncContent = Get-Content $syncFile -Raw -Encoding UTF8
$syncContent = $syncContent -replace 'AppVersion = "[^"]+"', "AppVersion = `"$newVer`""
Set-Content -Path $syncFile -Value $syncContent -Encoding UTF8

# 5. 실행 중인 PHGC 종료
Stop-Process -Name "PHGC" -Force -ErrorAction SilentlyContinue

# 6. Wails 빌드
Write-Host "🔨 Wails 빌드 실행 중..." -ForegroundColor Cyan
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
wails build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 빌드 실패!" -ForegroundColor Red
    exit 1
}

# 7. Git 커밋 & 태그 & 푸시
Write-Host "📤 Git 푸시 및 태그 릴리즈 생성 중..." -ForegroundColor Cyan
git add .
git commit -m "release: v$newVer — $Notes"
git tag -a "v$newVer" -m "v$newVer — $Notes" -f
git push
git push origin "v$newVer" -f

Write-Host "==========================================" -ForegroundColor Green
Write-Host "🎉 v$newVer 배포, 태그 및 푸시 완료!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
