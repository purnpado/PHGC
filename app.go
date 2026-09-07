package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/crypto/bcrypt"
)

// 브릿지 서버 주소 (배포 환경에 맞게 수정)
const BridgeServerURL = "https://go.gguk.link"

// ExpectedSupportItem contains only an aggregate per target school/department.
// It deliberately has no student, class, teacher or individual-score field.
type ExpectedSupportItem struct {
	Category       string  `json:"category"`
	TargetSchool   string  `json:"targetSchool"`
	Department     string  `json:"department"`
	Track          string  `json:"track"`
	PreferenceRank int     `json:"preferenceRank"`
	PlannedCount   int     `json:"plannedCount"`
	SubmittedCount int     `json:"submittedCount"`
	MaxScore       float64 `json:"maxScore"`
	MinScore       float64 `json:"minScore"`
	AvgScore       float64 `json:"avgScore"`
}

type ExpectedSupportSubmission struct {
	AdmissionYear          int                   `json:"admissionYear"`
	SourceMiddleSchoolName string                `json:"sourceMiddleSchoolName"`
	Items                  []ExpectedSupportItem `json:"items"`
}

// ExpectedSupportAggregate is the participant-facing Ulsan-wide result. It
// excludes submitting-school names and all score information.
type ExpectedSupportAggregate struct {
	AdmissionYear  int    `json:"admissionYear"`
	Category       string `json:"category"`
	TargetSchool   string `json:"targetSchool"`
	Department     string `json:"department"`
	Track          string `json:"track"`
	PreferenceRank int    `json:"preferenceRank"`
	PlannedCount   int    `json:"plannedCount"`
	SubmittedCount int    `json:"submittedCount"`
}

// App struct
type App struct {
	ctx     context.Context
	db      *DBManager
	sync    *SyncManager
	dataKey []byte
	user    *User
}

