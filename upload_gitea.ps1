# Gitea 릴리즈 바이너리 업로드 전용 스크립트 (화면에 토큰 노출 없음)
$tag = "v1.2.2"
$owner = "purnpadosori"
$repo = "PHGC-OFFLINE"
$giteaUrl = "https://gitea.gguk.link"
$exePath = "D:\PHGC\build\bin\PHGC_v1.2.2.exe"

if (-not (Test-Path $exePath)) {
    $exePath = "D:\PHGC\build\bin\PHGC.exe"
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ">>> Gitea [$repo] $tag 릴리즈 바이너리 업로드" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 토큰을 안전하게 마스킹 입력받음 (화면에 글자 노출 안 됨)
$secureToken = Read-Host "Gitea 토큰을 붙여넣고 엔터를 누르세요 (화면에 보이지 않음)" -AsSecureString
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
$token = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)

if (-not $token) {
    Write-Host "토큰이 입력되지 않아 취소되었습니다." -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "token $token"
    "Content-Type"  = "application/json; charset=utf-8"
}

# 기존 릴리즈 확인
try {
    $existing = Invoke-RestMethod -Uri "$giteaUrl/api/v1/repos/$owner/$repo/releases/tags/$tag" -Headers $headers -Method Get -ErrorAction SilentlyContinue
    if ($existing.id) {
        Write-Host ">>> 기존 릴리즈 갱신 중..." -ForegroundColor Yellow
        Invoke-RestMethod -Uri "$giteaUrl/api/v1/repos/$owner/$repo/releases/$($existing.id)" -Headers $headers -Method Delete -ErrorAction SilentlyContinue
    }
} catch {}

# 릴리즈 생성
$body = @{
    tag_name   = $tag
    name       = "$tag - 스마트 1:1 진학 상담 일지 및 보안 격리 체계 탑재"
    body       = "## 🌟 $tag 정식 릴리즈`n`n- 스마트 1:1 진학 상담 일지(상담 날짜·목표고교·스마트태그) 탑재`n- 교원별 비밀보장 및 자료취합 보안 격리`n- 오프라인 단일 실행파일 배포"
    draft      = $false
    prerelease = $false
} | ConvertTo-Json -Depth 4
$bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)

try {
    $release = Invoke-RestMethod -Uri "$giteaUrl/api/v1/repos/$owner/$repo/releases" -Headers $headers -Method Post -Body $bodyBytes
    $relId = $release.id

    Write-Host ">>> PHGC_v1.2.2.exe 업로드 중... 잠시만 기다려주세요." -ForegroundColor Cyan
    & curl.exe -s -S -X POST "$giteaUrl/api/v1/repos/$owner/$repo/releases/$relId/assets?name=PHGC_v1.2.2.exe" `
        -H "Authorization: token $token" `
        -H "Accept: application/json" `
        -F "attachment=@$exePath"

    Write-Host "==========================================" -ForegroundColor Green
    Write-Host ">>> Gitea $tag 릴리즈 바이너리 업로드 완료!" -ForegroundColor Green
    Write-Host ">>> 확인 링크: $giteaUrl/$owner/$repo/releases" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
} catch {
    Write-Host ">>> 업로드 실패: $_" -ForegroundColor Red
} finally {
    # 메모리에서 토큰 즉시 제거
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    $token = $null
}
