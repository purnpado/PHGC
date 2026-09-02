package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const (
	// 현재 앱 버전
	AppVersion = "0.1.0"

	// Gitea 서버 정보
	GiteaBaseURL = "https://gitea.gguk.link"
	GiteaOwner   = "purnpadosori"
	GiteaRepo    = "PHGC"

	// 서버 데이터 경로 (저장소 내)
	ServerDataPath = "server-data"
)

// VersionInfo 서버의 버전 정보
type VersionInfo struct {
	LatestVersion string `json:"latestVersion"`
	MinVersion    string `json:"minVersion"`
	ReleaseNotes  string `json:"releaseNotes"`
	DownloadURL   string `json:"downloadUrl"`
}

// HighSchoolData 고교 목록 데이터
type HighSchoolData struct {
	UpdatedAt   string       `json:"updatedAt"`
	Description string       `json:"description"`
	Schools     []HighSchool `json:"schools"`
}

// HighSchool 고교 정보
type HighSchool struct {
	Name string `json:"name"`
	Type string `json:"type"`
	Area string `json:"area"`
	Note string `json:"note"`
}

// SyncResult 동기화 결과
type SyncResult struct {
	Success        bool   `json:"success"`
	Message        string `json:"message"`
	SchoolCount    int    `json:"schoolCount"`
	HasUpdate      bool   `json:"hasUpdate"`
	LatestVersion  string `json:"latestVersion"`
	CurrentVersion string `json:"currentVersion"`
	ReleaseNotes   string `json:"releaseNotes"`
	DownloadURL    string `json:"downloadUrl"`
}

// SyncStepResult 동기화 단계별 결과
type SyncStepResult struct {
	Step    string `json:"step"`
	Status  string `json:"status"` // "loading", "success", "error", "skipped"
	Message string `json:"message"`
}

// SyncManager Gitea 서버와의 동기화 관리
type SyncManager struct {
	dataDir    string
	httpClient *http.Client
}

// NewSyncManager 동기화 매니저 생성
func NewSyncManager(dataDir string) *SyncManager {
	return &SyncManager{
		dataDir: dataDir,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// getRawFileURL 브릿지 서버 프록시 URL 생성
func (sm *SyncManager) getRawFileURL(filePath string) string {
	return fmt.Sprintf("https://go.gguk.link/api/sync/server-data/%s", filePath)
}

// downloadFile Gitea에서 파일 다운로드
func (sm *SyncManager) downloadFile(remotePath string) ([]byte, error) {
	url := sm.getRawFileURL(remotePath)
	resp, err := sm.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("서버 연결 실패: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("파일 다운로드 실패 (HTTP %d)", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("데이터 읽기 실패: %w", err)
	}
	return data, nil
}

// saveToFile 로컬 파일로 저장
func (sm *SyncManager) saveToFile(filename string, data []byte) error {
	filePath := filepath.Join(sm.dataDir, filename)
	return os.WriteFile(filePath, data, 0644)
}

// CheckVersion 서버에서 최신 버전 확인
func (sm *SyncManager) CheckVersion() (*VersionInfo, error) {
	data, err := sm.downloadFile("version.json")
	if err != nil {
		return nil, err
	}

	var versionInfo VersionInfo
	if err := json.Unmarshal(data, &versionInfo); err != nil {
		return nil, fmt.Errorf("버전 정보 파싱 실패: %w", err)
	}
	return &versionInfo, nil
}

// SyncHighSchools 고교 목록 동기화
func (sm *SyncManager) SyncHighSchools() (*HighSchoolData, error) {
	data, err := sm.downloadFile("highschools.json")
	if err != nil {
		return nil, err
	}

	var schoolData HighSchoolData
	if err := json.Unmarshal(data, &schoolData); err != nil {
		return nil, fmt.Errorf("고교 데이터 파싱 실패: %w", err)
	}

	// 로컬에 저장
	if err := sm.saveToFile("highschools.json", data); err != nil {
		return nil, fmt.Errorf("고교 데이터 저장 실패: %w", err)
	}

	return &schoolData, nil
}

// FullSync 전체 동기화 실행
func (sm *SyncManager) FullSync() *SyncResult {
	result := &SyncResult{
		CurrentVersion: AppVersion,
		Success:        true,
	}

	// 1. 고교 목록 동기화
	schoolData, err := sm.SyncHighSchools()
	if err != nil {
		result.Success = false
		result.Message = fmt.Sprintf("고교 데이터 동기화 실패: %s", err.Error())
		return result
	}
	result.SchoolCount = len(schoolData.Schools)

	// 2. 버전 확인
	versionInfo, err := sm.CheckVersion()
	if err != nil {
		// 버전 확인 실패해도 동기화 자체는 성공 처리
		result.HasUpdate = false
		result.LatestVersion = AppVersion
		result.Message = "데이터 동기화 완료 (버전 확인은 실패)"
		return result
	}

	result.LatestVersion = versionInfo.LatestVersion
	result.ReleaseNotes = versionInfo.ReleaseNotes
	result.DownloadURL = versionInfo.DownloadURL

	// 버전 비교 (단순 문자열 비교)
	if versionInfo.LatestVersion != AppVersion {
		result.HasUpdate = true
		result.Message = fmt.Sprintf("새 버전 %s 사용 가능!", versionInfo.LatestVersion)
	} else {
		result.HasUpdate = false
		result.Message = "모든 데이터가 최신 상태입니다"
	}

	return result
}

// GetCurrentVersion 현재 앱 버전 반환
func (sm *SyncManager) GetCurrentVersion() string {
	return AppVersion
}