// NewApp creates a new App application struct
func NewApp() *App {
	dbm := NewDBManager()
	return &App{
		db:   dbm,
		sync: NewSyncManager(dbm.dataDir),
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// 이미 배포된 data 폴더는 config.db.phgc 상태로 시작한다. 로그인 전에는
	// 절대 빈 config.db를 새로 만들지 않는다.
	if !a.db.hasEncryptedConfigDB() {
		if err := a.db.InitConfigDB(); err != nil {
			fmt.Println("config DB 초기화 오류:", err)
		}
	}
}

func (a *App) shutdown(ctx context.Context) {
	if err := a.db.SealAllDatabases(); err != nil {
		fmt.Println("DB 암호화 종료 처리 오류:", err)
	}
}

// --- 프론트엔드 바인딩 API ---

// CheckSetupComplete 초기 설정 완료 여부 확인
func (a *App) CheckSetupComplete() bool {
	if a.db.hasEncryptedConfigDB() {
		return true
	}
	return a.db.HasConfig()
}

// GetSchoolConfig 학교 설정 조회
func (a *App) GetSchoolConfig() (*SchoolConfig, error) {
	return a.db.GetSchoolConfig()
}

// UpdateAdmissionYear updates the default cutoff entry year without changing
// accounts, passwords, or encrypted data-key envelopes.
func (a *App) UpdateAdmissionYear(admissionYear int) error {
	return a.db.UpdateAdmissionYear(admissionYear)
}

// SetupApp 초기 설정 저장
func (a *App) SetupApp(req SetupRequest) error {
	if req.SchoolName == "" || req.ClassCount <= 0 || req.AdminPassword == "" || req.SharedDataPassword == "" {
		return fmt.Errorf("모든 설정 값을 올바르게 입력해주세요")
	}
	if len(a.dataKey) != 32 {
		key, err := newDataKey()
		if err != nil {
			return fmt.Errorf("데이터 암호화 키 생성 실패: %w", err)
		}
		a.dataKey = key
		a.db.setDataKey(key)
	}

	// 비밀번호 해싱 및 설정 저장
	hashedPwd, err := bcrypt.GenerateFromPassword([]byte(req.AdminPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("비밀번호 암호화 실패: %w", err)
	}

	// DB에 설정 저장 (입학년도 포함)
	err = a.db.SaveSchoolConfig(req.SchoolName, req.ClassCount, string(hashedPwd), req.IsSmallSchool, req.AdmissionYear)
	if err != nil {
		return fmt.Errorf("설정 저장 실패: %w", err)
	}

	// 사용자 초기 계정 생성 (마스터, 뷰어, 담임) - 비밀번호는 비워둠
	err = a.db.InitUsers(req.ClassCount, req.AdminPassword)
	if err != nil {
		return fmt.Errorf("초기 계정 생성 실패: %w", err)
	}
	adminEnvelope, err := sealDataKeyForUser("admin", req.AdminPassword, a.dataKey)
	if err != nil {
		return err
	}
	if err := saveUserKeyEnvelope(a.db.dataDir, adminEnvelope); err != nil {
		return err
	}
	if err := saveSharedKeyEnvelope(a.db.dataDir, req.SharedDataPassword, a.dataKey); err != nil {
		return fmt.Errorf("공용 데이터 암호 설정 실패: %w", err)
	}
	return a.refreshLoginIndex()
}

// GetLoginIndex reads only the non-sensitive account selection list. It does
// not open the encrypted database.
func (a *App) GetLoginIndex() LoginIndex {
	index, err := loadLoginIndex(a.db.dataDir)
	if err != nil {
		return LoginIndex{SchoolName: "암호화된 학교 데이터"}
	}
	return index
}

func (a *App) refreshLoginIndex() error {
	config, err := a.db.GetSchoolConfig()
	if err != nil {
		return err
	}
	users, err := a.db.GetUsers()
	if err != nil {
		return err
	}
	return saveLoginIndex(a.db.dataDir, config.SchoolName, users)
}

// VerifyUserLogin 검증
func (a *App) VerifyUserLogin(username, password string) (*User, error) {
	return a.db.VerifyUserLogin(username, password)
}

// UnlockAndLogin opens the user's encrypted data-key envelope with the same
// personal password used for login. The data key only remains in memory.
func (a *App) UnlockAndLogin(username, password string) (*User, error) {
	envelope, err := loadUserKeyEnvelope(a.db.dataDir, username)
	if err != nil {
		return nil, fmt.Errorf("이 PC의 data 폴더에 %s 계정용 잠금 정보가 없습니다", username)
	}
	key, err := openDataKeyForUser(envelope, password)
	if err != nil || len(key) != 32 {
		return nil, fmt.Errorf("비밀번호가 올바르지 않거나 잠금 정보가 손상되었습니다")
	}
	a.dataKey = key
	a.db.setDataKey(key)
	if err := a.db.UnsealAllDatabases(); err != nil {
		a.dataKey = nil
		a.db.setDataKey(nil)
		return nil, err
	}
	if err := a.db.InitConfigDB(); err != nil {
		_ = a.db.SealAllDatabases()
		a.dataKey = nil
		a.db.setDataKey(nil)
		return nil, err
	}
	user, err := a.db.VerifyUserLogin(username, password)
	if err != nil {
		_ = a.db.SealAllDatabases()
		a.dataKey = nil
		a.db.setDataKey(nil)
		return nil, err
	}
	a.user = user
	return user, nil
}

// NeedsSharedDataPassword reports whether this copy of data has completed the
// user's one-time enrollment. It never opens the encrypted databases.
func (a *App) NeedsSharedDataPassword(username string) bool {
	_, err := loadUserKeyEnvelope(a.db.dataDir, username)
	return err != nil
}

// UnlockSharedAndLogin is used only on the first run of a copied data folder.
// The shared password opens the data key once; the user's own password then
// creates a local personal envelope for all future logins.
func (a *App) UnlockSharedAndLogin(username, password, sharedPassword string) (*User, error) {
	key, err := openSharedKeyEnvelope(a.db.dataDir, sharedPassword)
	if err != nil || len(key) != 32 {
		return nil, fmt.Errorf("공용 데이터 암호가 올바르지 않거나 data 폴더가 손상되었습니다")
	}
	a.dataKey = key
	a.db.setDataKey(key)
	if err := a.db.UnsealAllDatabases(); err != nil {
		return nil, err
	}
	if err := a.db.InitConfigDB(); err != nil {
		_ = a.db.SealAllDatabases()
		a.dataKey = nil
		a.db.setDataKey(nil)
		return nil, err
	}
	user, err := a.db.VerifyUserLogin(username, password)
	if err != nil {
		_ = a.db.SealAllDatabases()
		a.dataKey = nil
		a.db.setDataKey(nil)
		return nil, err
	}
	envelope, err := sealDataKeyForUser(username, password, key)
	if err != nil {
		return nil, err
	}
	if err := saveUserKeyEnvelope(a.db.dataDir, envelope); err != nil {
		return nil, err
	}
	a.user = user
	return user, nil
}

// Logout clears the in-memory role. Encrypted files are sealed only at
// application shutdown so the active UI can still complete its transition.
func (a *App) Logout() {
	a.user = nil
}

// ChangeUserPassword 비밀번호 변경
func (a *App) ChangeUserPassword(username, newPassword string) error {
	return a.replaceUserKeyEnvelope(username, newPassword, func() error {
		return a.db.ChangeUserPassword(username, newPassword)
	})
}

// replaceUserKeyEnvelope changes a personal login password together with the
// AES data-key envelope it unlocks.  The two files are intentionally updated
// with rollback protection: neither the old nor the new password may leave a
// user unable to open the encrypted data package.
func (a *App) replaceUserKeyEnvelope(username, newPassword string, applyPasswordChange func() error) error {
	if strings.TrimSpace(newPassword) == "" {
		return fmt.Errorf("새 비밀번호를 입력해주세요")
	}
	if len(a.dataKey) != 32 {
		return fmt.Errorf("데이터 잠금 키가 준비되지 않았습니다")
	}
	envelope, err := sealDataKeyForUser(username, newPassword, a.dataKey)
	if err != nil {
		return err
	}

	// The account password and this envelope must change as one unit.  Keep a
	// byte-for-byte copy so a database error can never strand the user with a
	// key file that only the new password opens.
	path := userEnvelopePath(a.db.dataDir, username)
	previous, readErr := os.ReadFile(path)
	if readErr != nil && !os.IsNotExist(readErr) {
		return fmt.Errorf("기존 사용자 잠금 정보 읽기 실패: %w", readErr)
	}
	if err := saveUserKeyEnvelope(a.db.dataDir, envelope); err != nil {
		return fmt.Errorf("새 사용자 잠금 정보 저장 실패: %w", err)
	}
	if err := applyPasswordChange(); err != nil {
		if readErr == nil {
			_ = writePrivateFileAtomically(path, previous)
		} else {
			_ = os.Remove(path)
		}
		return fmt.Errorf("비밀번호 변경 실패: %w", err)
	}
	return nil
}

// GetUsers 사용자 목록 조회
func (a *App) GetUsers() ([]User, error) {
	return a.db.GetUsers()
}

// SetUserPassword 특정 사용자 비밀번호 설정 (관리자용)
func (a *App) SetUserPassword(username, newPassword string) error {
	if strings.TrimSpace(newPassword) == "" {
		return fmt.Errorf("새 비밀번호를 입력해주세요")
	}
	users, err := a.db.GetUsers()
	if err != nil {
		return err
	}
	for _, user := range users {
		if user.Username != username {
			continue
		}
		if user.Role == "master" {
			// The master account has no separate onboarding step.  Its assigned
			// password must immediately open both the login record and the AES
			// data-key envelope.
			return a.replaceUserKeyEnvelope(username, newPassword, func() error {
				return a.db.ChangeUserPassword(username, newPassword)
			})
		}

		// For homeroom/viewer accounts, remove any old personal envelope first.
		// On the recipient's first login the normal shared-data-password flow
		// creates a new envelope from the newly assigned initial password.
		// This preserves portable package onboarding after an administrator reset.
		path := userEnvelopePath(a.db.dataDir, username)
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("기존 사용자 잠금 정보 초기화 실패: %w", err)
		}
		return a.db.SetUserPassword(username, newPassword)
	}
	return fmt.Errorf("계정을 찾을 수 없습니다")
}

// ExportPasswordResetPackage creates a small encrypted recovery file for a
// non-master account.  It contains the updated encrypted config DB only, not
// any class/student DB.  The recipient imports it from the login screen.
func (a *App) ExportPasswordResetPackage(username, outputPath string) error {
	if username == "" || outputPath == "" {
		return fmt.Errorf("재설정할 계정과 저장 위치가 필요합니다")
	}
	if len(a.dataKey) != 32 {
		return fmt.Errorf("데이터 잠금을 먼저 해제해주세요")
	}
	users, err := a.db.GetUsers()
	if err != nil {
		return err
	}
	found := false
	for _, user := range users {
		if user.Username == username {
			if user.Role == "master" {
				return fmt.Errorf("학년부장 계정은 재설정 파일이 필요하지 않습니다")
			}
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("계정을 찾을 수 없습니다")
	}

	// Ensure the password hash update is in the SQLite main file before taking
	// a snapshot, without sealing or interrupting the running administrator app.
	db, err := a.db.openDB(a.db.getConfigDBPath())
	if err != nil {
		return err
	}
	if _, err = db.Exec("PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
		db.Close()
		return fmt.Errorf("재설정 정보 준비 실패: %w", err)
	}
	db.Close()

	tmp, err := os.CreateTemp(a.db.dataDir, ".password-reset-config-*.phgc")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return err
	}
	defer os.Remove(tmpPath)
	if err := encryptFileGCM(hex.EncodeToString(a.dataKey), a.db.getConfigDBPath(), tmpPath); err != nil {
		return fmt.Errorf("재설정 정보 암호화 실패: %w", err)
	}
	encryptedConfig, err := os.ReadFile(tmpPath)
	if err != nil {
		return err
	}
	payload, err := json.Marshal(PasswordResetPackage{
		Format:         "PHGC-PASSWORD-RESET-1",
		Username:       username,
		ConfigDatabase: encryptedConfig,
	})
	if err != nil {
		return err
	}
	if err := writePrivateFileAtomically(outputPath, payload); err != nil {
		return fmt.Errorf("재설정 파일 저장 실패: %w", err)
	}
	return nil
}

// SavePasswordResetPackage opens a native save dialog for a teacher reset
// package.  It is called immediately after the administrator assigns a new
// initial password.
func (a *App) SavePasswordResetPackage(username string) (string, error) {
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "담임 비밀번호 재설정 파일 저장",
		DefaultFilename: fmt.Sprintf("PHGC-%s-비밀번호재설정.phgcreset", username),
		Filters:         []runtime.FileFilter{{DisplayName: "PHGC 비밀번호 재설정 파일", Pattern: "*.phgcreset"}},
	})
	if err != nil || path == "" {
		return "", err
	}
	if err := a.ExportPasswordResetPackage(username, path); err != nil {
		return "", err
	}
	return path, nil
}

