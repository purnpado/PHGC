package main

import (
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unicode/utf16"
)

// DownloadAndApplyUpdate 새 버전 바이너리를 다운로드하고 자동 교체 및 재실행
func DownloadAndApplyUpdate(customURL string) error {
	// 1. 현재 실행파일 경로 파악
	currentExe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("현재 실행파일 경로를 찾을 수 없습니다: %w", err)
	}
	currentExe, _ = filepath.EvalSymlinks(currentExe)
	exeDir := filepath.Dir(currentExe)

	// 2. 다운로드 대상 URL 결정
	// 브릿지 서버의 sync 프록시 엔드포인트를 활용하여 비공개 저장소 파일 직접 다운로드
	downloadURL := "https://go.gguk.link/api/sync/server-data/PHGC.exe"
	if customURL != "" && strings.HasSuffix(customURL, ".exe") {
		downloadURL = customURL
	}

	// 3. 임시 파일 경로 (실행파일 디렉토리에 생성)
	tempExe := filepath.Join(exeDir, "PHGC_update.tmp")

	// 4. HTTP 다운로드 실행
	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get(downloadURL)
	if err != nil {
		return fmt.Errorf("업데이트 파일 다운로드 실패 (서버 연결 오류): %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("업데이트 파일 다운로드 실패 (HTTP %d)", resp.StatusCode)
	}

	out, err := os.Create(tempExe)
	if err != nil {
		return fmt.Errorf("임시 파일 생성 실패 (권한 확인 필요): %w", err)
	}

	_, err = io.Copy(out, resp.Body)
	out.Close()
	if err != nil {
		os.Remove(tempExe)
		return fmt.Errorf("다운로드 데이터 저장 실패: %w", err)
	}

	// 5. PowerShell 백그라운드 스크립트 작성
	// 한글 경로, 공백 및 터미널 창 노출 방지를 위해 PowerShell Hidden 및 LiteralPath 사용
	currentPid := os.Getpid()
	psScript := fmt.Sprintf(`
$pidToWait = %d
$tempPath = '%s'
$targetPath = '%s'

try {
    $proc = Get-Process -Id $pidToWait -ErrorAction SilentlyContinue
    if ($proc) { $proc.WaitForExit(5000) }
} catch {}
Start-Sleep -Milliseconds 500

$success = $false
for ($i = 0; $i -lt 15; $i++) {
    try {
        Move-Item -LiteralPath $tempPath -Destination $targetPath -Force -ErrorAction Stop
        $success = $true
        break
    } catch {
        Start-Sleep -Milliseconds 400
    }
}

if ($success) {
    Start-Process -FilePath $targetPath
}
`, currentPid, strings.ReplaceAll(tempExe, "'", "''"), strings.ReplaceAll(currentExe, "'", "''"))

	// UTF-16LE 인코딩 후 Base64 변환
	encodedScript := encodePowerShell(psScript)

	// 6. PowerShell 무창(CREATE_NO_WINDOW) 프로세스 실행 (터미널 창 완전 숨김)
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", encodedScript)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
	}

	if err := cmd.Start(); err != nil {
		os.Remove(tempExe)
		return fmt.Errorf("업데이트 프로세스 실행 실패: %w", err)
	}

	// 7. 메인 프로그램 종료
	go func() {
		time.Sleep(300 * time.Millisecond)
		os.Exit(0)
	}()

	return nil
}

// encodePowerShell PowerShell -EncodedCommand용 UTF-16LE Base64 인코딩
func encodePowerShell(script string) string {
	runes := []rune(script)
	u16s := utf16.Encode(runes)
	bytes := make([]byte, len(u16s)*2)
	for i, u := range u16s {
		bytes[i*2] = byte(u)
		bytes[i*2+1] = byte(u >> 8)
	}
	return base64.StdEncoding.EncodeToString(bytes)
}
