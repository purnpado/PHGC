package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
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
	// 브릿지 서버의 Gitea Release Asset 프록시 다운로드 엔드포인트를 기본으로 활용
	downloadURL := "https://go.gguk.link/api/download/PHGC.exe"
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

	// 5. Windows 배치 파일 생성하여 현재 프로세스 종료 후 덮어쓰기 & 재실행
	batPath := filepath.Join(exeDir, "apply_update.bat")
	batContent := fmt.Sprintf(`@echo off
setlocal
chcp 65001 > nul
timeout /t 2 /nobreak > nul

:retry
move /y "%s" "%s" > nul 2>&1
if errorlevel 1 (
    timeout /t 1 /nobreak > nul
    goto retry
)

start "" "%s"
del "%%~f0"
`, tempExe, currentExe, currentExe)

	if err := os.WriteFile(batPath, []byte(batContent), 0755); err != nil {
		os.Remove(tempExe)
		return fmt.Errorf("업데이트 배치파일 생성 실패: %w", err)
	}

	// 6. 배치파일 백그라운드 실행 후 현재 프로세스 즉시 종료
	cmd := exec.Command("cmd.exe", "/c", "start", "/min", batPath)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("업데이트 스크립트 실행 실패: %w", err)
	}

	// 7. 메인 프로그램 종료
	go func() {
		time.Sleep(500 * time.Millisecond)
		os.Exit(0)
	}()

	return nil
}