// ImportPasswordResetPackage installs a teacher-specific encrypted config
// snapshot and removes only that account's local key envelope.  The next
// login uses the existing shared-data password once and creates a fresh
// personal envelope using the newly assigned initial password.
func (a *App) ImportPasswordResetPackage(inputPath string) (string, error) {
	if inputPath == "" {
		return "", fmt.Errorf("재설정 파일을 선택해주세요")
	}
	payload, err := os.ReadFile(inputPath)
	if err != nil {
		return "", err
	}
	var reset PasswordResetPackage
	if err := json.Unmarshal(payload, &reset); err != nil {
		return "", fmt.Errorf("재설정 파일 형식이 올바르지 않습니다")
	}
	if reset.Format != "PHGC-PASSWORD-RESET-1" || reset.Username == "" || len(reset.ConfigDatabase) == 0 {
		return "", fmt.Errorf("재설정 파일 정보가 올바르지 않습니다")
	}
	if reset.Username == "admin" {
		return "", fmt.Errorf("학년부장 계정에는 이 재설정 파일을 사용할 수 없습니다")
	}
	plainConfig := a.db.getConfigDBPath()
	if _, err := os.Stat(plainConfig); err == nil {
		return "", fmt.Errorf("프로그램의 이전 작업 DB가 남아 있습니다. 프로그램을 완전히 종료한 뒤 다시 실행해주세요")
	} else if !os.IsNotExist(err) {
		return "", err
	}
	if err := writePrivateFileAtomically(plainConfig+".phgc", reset.ConfigDatabase); err != nil {
		return "", fmt.Errorf("재설정 정보 적용 실패: %w", err)
	}
	if err := os.Remove(userEnvelopePath(a.db.dataDir, reset.Username)); err != nil && !os.IsNotExist(err) {
		return "", fmt.Errorf("기존 개인 잠금 정보 초기화 실패: %w", err)
	}
	return reset.Username, nil
}

// OpenPasswordResetPackage lets a teacher select the recovery file on the
// login screen without exposing the data directory.
func (a *App) OpenPasswordResetPackage() (string, error) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title:   "담임 비밀번호 재설정 파일 선택",
		Filters: []runtime.FileFilter{{DisplayName: "PHGC 비밀번호 재설정 파일", Pattern: "*.phgcreset"}},
	})
	if err != nil || path == "" {
		return "", err
	}
	return a.ImportPasswordResetPackage(path)
}

// AddViewerUser 뷰어 계정 추가 (관리자용)
func (a *App) AddViewerUser(username, newPassword string) error {
	if err := a.db.AddViewerUser(username, newPassword); err != nil {
		return err
	}
	return a.refreshLoginIndex()
}

// VerifyAdminPassword 관리자 비밀번호 검증
func (a *App) VerifyAdminPassword(password string) (bool, error) {
	return a.db.VerifyAdminPassword(password)
}

// --- 동기화 API ---

// SyncWithServer Gitea 서버와 동기화 실행
func (a *App) SyncWithServer() *SyncResult {
	return a.sync.FullSync()
}

// GetAppVersion 현재 앱 버전 반환
func (a *App) GetAppVersion() string {
	return AppVersion
}

// --- 엑셀 임포트 API ---

// OpenExcelFile 파일 선택 다이얼로그 열기
func (a *App) OpenExcelFile() (string, error) {
	filePath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "나이스 성적 엑셀 파일 선택",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "Data Files (*.xlsx, *.xls, *.csv)",
				Pattern:     "*.xlsx;*.xls;*.csv",
			},
		},
	})
	return filePath, err
}

// ProcessExcel 엑셀 파일을 읽고 분할 저장 (반환값: 각 반별 업데이트된 학생 수 맵)
func (a *App) ProcessExcel(filePath string) (map[int]int, error) {
	if filePath == "" {
		return nil, fmt.Errorf("파일이 선택되지 않았습니다")
	}

	classData, err := ParseExcel(filePath)
	if err != nil {
		return nil, err
	}

	result := make(map[int]int)

	for classNum, students := range classData {
		err := a.db.SaveClassStudents(classNum, students)
		if err != nil {
			return nil, fmt.Errorf("%d반 데이터 저장 실패: %w", classNum, err)
		}
		result[classNum] = len(students)
	}

	return result, nil
}

