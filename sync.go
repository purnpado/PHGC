package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	// 애플리케이션 버전 (v1.2.1 오프라인 전용 에디션)
	AppVersion = "1.2.2"

	// 기본 로컬 데이터 폴더
	ServerDataPath = "server-data"
)

// VersionInfo 버전 정보 구조체
type VersionInfo struct {
	LatestVersion string `json:"latestVersion"`
	MinVersion    string `json:"minVersion"`
	ReleaseNotes  string `json:"releaseNotes"`
	DownloadURL   string `json:"downloadUrl"`
}

// HighSchoolData 고등학교 목록 데이터 구조체
type HighSchoolData struct {
	UpdatedAt   string       `json:"updatedAt"`
	Description string       `json:"description"`
	Schools     []HighSchool `json:"schools"`
}

// HighSchool 고등학교 정보
type HighSchool struct {
	Name        string   `json:"name"`
	Type        string   `json:"type"`
	Area        string   `json:"area"`
	Note        string   `json:"note"`
	Departments []string `json:"departments"`
}

// OfficialAdmissionData 공식 고입 전형자료 구조체
type OfficialAdmissionData struct {
	Items []map[string]interface{} `json:"items"`
}

// SyncResult 동기화 결과 구조체
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

// SyncManager 로컬 데이터 관리자 (오프라인 전용: 네트워크 I/O 전무)
type SyncManager struct {
	dataDir string
}

// NewSyncManager 동기화 관리자 생성
func NewSyncManager(dataDir string) *SyncManager {
	return &SyncManager{
		dataDir: dataDir,
	}
}

// saveToFile 로컬 파일로 저장
func (sm *SyncManager) saveToFile(filename string, data []byte) error {
	filePath := filepath.Join(sm.dataDir, filename)
	if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		return fmt.Errorf("폴더 생성 실패: %w", err)
	}
	return os.WriteFile(filePath, data, 0644)
}

// CheckVersion 로컬 버전 확인
func (sm *SyncManager) CheckVersion() (*VersionInfo, error) {
	return &VersionInfo{
		LatestVersion: AppVersion,
		MinVersion:    "1.0.0",
		ReleaseNotes:  "100% 오프라인 전용 버전 (정보보안 지침 완벽 준수, 외부 통신 원천 차단)",
		DownloadURL:   "",
	}, nil
}

// SyncHighSchools 로컬 고등학교 목록 로드
func (sm *SyncManager) SyncHighSchools() (*HighSchoolData, error) {
	return sm.GetHighSchools()
}

// FullSync 전체 동기화 실행 (100% 로컬 데이터 로드)
func (sm *SyncManager) FullSync() *SyncResult {
	result := &SyncResult{
		CurrentVersion: AppVersion,
		LatestVersion:  AppVersion,
		HasUpdate:      false,
		Success:        true,
		Message:        "100% 안전한 오프라인 모드로 실행 중입니다 (외부 통신 원천 차단)",
	}

	schoolData, err := sm.GetHighSchools()
	if err == nil && schoolData != nil {
		result.SchoolCount = len(schoolData.Schools)
	}

	return result
}

// isNewerVersion 버전 비교 함수
func isNewerVersion(remote, local string) bool {
	remote = strings.TrimPrefix(strings.TrimSpace(remote), "v")
	local = strings.TrimPrefix(strings.TrimSpace(local), "v")

	rParts := strings.Split(remote, ".")
	lParts := strings.Split(local, ".")

	for i := 0; i < len(rParts) && i < len(lParts); i++ {
		rNum := 0
		lNum := 0
		fmt.Sscanf(rParts[i], "%d", &rNum)
		fmt.Sscanf(lParts[i], "%d", &lNum)

		if rNum > lNum {
			return true
		} else if rNum < lNum {
			return false
		}
	}

	return len(rParts) > len(lParts)
}

// GetCurrentVersion 현재 버전 반환
func (sm *SyncManager) GetCurrentVersion() string {
	return AppVersion
}

// GetHighSchools 고등학교 목록 반환 (로컬 파일 또는 기본 내장 데이터)
func (sm *SyncManager) GetHighSchools() (*HighSchoolData, error) {
	localPath := filepath.Join(sm.dataDir, "highschools.json")
	if data, err := os.ReadFile(localPath); err == nil {
		data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
		var schoolData HighSchoolData
		if err := json.Unmarshal(data, &schoolData); err == nil {
			return &schoolData, nil
		}
	}

	// 기본 내장 고등학교 목록 데이터
	return sm.getDefaultHighSchools(), nil
}