// ProcessAttendanceExcel 출결 엑셀 파싱 후 DB 병합
func (a *App) ProcessAttendanceExcel(filePath string) (map[int]int, error) {
	if filePath == "" {
		return nil, fmt.Errorf("파일이 선택되지 않았습니다")
	}

	classData, err := ParseAttendanceExcel(filePath)
	if err != nil {
		return nil, err
	}

	result := make(map[int]int)
	for classNum, students := range classData {
		updatedCount, err := a.db.UpdateStudentAttendance(classNum, students)
		if err != nil {
			return nil, fmt.Errorf("%d반 출결 데이터 저장 실패: %w", classNum, err)
		}
		result[classNum] = updatedCount
	}

	return result, nil
}

// ProcessVolunteerExcel 봉사 엑셀 파싱 후 DB 병합
func (a *App) ProcessVolunteerExcel(filePath string) (map[int]int, error) {
	if filePath == "" {
		return nil, fmt.Errorf("파일이 선택되지 않았습니다")
	}

	classData, err := ParseVolunteerExcel(filePath)
	if err != nil {
		return nil, err
	}

	result := make(map[int]int)
	for classNum, students := range classData {
		updatedCount, err := a.db.UpdateStudentVolunteer(classNum, students)
		if err != nil {
			return nil, fmt.Errorf("%d반 봉사 데이터 저장 실패: %w", classNum, err)
		}
		result[classNum] = updatedCount
	}

	return result, nil
}

// GetClassStatus 전체 학급의 데이터 저장 현황(학생 수) 반환
func (a *App) GetClassStatus(classCount int) map[int]int {
	status := make(map[int]int)
	for i := 1; i <= classCount; i++ {
		status[i] = a.db.GetClassStudentCount(i)
	}
	return status
}

// --- 고입 커트라인 관리 ---

func (a *App) SaveCutoffs(cutoffs []CutoffInfo) error {
	return a.db.SaveCutoffs(cutoffs)
}

func (a *App) GetCutoffs() ([]CutoffInfo, error) {
	return a.db.GetCutoffs()
}

// --- 브릿지 서버(피드백 및 크라우드소싱) API ---

func (a *App) SendCutoffsToBridge(year int) error {
	config, err := a.db.GetSchoolConfig()
	if err != nil || config == nil || strings.TrimSpace(config.SchoolName) == "" {
		return fmt.Errorf("제출 중학교 설정을 확인해주세요")
	}
	cutoffs, err := a.db.GetCutoffs()
	if err != nil {
		return err
	}

	var yearData []CutoffInfo
	for _, c := range cutoffs {
		if c.Year == year {
			yearData = append(yearData, c)
		}
	}

	if len(yearData) == 0 {
		return fmt.Errorf("해당 연도의 데이터가 없습니다")
	}

	// 사용자가 명시적으로 제출한 공개 커트라인만 전송한다. 학생·학급·교사 정보는 전송하지 않는다.
	type publicCutoff struct {
		SourceMiddleSchoolName string  `json:"sourceMiddleSchoolName"`
		TargetHighSchoolName   string  `json:"targetHighSchoolName"`
		Department             string  `json:"department"`
		CutoffScore            float64 `json:"cutoffScore"`
	}
	items := make([]publicCutoff, 0, len(yearData))
	seen := make(map[string]bool)
	for _, cutoff := range yearData {
		key := cutoff.SchoolName + "\x00" + cutoff.Department
		if cutoff.SchoolName == "" || cutoff.MinValue < 0 || seen[key] {
			continue
		}
		seen[key] = true
		items = append(items, publicCutoff{SourceMiddleSchoolName: config.SchoolName, TargetHighSchoolName: cutoff.SchoolName, Department: cutoff.Department, CutoffScore: cutoff.MinValue})
	}
	if len(items) == 0 {
		return fmt.Errorf("제출할 학교명과 커트라인 점수 데이터가 없습니다")
	}
	payload := map[string]interface{}{"admissionYear": year, "items": items}

	jsonBytes, _ := json.Marshal(payload)
	resp, err := http.Post(BridgeServerURL+"/api/cutoff", "application/json", bytes.NewBuffer(jsonBytes))
	if err != nil {
		return fmt.Errorf("서버 연결 실패: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("서버 오류: %s", string(b))
	}
	return nil
}

// FetchCutoffsFromBridge 중앙 서버에서 취합된 커트라인 데이터를 다운로드하여 로컬 DB에 반영
func (a *App) FetchCutoffsFromBridge(year int) (int, error) {
	url := fmt.Sprintf("%s/api/cutoff?year=%d", BridgeServerURL, year)
	resp, err := http.Get(url)
	if err != nil {
		return 0, fmt.Errorf("중앙 서버 연결 실패: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return 0, fmt.Errorf("서버 응답: %s", string(b))
	}

	var resData struct {
		Success bool `json:"success"`
		Data    []struct {
			AdmissionYear          int     `json:"admissionYear"`
			SourceMiddleSchoolName string  `json:"sourceMiddleSchoolName"`
			TargetHighSchoolName   string  `json:"targetHighSchoolName"`
			Department             string  `json:"department"`
			CutoffScore            float64 `json:"cutoffScore"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&resData); err != nil {
		return 0, fmt.Errorf("데이터 파싱 실패: %w", err)
	}

	if !resData.Success || len(resData.Data) == 0 {
		return 0, fmt.Errorf("중앙 서버에 등록된 %d학년도 커트라인 데이터가 아직 없습니다.", year)
	}

	cutoffs := make([]CutoffInfo, 0, len(resData.Data))
	for _, item := range resData.Data {
		cutoffs = append(cutoffs, CutoffInfo{Year: item.AdmissionYear, SchoolName: item.TargetHighSchoolName, Department: item.Department, Track: "공개 커트라인", ScoreType: "cutoff_score", MinValue: item.CutoffScore})
	}
	if err := a.db.SaveCutoffs(cutoffs); err != nil {
		return 0, fmt.Errorf("로컬 DB 저장 실패: %w", err)
	}

	return len(cutoffs), nil
}

// RollbackSchoolCutoffs 우리 학교가 중앙 서버에 전송했던 커트라인 데이터를 회수(삭제)
func (a *App) RollbackSchoolCutoffs(year int) (string, error) {
	return "", fmt.Errorf("공개 제출 자료의 철회는 운영센터 검토를 통해 처리됩니다")
}

func (a *App) SubmitFeedback(title, content, email, attachmentName, attachmentB64 string) (int, error) {
	config, err := a.db.GetSchoolConfig()
	if err != nil {
		return 0, err
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	_ = writer.WriteField("school", config.SchoolName)
	_ = writer.WriteField("author", "PHGC 사용자")
	_ = writer.WriteField("email", email)
	_ = writer.WriteField("type", title)
	_ = writer.WriteField("content", content)
	_ = writer.WriteField("version", AppVersion)
	if attachmentName != "" && attachmentB64 != "" {
		image, err := base64.StdEncoding.DecodeString(attachmentB64)
		if err != nil {
			return 0, fmt.Errorf("첨부 이미지 형식이 올바르지 않습니다")
		}
		part, err := writer.CreateFormFile("image", attachmentName)
		if err != nil {
			return 0, fmt.Errorf("첨부 이미지 준비 실패: %w", err)
		}
		if _, err := part.Write(image); err != nil {
			return 0, fmt.Errorf("첨부 이미지 저장 실패: %w", err)
		}
	}
	if err := writer.Close(); err != nil {
		return 0, err
	}

	resp, err := http.Post(BridgeServerURL+"/api/feedback", writer.FormDataContentType(), &body)
	if err != nil {
		return 0, fmt.Errorf("서버 연결 실패: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return 0, fmt.Errorf("서버 오류: %s", string(b))
	}

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)

	issueIDValue, ok := result["issueId"].(float64)
	if !ok || issueIDValue <= 0 {
		return 0, fmt.Errorf("서버가 피드백 번호를 반환하지 않았습니다")
	}
	issueID := int(issueIDValue)

	// 로컬 DB에 기록 저장
	a.db.SaveFeedbackIssue(issueID, title)

	return issueID, nil
}

func (a *App) GetLocalFeedbacks() ([]FeedbackIssue, error) {
	return a.db.GetFeedbackIssues()
}

func (a *App) GetFeedbackDetails(issueID int) (map[string]interface{}, error) {
	resp, err := http.Get(fmt.Sprintf("%s/api/feedback/%d", BridgeServerURL, issueID))
	if err != nil {
		return nil, fmt.Errorf("서버 연결 실패: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("이슈 정보를 가져올 수 없습니다 (상태코드: %d)", resp.StatusCode)
	}

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	return result, nil
}

// GetClassGrades 특정 반의 내신 성적 가산출 결과 반환
func (a *App) GetClassGrades(classNum int) ([]StudentCalcResult, error) {
	config, err := a.db.GetSchoolConfig()
	if err != nil {
		return nil, fmt.Errorf("설정을 불러올 수 없습니다: %w", err)
	}

	// 1. 전체 학생 데이터 불러오기 (전교 석차 산출을 위함)
	allStudents, err := a.db.GetAllStudents(config.ClassCount)
	if err != nil {
		return nil, fmt.Errorf("학생 데이터를 불러오는 중 오류 발생: %w", err)
	}

	// 2. 성적 산출 및 석차 백분율 계산
	calcResults, err := CalculateGrades(allStudents, config.IsSmallSchool)
	if err != nil {
		return nil, fmt.Errorf("성적 산출 중 오류 발생: %w", err)
	}

	// 3. 요청한 반의 학생들만 필터링하여 반환
	var classResults []StudentCalcResult
	for _, res := range calcResults {
		if res.ClassNum == classNum {
			classResults = append(classResults, res)
		}
	}

	// 번호순으로 정렬
	sort.Slice(classResults, func(i, j int) bool {
		// 번호가 문자열이므로 숫자로 변환하여 비교 (가능한 경우)
		numI, errI := strconv.Atoi(classResults[i].StudentNum)
		numJ, errJ := strconv.Atoi(classResults[j].StudentNum)
		if errI == nil && errJ == nil {
			return numI < numJ
		}
		return classResults[i].StudentNum < classResults[j].StudentNum
	})

	return classResults, nil
}

// ResetAllData 데이터 폴더 삭제를 통해 완전 초기화
func (a *App) ResetAllData() error {
	// DB 연결이 열려 있을 수 있으므로 GC를 강제로 호출하거나 그냥 폴더 내용물을 지움
	// 가장 확실한 것은 설정 파일들과 DB 파일들을 지우는 것
	exePath, err := os.Executable()
	if err != nil {
		exePath = "."
	}
	dataDir := filepath.Join(filepath.Dir(exePath), "data")

	err = os.RemoveAll(dataDir)
	if err != nil {
		return fmt.Errorf("데이터 삭제 실패: %w", err)
	}

	// dataDir 다시 생성
	os.MkdirAll(dataDir, 0755)

	// 테이블 다시 생성
	if err := a.db.InitConfigDB(); err != nil {
		return fmt.Errorf("DB 초기화 실패: %w", err)
	}

	return nil
}

// matchStudent 학생 번호와 이름을 대조하여 동일 학생 여부 판별 (공백 제거, 번호 정수 일치 지원)
func matchStudent(num1, name1, num2, name2 string) bool {
	cleanName1 := strings.ReplaceAll(strings.TrimSpace(name1), " ", "")
	cleanName2 := strings.ReplaceAll(strings.TrimSpace(name2), " ", "")
	if cleanName1 != "" && cleanName2 != "" && cleanName1 == cleanName2 {
		return true
	}
	n1, err1 := strconv.Atoi(strings.TrimSpace(num1))
	n2, err2 := strconv.Atoi(strings.TrimSpace(num2))
	if err1 == nil && err2 == nil && n1 == n2 {
		return true
	}
	return strings.TrimSpace(num1) == strings.TrimSpace(num2)
}

// GetStudentFullDetail 학생 1명의 10개 고교별 산출 결과 및 상세 내역 반환
func (a *App) GetStudentFullDetail(classNum int, studentNum, name string) (*StudentFullData, error) {
	s, err := a.db.GetStudent(classNum, studentNum, name)
	if err != nil {
		return nil, fmt.Errorf("학생 정보를 찾을 수 없습니다: %w", err)
	}

	full, err := parseStudentFullData(*s)
	if err != nil {
		return nil, err
	}

	// 대시보드와 동일한 정확한 전교 석차 백분율 동기화
	classGrades, _ := a.GetClassGrades(classNum)
	for _, cg := range classGrades {
		if matchStudent(cg.StudentNum, cg.Name, studentNum, name) {
			full.GeneralHSPercentile = cg.Percentile
			full.GeneralHSAcademicScore = cg.FinalScore
			full.GeneralHSNonAcademicScore = cg.NonAcademicScore
			full.GeneralHSTotalScore = cg.GeneralTotalScore
			full.GeneralHSDataComplete = cg.GeneralDataComplete
			full.GeneralHSProjected = cg.GeneralProjected
			if cg.Percentile <= 80 {
				full.GeneralHSLevel = "상"
			} else if cg.Percentile <= 90 {
				full.GeneralHSLevel = "중"
			} else {
				full.GeneralHSLevel = "하"
			}
			break
		}
	}

	return full, nil
}

// SaveStudentExtra 학생의 수기 가산점 및 추가 봉사시간 저장
func (a *App) SaveStudentExtra(classNum int, studentNum, name, extraJSON string) error {
	return a.db.UpdateStudentExtra(classNum, studentNum, name, extraJSON)
}

func (a *App) SaveStudentApplication(record ApplicationRecord) error {
	if a.user != nil {
		if a.user.Role == "viewer" {
			return fmt.Errorf("진로부장 계정은 지원현황을 수정할 수 없습니다")
		}
		if a.user.Role == "homeroom" && a.user.ClassNum != record.ClassNum {
			return fmt.Errorf("담임 계정은 본인 학급의 지원현황만 수정할 수 있습니다")
		}
	}
	return a.db.SaveApplication(record)
}
func (a *App) GetStudentApplications(classNum int, studentNum, name string) ([]ApplicationRecord, error) {
	return a.db.GetStudentApplications(classNum, studentNum, name)
}

// GetApplicationSummaries returns school-internal aggregate counts only.
func (a *App) GetApplicationSummaries() ([]ApplicationSummary, error) {
	if a.user != nil && a.user.Role != "master" && a.user.Role != "viewer" {
		return nil, fmt.Errorf("우리 학교 지원현황은 학년부장·진로부장만 조회할 수 있습니다")
	}
	return a.db.GetApplicationSummaries()
}

// ApplyApplicationCutoffs reflects completed school-internal admission results
// into the local cutoff table. Only the grade-head can perform this operation.
func (a *App) ApplyApplicationCutoffs() (int, error) {
	if a.user != nil && a.user.Role != "master" {
		return 0, fmt.Errorf("합격 결과 커트라인 반영은 학년부장 계정만 할 수 있습니다")
	}
	return a.db.ApplyApplicationCutoffs()
}

// SubmitExpectedSupport sends an explicit, school-level aggregate to
// EduBridge. It is available only to the grade head and never sends student,
// class, teacher, name, number or individual score data.
func (a *App) SubmitExpectedSupport() (int, error) {
	if a.user == nil || a.user.Role != "master" {
		return 0, fmt.Errorf("예상 지원현황 제출은 학년부장 계정만 할 수 있습니다")
	}
	config, err := a.db.GetSchoolConfig()
	if err != nil || config == nil {
		if err != nil {
			return 0, err
		}
		return 0, fmt.Errorf("학교 초기 설정을 먼저 완료해주세요")
	}
	token, err := a.db.GetExpectedSupportToken()
	if err != nil {
		return 0, err
	}
	summaries, err := a.db.GetApplicationSummaries()
	if err != nil {
		return 0, err
	}
	items := make([]ExpectedSupportItem, 0)
	for _, summary := range summaries {
		if summary.AdmissionYear != config.AdmissionYear || summary.Category == "other" {
			continue
		}
		if summary.PlannedCount == 0 && summary.SubmittedCount == 0 {
			continue
		}
		targetSchool := summary.SchoolName
		if summary.Category == "general" && targetSchool == "" {
			targetSchool = "울산 후기 일반계고"
		}
		if targetSchool == "" {
			continue
		}
		items = append(items, ExpectedSupportItem{
			Category: summary.Category, TargetSchool: targetSchool, Department: summary.Department,
			Track: summary.Track, PreferenceRank: summary.PreferenceRank,
			PlannedCount: summary.PlannedCount, SubmittedCount: summary.SubmittedCount,
			MaxScore: summary.MaxExpectedScore, MinScore: summary.MinExpectedScore, AvgScore: summary.AvgExpectedScore,
		})
	}
	payload, err := json.Marshal(ExpectedSupportSubmission{AdmissionYear: config.AdmissionYear, SourceMiddleSchoolName: config.SchoolName, Items: items})
	if err != nil {
		return 0, fmt.Errorf("예상 지원현황 변환 실패: %w", err)
	}
	req, err := http.NewRequest(http.MethodPost, BridgeServerURL+"/api/phgc/expected-support", bytes.NewReader(payload))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Expected-Support-Token", token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("중앙 서버 연결 실패: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return 0, fmt.Errorf("중앙 서버 제출 실패: %s", strings.TrimSpace(string(body)))
	}
	return len(items), nil
}

// GetExpectedSupportAggregate gets only Ulsan-wide counts after this school
// has explicitly participated. The server never returns other school names or
// scores to this method.
func (a *App) GetExpectedSupportAggregate() ([]ExpectedSupportAggregate, error) {
	if a.user == nil || (a.user.Role != "master" && a.user.Role != "viewer") {
		return nil, fmt.Errorf("예상 지원현황은 학년부장·진로부장만 조회할 수 있습니다")
	}
	config, err := a.db.GetSchoolConfig()
	if err != nil || config == nil {
		if err != nil {
			return nil, err
		}
		return nil, fmt.Errorf("학교 초기 설정을 먼저 완료해주세요")
	}
	token, err := a.db.GetExpectedSupportToken()
	if err != nil {
		return nil, err
	}
	url := fmt.Sprintf("%s/api/phgc/expected-support?year=%d", BridgeServerURL, config.AdmissionYear)
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Expected-Support-Token", token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("중앙 서버 연결 실패: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("중앙 서버 조회 실패: %s", strings.TrimSpace(string(body)))
	}
	var result struct {
		Items []ExpectedSupportAggregate `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("중앙 서버 응답 처리 실패: %w", err)
	}
	return result.Items, nil
}

// ExportTeacherPatch writes an encrypted, class-scoped change package.
func (a *App) ExportTeacherPatch(password, username string, classNum int, changes []PatchChange, outputPath string) error {
	if classNum < 1 || username == "" || len(changes) == 0 {
		return fmt.Errorf("변경분 내보내기 정보가 올바르지 않습니다")
	}
	for _, change := range changes {
		if change.ClassNum != classNum {
			return fmt.Errorf("다른 학급 변경분은 내보낼 수 없습니다")
		}
		for _, record := range change.Applications {
			if record.ClassNum != 0 && record.ClassNum != classNum {
				return fmt.Errorf("다른 학급 지원 기록은 내보낼 수 없습니다")
			}
			if record.StudentNum != "" && record.StudentNum != change.StudentNum {
				return fmt.Errorf("지원 기록의 학생 번호가 변경분과 일치하지 않습니다")
			}
		}
	}
	return encryptPatchGCM(password, PatchFile{SourceUsername: username, ClassNum: classNum, Changes: changes}, outputPath)
}

// SaveTeacherPatch opens a native save dialog and writes an encrypted patch.
func (a *App) SaveTeacherPatch(password, username string, classNum int, changes []PatchChange) (string, error) {
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{Title: "담임 변경분 저장", DefaultFilename: fmt.Sprintf("PHGC-%s-%d.phgcpatch", username, classNum), Filters: []runtime.FileFilter{{DisplayName: "PHGC 변경분", Pattern: "*.phgcpatch"}}})
	if err != nil || path == "" {
		return "", err
	}
	if err := a.ExportTeacherPatch(password, username, classNum, changes, path); err != nil {
		return "", err
	}
	return path, nil
}

// SaveCurrentClassPatch lets a homeroom teacher export their own class
// snapshot without choosing records manually.
func (a *App) SaveCurrentClassPatch(password string) (string, error) {
	if a.user == nil || a.user.Role != "homeroom" || a.user.ClassNum < 1 {
		return "", fmt.Errorf("담임 계정으로 로그인한 뒤에만 변경분을 내보낼 수 있습니다")
	}
	changes, err := a.db.GetClassPatchChanges(a.user.ClassNum)
	if err != nil {
		return "", err
	}
	if len(changes) == 0 {
		return "", fmt.Errorf("내보낼 학생 데이터가 없습니다")
	}
	return a.SaveTeacherPatch(password, a.user.Username, a.user.ClassNum, changes)
}

// ImportTeacherPatch decrypts and applies only allowed teacher changes.
func (a *App) ImportTeacherPatch(password, inputPath string) (int, error) {
	patch, err := decryptPatchGCM(password, inputPath)
	if err != nil {
		return 0, err
	}
	if patch.ClassNum < 1 || patch.SourceUsername == "" {
		return 0, fmt.Errorf("변경분 파일 정보가 올바르지 않습니다")
	}
	for _, change := range patch.Changes {
		if change.ClassNum != patch.ClassNum {
			return 0, fmt.Errorf("변경분에 다른 학급 데이터가 포함되어 있습니다")
		}
		if err := a.db.ApplyPatchChange(change); err != nil {
			return 0, err
		}
	}
	return len(patch.Changes), nil
}

// InspectTeacherPatch decrypts only long enough to show safe merge metadata
// before the grade head decides whether to apply the changes.
func (a *App) InspectTeacherPatch(password, inputPath string) (PatchPreview, error) {
	patch, err := decryptPatchGCM(password, inputPath)
	if err != nil {
		return PatchPreview{}, err
	}
	if patch.ClassNum < 1 || patch.SourceUsername == "" {
		return PatchPreview{}, fmt.Errorf("변경분 파일 정보가 올바르지 않습니다")
	}
	preview := PatchPreview{Path: inputPath, SourceUsername: patch.SourceUsername, ClassNum: patch.ClassNum, ChangeCount: len(patch.Changes), BaseRevision: patch.BaseRevision}
	for _, change := range patch.Changes {
		if change.ClassNum != patch.ClassNum {
			return PatchPreview{}, fmt.Errorf("변경분에 다른 학급 데이터가 포함되어 있습니다")
		}
		preview.StudentNames = append(preview.StudentNames, change.StudentName)
	}
	manifestBytes, err := os.ReadFile(manifestPath(a.db.dataDir))
	if err == nil {
		var manifest DataManifest
		if json.Unmarshal(manifestBytes, &manifest) == nil {
			preview.CurrentRevision = manifest.Revision
			preview.HasRevisionConflict = patch.BaseRevision > 0 && manifest.Revision > 0 && patch.BaseRevision != manifest.Revision
		}
	}
	return preview, nil
}

// OpenTeacherPatchPreview selects a patch without applying it.
func (a *App) OpenTeacherPatchPreview(password string) (PatchPreview, error) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Title: "담임 변경분 미리보기", Filters: []runtime.FileFilter{{DisplayName: "PHGC 변경분", Pattern: "*.phgcpatch"}}})
	if err != nil || path == "" {
		return PatchPreview{}, err
	}
	return a.InspectTeacherPatch(password, path)
}