// getDefaultHighSchools 기본 내장 고교 목록
func (sm *SyncManager) getDefaultHighSchools() *HighSchoolData {
	return &HighSchoolData{
		UpdatedAt:   time.Now().Format("2006-01-02"),
		Description: "울산 관내 고등학교 기본 데이터 (오프라인 내장)",
		Schools: []HighSchool{
			{Name: "울산 후기 일반계고", Type: "general", Area: "울산 전체", Note: "후기 일반계고 전체", Departments: []string{"전체"}},
			{Name: "울산마이스터고등학교", Type: "meister", Area: "북구", Note: "마이스터고", Departments: []string{"전기시스템제어과", "자동화시스템과", "정밀기계과"}},
			{Name: "울산에너지고등학교", Type: "meister", Area: "북구", Note: "마이스터고", Departments: []string{"전기에너지과", "신재생에너지과"}},
			{Name: "현대공업고등학교", Type: "meister", Area: "동구", Note: "마이스터고", Departments: []string{"정밀기계과", "산업설비과", "전기제어과"}},
			{Name: "울산공업고등학교", Type: "special", Area: "남구", Note: "특성화고", Departments: []string{"스마트기계과", "스마트전기전자과", "스마트건설과", "화공에너지과"}},
			{Name: "울산기술공업고등학교", Type: "special", Area: "울주군", Note: "특성화고", Departments: []string{"산업설비기계과", "드론공간정보과", "융합디자인과", "전기과"}},
			{Name: "울산미용예술고등학교", Type: "special", Area: "울주군", Note: "특성화고", Departments: []string{"미용예술과"}},
			{Name: "울산산업고등학교", Type: "special", Area: "울주군", Note: "특성화고", Departments: []string{"그린스마트팜과", "원예디자인과", "반려동물과", "식품가공과", "보건간호과"}},
			{Name: "울산생활과학고등학교", Type: "special", Area: "동구", Note: "특성화고", Departments: []string{"보건간호과", "사무행정과", "조리과"}},
			{Name: "울산여자상업고등학교", Type: "special", Area: "남구", Note: "특성화고", Departments: []string{"관광경영과", "SNS마케팅과", "AI금융회계과", "스마트공공행정과"}},
			{Name: "울산상업고등학교", Type: "special", Area: "울주군", Note: "특성화고", Departments: []string{"군사경영과", "물류경영과", "IT콘텐츠과"}},
			{Name: "청량고등학교", Type: "special", Area: "울주군", Note: "특성화고", Departments: []string{"K-Food조리과", "콘텐츠디자인과", "보건간호과"}},
			{Name: "울산과학고등학교", Type: "self_foreign", Area: "울주군", Note: "특수목적고", Departments: []string{"자연과정"}},
			{Name: "울산외국어고등학교", Type: "self_foreign", Area: "북구", Note: "특수목적고", Departments: []string{"영어과", "러시아어과", "일본어과", "중국어과", "아랍어과"}},
			{Name: "울산스포츠과학고등학교", Type: "self_foreign", Area: "북구", Note: "특수목적고", Departments: []string{"스포츠과정"}},
			{Name: "울산예술고등학교", Type: "self_foreign", Area: "울주군", Note: "특수목적고", Departments: []string{"음악과", "미술과", "무용과"}},
			{Name: "현대청운고등학교", Type: "self_foreign", Area: "동구", Note: "전국단위 자사고", Departments: []string{"보통과"}},
		},
	}
}

// GetOfficialAdmissionData 로컬 공식자료 읽기
func (sm *SyncManager) GetOfficialAdmissionData() (*OfficialAdmissionData, error) {
	localPath := filepath.Join(sm.dataDir, "official_admission_data.json")
	if data, err := os.ReadFile(localPath); err == nil {
		data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
		var official OfficialAdmissionData
		if err := json.Unmarshal(data, &official); err == nil {
			return &official, nil
		}
	}
	return &OfficialAdmissionData{Items: []map[string]interface{}{}}, nil
}

// NoticeItem 공지사항 구조체
type NoticeItem struct {
	Title       string `json:"title"`
	Content     string `json:"content"`
	PublishedAt string `json:"publishedAt"`
}

// GetNotices 로컬 공지사항 목록 읽기
func (sm *SyncManager) GetNotices() ([]NoticeItem, error) {
	const filename = "notice.json"
	localPath := filepath.Join(sm.dataDir, filename)
	if data, err := os.ReadFile(localPath); err == nil {
		data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
		var items []NoticeItem
		if err := json.Unmarshal(data, &items); err == nil {
			return items, nil
		}
	}
	return []NoticeItem{}, nil
}