// OpenTeacherPatch lets the administrator select and merge a patch file.
func (a *App) OpenTeacherPatch(password string) (int, error) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Title: "담임 변경분 가져오기", Filters: []runtime.FileFilter{{DisplayName: "PHGC 변경분", Pattern: "*.phgcpatch"}}})
	if err != nil || path == "" {
		return 0, err
	}
	return a.ImportTeacherPatch(password, path)
}

// StudentTranscriptData 학생의 전학년 교과/비교과 전체 상세 성적표
type StudentTranscriptData struct {
	ClassNum       int                 `json:"classNum"`
	StudentNum     string              `json:"studentNum"`
	Name           string              `json:"name"`
	SubjectRecords []map[string]string `json:"subjectRecords"`
	AttendanceRaw  string              `json:"attendanceRaw"`
	VolunteerRaw   string              `json:"volunteerRaw"`
	AllAverage     float64             `json:"allAverage"`
	Percentile     float64             `json:"percentile"`
	Rank           int                 `json:"rank"`
	TotalStudents  int                 `json:"totalStudents"`
}

// GetStudentTranscript 학생 1명의 전과목 전학년 성적과 출결/봉사 원시 데이터 일체 반환
func (a *App) GetStudentTranscript(classNum int, studentNum, name string) (*StudentTranscriptData, error) {
	s, err := a.db.GetStudent(classNum, studentNum, name)
	if err != nil {
		return nil, fmt.Errorf("학생 정보를 찾을 수 없습니다: %w", err)
	}

	res := &StudentTranscriptData{
		ClassNum:      s.ClassNum,
		StudentNum:    s.StudentNum,
		Name:          s.Name,
		AttendanceRaw: s.AttendanceData,
		VolunteerRaw:  s.VolunteerData,
	}

	if s.RawData != "" {
		_ = json.Unmarshal([]byte(s.RawData), &res.SubjectRecords)
	}

	// 평균 성취도 산출
	if fullData, err := parseStudentFullData(*s); err == nil && fullData != nil {
		res.AllAverage = fullData.AllAverage
	}

	// 전교 석차 및 백분율 정보 산출
	config, _ := a.db.GetSchoolConfig()
	if config != nil {
		allStudents, _ := a.db.GetAllStudents(config.ClassCount)
		if len(allStudents) > 0 {
			calcResults, _ := CalculateGrades(allStudents, config.IsSmallSchool)
			res.TotalStudents = len(calcResults)
			for _, cg := range calcResults {
				if cg.ClassNum == classNum && matchStudent(cg.StudentNum, cg.Name, studentNum, name) {
					res.Rank = cg.Rank
					res.Percentile = cg.Percentile
					break
				}
			}
		}
	}

	return res, nil
}

// GetClassFullGrades 특정 반 전체 학생의 고교별 산출 결과 목록 반환 (신호등 매트릭스용)
func (a *App) GetClassFullGrades(classNum int) ([]StudentFullData, error) {
	students, err := a.db.GetClassStudents(classNum)
	if err != nil {
		return nil, err
	}

	// 1. 전교생 기준 정확한 내신 산출 결과(석차백분율) 가져오기
	classGrades, _ := a.GetClassGrades(classNum)

	var results []StudentFullData
	for _, s := range students {
		full, err := parseStudentFullData(s)
		if err == nil {
			// 대시보드 표와 동일한 정확한 전교 석차 백분율 동기화
			for _, cg := range classGrades {
				if matchStudent(cg.StudentNum, cg.Name, full.StudentNum, full.Name) {
					full.GeneralHSPercentile = cg.Percentile
					full.GeneralHSAcademicScore = cg.FinalScore
					full.GeneralHSNonAcademicScore = cg.NonAcademicScore
					full.GeneralHSTotalScore = cg.GeneralTotalScore
					full.GeneralHSDataComplete = cg.GeneralDataComplete
					full.GeneralHSProjected = cg.GeneralProjected
					break
				}
			}
			results = append(results, *full)
		}
	}

	// 번호순 정렬
	sort.Slice(results, func(i, j int) bool {
		numI, errI := strconv.Atoi(results[i].StudentNum)
		numJ, errJ := strconv.Atoi(results[j].StudentNum)
		if errI == nil && errJ == nil {
			return numI < numJ
		}
		return results[i].StudentNum < results[j].StudentNum
	})

	return results, nil
}

// ResetAcademicYear 입시년도 전환 시 커트라인을 제외한 모든 학급 데이터 삭제
func (a *App) ResetAcademicYear(newYear int) error {
	return a.db.ResetAcademicYear(newYear)
}

// GetDataUpdateStatus 교과, 출결, 봉사 데이터의 저장 상태 반환
func (a *App) GetDataUpdateStatus() map[string]interface{} {
	config, err := a.db.GetSchoolConfig()
	if err != nil {
		return map[string]interface{}{"error": err.Error()}
	}

	totalStudents := 0
	attendanceCount := 0
	volunteerCount := 0

	for i := 1; i <= config.ClassCount; i++ {
		students, err := a.db.GetClassStudents(i)
		if err == nil {
			totalStudents += len(students)
			for _, s := range students {
				if s.AttendanceData != "" {
					attendanceCount++
				}
				if s.VolunteerData != "" {
					volunteerCount++
				}
			}
		}
	}

	return map[string]interface{}{
		"totalStudents":   totalStudents,
		"hasGrades":       totalStudents > 0,
		"attendanceCount": attendanceCount,
		"hasAttendance":   attendanceCount > 0,
		"volunteerCount":  volunteerCount,
		"hasVolunteer":    volunteerCount > 0,
		"classCount":      config.ClassCount,
		"schoolName":      config.SchoolName,
		"admissionYear":   config.AdmissionYear,
	}
}

// GetSchoolRuleList 지원 고교 및 전형 목록 반환
func (a *App) GetSchoolRuleList() []map[string]string {
	return GetAllSchoolRuleNames()
}

// PerformAutoUpdate 원클릭 자동 업데이트 실행
func (a *App) PerformAutoUpdate(downloadURL string) error {
	return DownloadAndApplyUpdate(downloadURL)
}

// GetHighSchoolsData 고교 목록 데이터 반환 (후기 일반고 포함)
func (a *App) GetHighSchoolsData() (*HighSchoolData, error) {
	data, err := a.sync.GetHighSchools()
	if err != nil {
		return nil, err
	}

	// 후기 일반계고가 목록에 없으면 맨 앞에 추가
	hasGeneral := false
	for _, s := range data.Schools {
		if s.Name == "울산 후기 일반계고" {
			hasGeneral = true
			break
		}
	}

	if !hasGeneral {
		generalSchool := HighSchool{
			Name: "울산 후기 일반계고",
			Type: "일반계고",
			Area: "울산전역",
			Note: "석차백분율(%) 기준",
		}
		data.Schools = append([]HighSchool{generalSchool}, data.Schools...)
	}

	return data, nil
}

// GetOfficialAdmissionData returns central operator-published material only.
// School accounts have no save API for this data.
func (a *App) GetOfficialAdmissionData() (*OfficialAdmissionData, error) {
	return a.sync.GetOfficialAdmissionData()
}

// CreateUser 새 사용자 등록 (관리자, 뷰어, 담임교사 등)
func (a *App) CreateUser(username, password, role string, classNum int) error {
	if err := a.db.CreateUser(username, password, role, classNum); err != nil {
		return err
	}
	return a.refreshLoginIndex()
}

// DeleteUser 사용자 삭제
func (a *App) DeleteUser(username string) error {
	if err := a.db.DeleteUser(username); err != nil {
		return err
	}
	_ = os.Remove(userEnvelopePath(a.db.dataDir, username))
	return a.refreshLoginIndex()
}
