package main

import (
	"archive/zip"
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unicode/utf16"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/crypto/bcrypt"
)

// 브릿지 서버 주소 (배포 환경에 맞게 수정)
// 오프라인 전용: 외부 서버 URL 제거됨

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

// DistributionPackageManifest identifies a teacher/viewer deployment package.
// The ZIP contains only individually AES-GCM encrypted database files and an
// encrypted shared-key envelope; it never contains a plaintext password.
type DistributionPackageManifest struct {
	Format   string   `json:"format"`
	Username string   `json:"username"`
	Role     string   `json:"role"`
	ClassNum int      `json:"classNum"`
	Files    []string `json:"files"`
}

type FinalArchiveManifest struct {
	Format        string   `json:"format"`
	SchoolName    string   `json:"schoolName"`
	AdmissionYear int      `json:"admissionYear"`
	CreatedAt     string   `json:"createdAt"`
	Files         []string `json:"files"`
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

	// 서약서에 동의했거나, 이미 배포된 config.db.phgc가 있는 경우에만 DB 초기화
	// 서약 전에는 빈 data 폴더나 config.db를 만들지 않는다.
	if a.IsAgreementAccepted() || a.db.hasEncryptedConfigDB() {
		if !a.db.hasEncryptedConfigDB() {
			if err := a.db.InitConfigDB(); err != nil {
				fmt.Println("config DB 초기화 오류:", err)
			}
		}
	}
}

func (a *App) shutdown(ctx context.Context) {
	// 사용자가 서약서에 동의하지 않고 창을 닫은 경우 (미동의 종료)
	if !a.IsAgreementAccepted() && !a.db.hasEncryptedConfigDB() {
		// 서약 미동의 상태이므로 data 폴더가 존재하더라도 깨끗하게 파기
		if a.db != nil && a.db.dataDir != "" {
			_ = os.RemoveAll(a.db.dataDir)
		}
		return
	}

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

	// 사용자 초기 계정 생성 (마스터, 뷰어, 담임)
	err = a.db.InitUsers(req.ClassCount, req.AdminPassword)
	if err != nil {
		return fmt.Errorf("초기 계정 생성 실패: %w", err)
	}

	// 담임 및 진로 계정의 초기 비밀번호를 공용 데이터 암호로 기본 설정 (학년부장이 개별 비번을 세팅하지 않아도 즉시 배포 및 로그인 가능)
	hashedShared, hashErr := bcrypt.GenerateFromPassword([]byte(req.SharedDataPassword), bcrypt.DefaultCost)
	if hashErr == nil {
		if db, dbErr := a.db.openDB(a.db.getConfigDBPath()); dbErr == nil {
			_, _ = db.Exec("UPDATE users SET password_hash = ? WHERE role IN ('homeroom', 'viewer') AND (password_hash IS NULL OR password_hash = '')", string(hashedShared))
			_, _ = db.Exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE")
			db.Close()
		}
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
		// 공용 데이터 암호 인증을 성공한 상태에서 개인 비밀번호 검증이 실패한 경우:
		// 1) 담임 계정의 password_hash가 비어있거나(초기 미설정)
		// 2) 담임이 학년부장의 공용 암호와 동일하게 입력한 경우 (password == sharedPassword)에만
		// 인가된 교사로 인정하여 해당 비밀번호로 동기화 설정함 (임의의 비밀번호는 통과 차단)
		users, getErr := a.db.GetUsers()
		if getErr == nil {
			for _, u := range users {
				if u.Username == username {
					if u.PasswordHash == "" || password == sharedPassword {
						if changeErr := a.db.ChangeUserPassword(username, password); changeErr == nil {
							user = &u
							user.MustChangePassword = true
							err = nil
						}
					}
					break
				}
			}
		}
	}
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

// SaveDistributionPackage creates a portable teacher/viewer deployment
// package. It is intentionally separate from password-reset packages.
func (a *App) SaveDistributionPackage(username string) (string, error) {
	if a.user == nil || a.user.Role != "master" {
		return "", fmt.Errorf("교사용 배포 자료 생성은 학년부장 계정만 할 수 있습니다")
	}
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title: "교사용 배포 자료 저장", DefaultFilename: fmt.Sprintf("PHGC-%s-배포자료.phgcpkg", username),
		Filters: []runtime.FileFilter{{DisplayName: "PHGC 교사용 배포 자료", Pattern: "*.phgcpkg"}},
	})
	if err != nil || path == "" {
		return "", err
	}
	if err := a.ExportDistributionPackage(username, path); err != nil {
		return "", err
	}
	return path, nil
}

// ExportDistributionPackage writes only the intended teacher's class DB (or
// all class DBs for the read-only career viewer). Administrator envelopes and
// other staff accounts are omitted.
func (a *App) ExportDistributionPackage(username, outputPath string) error {
	if a.user == nil || a.user.Role != "master" || len(a.dataKey) != 32 {
		return fmt.Errorf("학년부장으로 로그인한 뒤에만 배포 자료를 만들 수 있습니다")
	}
	users, err := a.db.GetUsers()
	if err != nil {
		return err
	}
	var target *User
	for i := range users {
		if users[i].Username == username {
			target = &users[i]
			break
		}
	}
	if target == nil || target.Role == "master" {
		return fmt.Errorf("담임 또는 진로부장 계정을 선택해주세요")
	}
	config, err := a.db.GetSchoolConfig()
	if err != nil || config == nil {
		if err != nil {
			return err
		}
		return fmt.Errorf("학교 초기 설정을 먼저 완료해주세요")
	}
	// Older installations may predate the revision manifest. Create it before
	// packaging so a recipient can later export a compatible teacher patch.
	if _, err := os.Stat(manifestPath(a.db.dataDir)); os.IsNotExist(err) {
		packageID, keyErr := newDataKey()
		if keyErr != nil {
			return keyErr
		}
		manifestBytes, marshalErr := json.Marshal(DataManifest{
			Format: "PHGC-DATA-1", PackageID: hex.EncodeToString(packageID), AdmissionYear: config.AdmissionYear,
		})
		if marshalErr != nil {
			return marshalErr
		}
		if writeErr := writePrivateFileAtomically(manifestPath(a.db.dataDir), manifestBytes); writeErr != nil {
			return writeErr
		}
	} else if err != nil {
		return err
	}
	tmpDir, err := os.MkdirTemp("", "phgc-package-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tmpDir)
	keyPassword := hex.EncodeToString(a.dataKey)
	files := []string{"config.db.phgc", "shared-key.json", "manifest.json", "login-index.json"}

	// Create a temporary config snapshot that contains only the target account.
	configCopy := filepath.Join(tmpDir, "config.db")
	if err := snapshotDatabase(a.db, a.db.getConfigDBPath(), configCopy); err != nil {
		return err
	}
	copyDB, err := a.db.openDB(configCopy)
	if err != nil {
		return err
	}
	_, err = copyDB.Exec("DELETE FROM users WHERE username <> ?", target.Username)
	if err == nil {
		_, err = copyDB.Exec("UPDATE school_config SET admin_password = '' WHERE id = 1")
	}
	// 만약 target의 비밀번호가 설정되어 있지 않다면(빈 문자열), 안전하게 기본 비밀번호(계정 아이디)를 설정하여 배포
	if err == nil && target.PasswordHash == "" {
		defaultHash, _ := bcrypt.GenerateFromPassword([]byte(target.Username), bcrypt.DefaultCost)
		_, err = copyDB.Exec("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE username = ?", string(defaultHash), target.Username)
	}
	// WAL 변경사항을 본체 DB 파일로 완벽하게 체크포인트하고 저널 모드를 DELETE로 정리
	if err == nil {
		_, _ = copyDB.Exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE")
	}
	copyDB.Close()
	if err != nil {
		return fmt.Errorf("배포용 계정 정보 준비 실패: %w", err)
	}
	if err := encryptFileGCM(keyPassword, configCopy, filepath.Join(tmpDir, "config.db.phgc")); err != nil {
		return err
	}

	if err := copyPackageFile(sharedEnvelopePath(a.db.dataDir), filepath.Join(tmpDir, "shared-key.json")); err != nil {
		return err
	}
	if err := copyPackageFile(manifestPath(a.db.dataDir), filepath.Join(tmpDir, "manifest.json")); err != nil {
		return err
	}
	if err := saveLoginIndex(tmpDir, config.SchoolName, []User{*target}); err != nil {
		return err
	}

	classNumbers := []int{}
	if target.Role == "homeroom" {
		classNumbers = append(classNumbers, target.ClassNum)
	} else {
		for classNum := 1; classNum <= config.ClassCount; classNum++ {
			classNumbers = append(classNumbers, classNum)
		}
	}
	for _, classNum := range classNumbers {
		source := a.db.getClassDBPath(classNum)
		if _, err := os.Stat(source); os.IsNotExist(err) {
			continue
		} else if err != nil {
			return err
		}
		name := fmt.Sprintf("class_%d.db.phgc", classNum)
		if err := snapshotAndEncryptDatabase(a.db, source, filepath.Join(tmpDir, name), keyPassword); err != nil {
			return err
		}
		files = append(files, name)
	}
	// 고교·학과 목록은 개인정보가 아닌 공용 참고자료지만, 담임의 새
	// 프로그램 폴더에서도 지원현황 입력을 바로 할 수 있도록 함께 전달한다.
	highSchools := filepath.Join(a.db.dataDir, "highschools.json")
	if info, statErr := os.Stat(highSchools); statErr == nil && !info.IsDir() {
		if err := copyPackageFile(highSchools, filepath.Join(tmpDir, "highschools.json")); err != nil {
			return err
		}
		files = append(files, "highschools.json")
	}
	manifest := DistributionPackageManifest{Format: "PHGC-DEPLOYMENT-1", Username: target.Username, Role: target.Role, ClassNum: target.ClassNum, Files: files}
	manifestJSON, err := json.Marshal(manifest)
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(tmpDir, "package.json"), manifestJSON, 0600); err != nil {
		return err
	}
	files = append([]string{"package.json"}, files...)
	return writeDistributionZip(outputPath, tmpDir, files)
}

// OpenDistributionPackage imports a deployment package on a fresh copy of the
// program. The recipient still supplies the shared password once on login.
func (a *App) OpenDistributionPackage() (string, error) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Title: "교사용 배포 자료 선택", Filters: []runtime.FileFilter{{DisplayName: "PHGC 교사용 배포 자료", Pattern: "*.phgcpkg"}}})
	if err != nil || path == "" {
		return "", err
	}
	return a.ImportDistributionPackage(path)
}

func (a *App) ImportDistributionPackage(inputPath string) (string, error) {
	if a.db.hasEncryptedConfigDB() {
		return "", fmt.Errorf("기존 학교 자료가 있습니다. 새 프로그램 폴더에서 배포 자료를 가져오거나 기존 data 폴더를 백업하세요")
	}
	if _, err := os.Stat(a.db.getConfigDBPath()); err == nil {
		config, configErr := a.db.GetSchoolConfig()
		if configErr != nil || config != nil {
			return "", fmt.Errorf("기존 학교 설정이 있습니다. 새 프로그램 폴더에서 배포 자료를 가져오세요")
		}
		removePlainDatabaseArtifacts(a.db.getConfigDBPath())
	}
	reader, err := zip.OpenReader(inputPath)
	if err != nil {
		return "", fmt.Errorf("배포 자료를 열 수 없습니다: %w", err)
	}
	defer reader.Close()
	entries := map[string]*zip.File{}
	for _, file := range reader.File {
		if filepath.Base(file.Name) != file.Name || strings.Contains(file.Name, "..") {
			return "", fmt.Errorf("허용되지 않은 배포 파일 경로입니다")
		}
		entries[file.Name] = file
	}
	pkgFile := entries["package.json"]
	if pkgFile == nil {
		return "", fmt.Errorf("배포 자료 정보가 없습니다")
	}
	pkgBytes, err := readZipEntry(pkgFile)
	if err != nil {
		return "", err
	}
	var manifest DistributionPackageManifest
	if err := json.Unmarshal(pkgBytes, &manifest); err != nil {
		return "", fmt.Errorf("배포 자료 정보가 올바르지 않습니다")
	}
	if manifest.Format != "PHGC-DEPLOYMENT-1" || manifest.Username == "" || (manifest.Role != "homeroom" && manifest.Role != "viewer") {
		return "", fmt.Errorf("지원하지 않는 배포 자료입니다")
	}
	for _, name := range manifest.Files {
		file := entries[name]
		if file == nil {
			return "", fmt.Errorf("배포 자료에 %s 파일이 없습니다", name)
		}
		data, err := readZipEntry(file)
		if err != nil {
			return "", err
		}
		if err := writePrivateFileAtomically(filepath.Join(a.db.dataDir, name), data); err != nil {
			return "", err
		}
	}
	return manifest.Username, nil
}

func snapshotDatabase(dm *DBManager, source, destination string) error {
	db, err := dm.openDB(source)
	if err != nil {
		return err
	}
	_, err = db.Exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE")
	db.Close()
	if err != nil {
		return err
	}
	return copyPackageFile(source, destination)
}

func snapshotAndEncryptDatabase(dm *DBManager, source, destination, password string) error {
	db, err := dm.openDB(source)
	if err != nil {
		return err
	}
	_, err = db.Exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE")
	db.Close()
	if err != nil {
		return err
	}
	return encryptFileGCM(password, source, destination)
}

func copyPackageFile(source, destination string) error {
	data, err := os.ReadFile(source)
	if err != nil {
		return err
	}
	return writePrivateFileAtomically(destination, data)
}

func writeDistributionZip(outputPath, sourceDir string, names []string) error {
	tmp, err := os.CreateTemp(filepath.Dir(outputPath), ".phgc-package-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	writer := zip.NewWriter(tmp)
	for _, name := range names {
		data, err := os.ReadFile(filepath.Join(sourceDir, name))
		if err != nil {
			writer.Close()
			tmp.Close()
			return err
		}
		entry, err := writer.Create(name)
		if err != nil {
			writer.Close()
			tmp.Close()
			return err
		}
		if _, err := entry.Write(data); err != nil {
			writer.Close()
			tmp.Close()
			return err
		}
	}
	if err := writer.Close(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpPath, outputPath)
}

func readZipEntry(file *zip.File) ([]byte, error) {
	reader, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer reader.Close()
	return io.ReadAll(io.LimitReader(reader, 64<<20))
}

// SaveFinalArchive creates a portable AES-256-GCM encrypted archive of every
// encrypted school data file. It contains no plaintext SQLite database.
func (a *App) SaveFinalArchive(archivePassword string) (string, error) {
	if a.user == nil || a.user.Role != "master" || len(a.dataKey) != 32 {
		return "", fmt.Errorf("최종 보관본 생성은 학년부장 로그인 후에만 할 수 있습니다")
	}
	if strings.TrimSpace(archivePassword) == "" {
		return "", fmt.Errorf("보관본 암호를 입력해주세요")
	}
	config, err := a.db.GetSchoolConfig()
	if err != nil {
		return "", err
	}
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{Title: "암호화 최종 보관본 저장", DefaultFilename: fmt.Sprintf("PHGC-%s-%d-최종보관본.phgcarchive", config.SchoolName, config.AdmissionYear), Filters: []runtime.FileFilter{{DisplayName: "PHGC 암호화 보관본", Pattern: "*.phgcarchive"}}})
	if err != nil || path == "" {
		return "", err
	}
	if err := a.ExportFinalArchive(archivePassword, path); err != nil {
		return "", err
	}
	return path, nil
}

func (a *App) ExportFinalArchive(archivePassword, outputPath string) error {
	if a.user == nil || a.user.Role != "master" || len(a.dataKey) != 32 {
		return fmt.Errorf("학년부장 로그인 후에만 보관본을 만들 수 있습니다")
	}
	config, err := a.db.GetSchoolConfig()
	if err != nil {
		return err
	}
	tmpDir, err := os.MkdirTemp("", "phgc-archive-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tmpDir)
	keyPassword := hex.EncodeToString(a.dataKey)
	files := []string{"config.db.phgc", "shared-key.json", "login-index.json"}
	if err := snapshotAndEncryptDatabase(a.db, a.db.getConfigDBPath(), filepath.Join(tmpDir, "config.db.phgc"), keyPassword); err != nil {
		return err
	}
	for _, name := range []string{"shared-key.json", "login-index.json"} {
		if err := copyPackageFile(filepath.Join(a.db.dataDir, name), filepath.Join(tmpDir, name)); err != nil {
			return err
		}
	}
	if _, err := os.Stat(manifestPath(a.db.dataDir)); err == nil {
		if err := copyPackageFile(manifestPath(a.db.dataDir), filepath.Join(tmpDir, "manifest.json")); err != nil {
			return err
		}
		files = append(files, "manifest.json")
	}
	for n := 1; n <= config.ClassCount; n++ {
		source := a.db.getClassDBPath(n)
		if _, err := os.Stat(source); os.IsNotExist(err) {
			continue
		} else if err != nil {
			return err
		}
		name := fmt.Sprintf("class_%d.db.phgc", n)
		if err := snapshotAndEncryptDatabase(a.db, source, filepath.Join(tmpDir, name), keyPassword); err != nil {
			return err
		}
		files = append(files, name)
	}
	keyEntries, _ := os.ReadDir(filepath.Join(a.db.dataDir, "keys"))
	for _, entry := range keyEntries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		name := filepath.Join("keys", entry.Name())
		if err := os.MkdirAll(filepath.Join(tmpDir, "keys"), 0700); err != nil {
			return err
		}
		if err := copyPackageFile(filepath.Join(a.db.dataDir, name), filepath.Join(tmpDir, name)); err != nil {
			return err
		}
		files = append(files, name)
	}
	archive := FinalArchiveManifest{Format: "PHGC-FINAL-ARCHIVE-1", SchoolName: config.SchoolName, AdmissionYear: config.AdmissionYear, CreatedAt: time.Now().Format(time.RFC3339), Files: files}
	b, err := json.Marshal(archive)
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(tmpDir, "archive.json"), b, 0600); err != nil {
		return err
	}
	zipPath := filepath.Join(tmpDir, "archive.zip")
	if err := writeDistributionZip(zipPath, tmpDir, append([]string{"archive.json"}, files...)); err != nil {
		return err
	}
	return encryptFileGCM(archivePassword, zipPath, outputPath)
}

func (a *App) OpenFinalArchive() (string, error) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Title: "암호화 최종 보관본 선택", Filters: []runtime.FileFilter{{DisplayName: "PHGC 암호화 보관본", Pattern: "*.phgcarchive"}}})
	if err != nil || path == "" {
		return "", err
	}
	return path, nil
}

// ImportFinalArchive is intentionally permitted only into an empty program
// data folder, avoiding accidental overwrite of a live school's data.
func (a *App) ImportFinalArchive(inputPath, archivePassword string) (string, error) {
	if strings.TrimSpace(archivePassword) == "" {
		return "", fmt.Errorf("보관본 암호를 입력해주세요")
	}
	if a.db.hasEncryptedConfigDB() {
		return "", fmt.Errorf("기존 학교 자료가 있습니다. 새 프로그램 폴더에서 보관본을 복원하세요")
	}
	if _, err := os.Stat(a.db.getConfigDBPath()); err == nil {
		cfg, cfgErr := a.db.GetSchoolConfig()
		if cfgErr != nil || cfg != nil {
			return "", fmt.Errorf("기존 학교 설정이 있습니다. 새 프로그램 폴더에서 보관본을 복원하세요")
		}
		removePlainDatabaseArtifacts(a.db.getConfigDBPath())
	}
	tmpDir, err := os.MkdirTemp("", "phgc-restore-*")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(tmpDir)
	zipPath := filepath.Join(tmpDir, "archive.zip")
	if err := decryptFileGCM(archivePassword, inputPath, zipPath); err != nil {
		return "", fmt.Errorf("보관본 암호가 올바르지 않거나 파일이 손상되었습니다")
	}
	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		return "", err
	}
	defer reader.Close()
	entries := map[string]*zip.File{}
	for _, f := range reader.File {
		if strings.Contains(f.Name, "..") || filepath.IsAbs(f.Name) {
			return "", fmt.Errorf("허용되지 않은 보관 파일 경로입니다")
		}
		entries[f.Name] = f
	}
	meta := entries["archive.json"]
	if meta == nil {
		return "", fmt.Errorf("보관본 정보가 없습니다")
	}
	raw, err := readZipEntry(meta)
	if err != nil {
		return "", err
	}
	var archive FinalArchiveManifest
	if err := json.Unmarshal(raw, &archive); err != nil || archive.Format != "PHGC-FINAL-ARCHIVE-1" || archive.SchoolName == "" {
		return "", fmt.Errorf("지원하지 않는 보관본입니다")
	}
	for _, name := range archive.Files {
		f := entries[name]
		if f == nil {
			return "", fmt.Errorf("보관본에 %s 파일이 없습니다", name)
		}
		if !(name == "config.db.phgc" || name == "shared-key.json" || name == "login-index.json" || name == "manifest.json" || strings.HasPrefix(name, "class_") && strings.HasSuffix(name, ".db.phgc") || strings.HasPrefix(name, "keys/") && filepath.Ext(name) == ".json") {
			return "", fmt.Errorf("허용되지 않은 보관 파일입니다")
		}
		data, err := readZipEntry(f)
		if err != nil {
			return "", err
		}
		dest := filepath.Join(a.db.dataDir, name)
		if err := os.MkdirAll(filepath.Dir(dest), 0700); err != nil {
			return "", err
		}
		if err := writePrivateFileAtomically(dest, data); err != nil {
			return "", err
		}
	}
	return archive.SchoolName, nil
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

// GetServerNotices 운영센터 공지사항 목록 반환
func (a *App) GetServerNotices() ([]NoticeItem, error) {
	return a.sync.GetNotices()
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
		if err := a.refreshClassSchoolScoreCache(classNum); err != nil {
			return nil, fmt.Errorf("%d반 학교별 점수 산출 실패: %w", classNum, err)
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
		if err := a.refreshClassSchoolScoreCache(classNum); err != nil {
			return nil, fmt.Errorf("%d반 학교별 점수 갱신 실패: %w", classNum, err)
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
		if err := a.refreshClassSchoolScoreCache(classNum); err != nil {
			return nil, fmt.Errorf("%d반 학교별 점수 갱신 실패: %w", classNum, err)
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

func (a *App) DeleteCutoff(year int, schoolName, department, track string) error {
	return a.db.DeleteCutoff(year, schoolName, department, track)
}

func (a *App) DeleteCutoffs(cutoffs []CutoffInfo) error {
	return a.db.DeleteCutoffs(cutoffs)
}

func (a *App) ResetCutoffs(year int) error {
	return a.db.ResetCutoffs(year)
}

func (a *App) PurgeOldCutoffs(baseAdmissionYear, keepYears int) (int64, error) {
	return a.db.PurgeOldCutoffs(baseAdmissionYear, keepYears)
}

func (a *App) GetCutoffs() ([]CutoffInfo, error) {
	if config, err := a.db.GetSchoolConfig(); err == nil && config.AdmissionYear > 0 {
		_, _ = a.db.PurgeOldCutoffs(config.AdmissionYear, 5)
	}
	return a.db.GetCutoffs()
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

// refreshStudentSchoolScoreCache stores the already-defined school rules as
// queryable rows in the encrypted class DB.
func (a *App) refreshStudentSchoolScoreCache(classNum int, studentNum, name string) error {
	student, err := a.db.GetStudent(classNum, studentNum, name)
	if err != nil {
		return err
	}
	full, err := parseStudentFullData(*student)
	if err != nil {
		return err
	}
	return a.db.ReplaceStudentSchoolScores(classNum, student.StudentNum, student.Name, full.SchoolResults)
}

func (a *App) refreshClassSchoolScoreCache(classNum int) error {
	students, err := a.db.GetClassStudents(classNum)
	if err != nil {
		return err
	}
	for _, student := range students {
		full, err := parseStudentFullData(student)
		if err != nil {
			return fmt.Errorf("%s 학생: %w", student.Name, err)
		}
		if err := a.db.ReplaceStudentSchoolScores(classNum, student.StudentNum, student.Name, full.SchoolResults); err != nil {
			return err
		}
	}
	return nil
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

// ApplicationScoreSnapshot is the score currently calculated for one selected school track.
// The support-status form uses this lightweight result instead of reloading every student.
type ApplicationScoreSnapshot struct {
	Score      float64 `json:"score"`
	TotalMax   float64 `json:"totalMax"`
	SchoolName string  `json:"schoolName"`
	TrackName  string  `json:"trackName"`
	Basis      string  `json:"basis"`
}

func normalizeApplicationSchoolName(value string) string {
	value = strings.TrimSuffix(strings.TrimSpace(value), "등학교")
	return strings.ReplaceAll(value, " ", "")
}

// GetStudentApplicationScoreSnapshot calculates only the selected school and track.
func (a *App) GetStudentApplicationScoreSnapshot(classNum int, studentNum, name, category, schoolName, track string) (*ApplicationScoreSnapshot, error) {
	if category == "general" {
		full, err := a.GetStudentFullDetail(classNum, studentNum, name)
		if err != nil {
			return nil, err
		}
		return &ApplicationScoreSnapshot{
			Score: full.GeneralHSTotalScore, TotalMax: 200,
			SchoolName: "후기 일반계고", TrackName: "후기 일반계고",
			Basis: "후기 일반계고 내신 자동 산출",
		}, nil
	}
	if category != "meister" && category != "special" {
		return nil, fmt.Errorf("자동 점수 산출 대상 전형이 아닙니다")
	}
	if strings.TrimSpace(schoolName) == "" || strings.TrimSpace(track) == "" {
		return nil, fmt.Errorf("지원 학교와 전형을 선택해주세요")
	}
	results, err := a.db.GetStudentSchoolScores(classNum, studentNum, name)
	if err != nil {
		return nil, err
	}
	// 기존에 입력된 자료에는 캐시가 없을 수 있다. 그 경우에만 한 번 계산해
	// 저장하고, 이후 지원현황은 저장된 점수만 조회한다.
	if len(results) == 0 {
		if err := a.refreshStudentSchoolScoreCache(classNum, studentNum, name); err != nil {
			return nil, err
		}
		results, err = a.db.GetStudentSchoolScores(classNum, studentNum, name)
		if err != nil {
			return nil, err
		}
	}
	for _, result := range results {
		if normalizeApplicationSchoolName(result.SchoolName) == normalizeApplicationSchoolName(schoolName) && result.TrackName == track {
			return &ApplicationScoreSnapshot{
				Score: result.TotalScore, TotalMax: result.TotalMax,
				SchoolName: result.SchoolName, TrackName: result.TrackName,
				Basis: fmt.Sprintf("%s %s 자동 산출 (%.0f점 만점)", result.SchoolName, result.TrackName, result.TotalMax),
			}, nil
		}
	}
	return nil, fmt.Errorf("%s %s 전형의 산출식을 찾을 수 없습니다", schoolName, track)
}

// SaveStudentExtra 학생의 수기 가산점 및 추가 봉사시간 저장
func (a *App) SaveStudentExtra(classNum int, studentNum, name, extraJSON string) error {
	if err := a.db.UpdateStudentExtra(classNum, studentNum, name, extraJSON); err != nil {
		return err
	}
	return a.refreshStudentSchoolScoreCache(classNum, studentNum, name)
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

func (a *App) DeleteStudentApplication(classNum int, studentNum, name, category, schoolName, track string) error {
	if a.user != nil {
		if a.user.Role == "viewer" {
			return fmt.Errorf("진로부장 계정은 지원현황을 삭제할 수 없습니다")
		}
		if a.user.Role == "homeroom" && a.user.ClassNum != classNum {
			return fmt.Errorf("담임 계정은 본인 학급의 지원현황만 삭제할 수 있습니다")
		}
	}
	return a.db.DeleteApplication(classNum, studentNum, name, category, schoolName, track)
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

// GetClassApplicationSummaries is used by a homeroom teacher's own-class
// dashboard. A homeroom account is never allowed to select another class.
func (a *App) GetClassApplicationSummaries(classNum int) ([]ApplicationSummary, error) {
	if a.user != nil && a.user.Role == "homeroom" && a.user.ClassNum != classNum {
		return nil, fmt.Errorf("담임 계정은 본인 학급 지원현황만 조회할 수 있습니다")
	}
	return a.db.GetClassApplicationSummaries(classNum)
}

func (a *App) GetSchoolApplicationRecords() ([]ApplicationRecord, error) {
	if a.user == nil {
		return nil, fmt.Errorf("로그인이 필요합니다")
	}
	all, err := a.db.GetSchoolApplicationRecords()
	if err != nil {
		return nil, err
	}
	// 담임교사인 경우 본인 학급 학생 명단만 반환하여 개인정보 보호
	if a.user.Role == "homeroom" {
		var classRecords []ApplicationRecord
		for _, r := range all {
			if r.ClassNum == a.user.ClassNum {
				classRecords = append(classRecords, r)
			}
		}
		return classRecords, nil
	}
	return all, nil
}

// UpdateAssignedSchool 일반고 학생의 최종 배정 고등학교명을 저장합니다.
func (a *App) UpdateAssignedSchool(classNum int, studentNum, studentName, assignedSchool string) error {
	if a.user == nil {
		return fmt.Errorf("로그인이 필요합니다")
	}
	if a.user.Role == "homeroom" && a.user.ClassNum != classNum {
		return fmt.Errorf("본인 담당 학급의 학생만 수정할 수 있습니다")
	}
	return a.db.UpdateAssignedSchool(classNum, studentNum, studentName, assignedSchool)
}

// GetAdmissionClosureReview returns only school-level counts for the selected
// year; it never exposes individual student records in the summary screen.
func (a *App) GetAdmissionClosureReview(admissionYear int) (AdmissionClosureReview, error) {
	if a.user != nil && a.user.Role != "master" && a.user.Role != "viewer" {
		return AdmissionClosureReview{}, fmt.Errorf("입시 확정 현황은 학년부장·진로부장만 조회할 수 있습니다")
	}
	return a.db.GetAdmissionClosureReview(admissionYear)
}

func (a *App) GetAdmissionClosure(admissionYear int) (*AdmissionClosure, error) {
	if a.user != nil && a.user.Role != "master" && a.user.Role != "viewer" {
		return nil, fmt.Errorf("입시 확정 현황은 학년부장·진로부장만 조회할 수 있습니다")
	}
	return a.db.GetAdmissionClosure(admissionYear)
}

// CloseAdmissionYear locks a completed admission year. The final local
// acceptance statistics are reflected to the cutoff table at the same time.
func (a *App) CloseAdmissionYear(admissionYear int, note string) (*AdmissionClosure, error) {
	if a.user == nil || a.user.Role != "master" {
		return nil, fmt.Errorf("입시 결과 확정은 학년부장 계정만 할 수 있습니다")
	}
	closure, err := a.db.CloseAdmissionYear(admissionYear, a.user.Username, note)
	if err != nil {
		return nil, err
	}
	return &closure, nil
}

func (a *App) ReopenAdmissionYear(admissionYear int) error {
	if a.user == nil || a.user.Role != "master" {
		return fmt.Errorf("입시 결과 확정 해제는 학년부장 계정만 할 수 있습니다")
	}
	return a.db.ReopenAdmissionYear(admissionYear)
}

// ApplyApplicationCutoffs reflects completed school-internal admission results
// into the local cutoff table. Only the grade-head can perform this operation.
func (a *App) ApplyApplicationCutoffs() (int, error) {
	if a.user != nil && a.user.Role != "master" {
		return 0, fmt.Errorf("합격 결과 커트라인 반영은 학년부장 계정만 할 수 있습니다")
	}
	return a.db.ApplyApplicationCutoffs()
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
	classTag := username
	if classNum > 0 && !strings.Contains(username, fmt.Sprintf("%d", classNum)) {
		classTag = fmt.Sprintf("3%02d_%s", classNum, username)
	}
	defaultFilename := fmt.Sprintf("취합자료_%s.phgcpatch", classTag)
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "취합자료 제출(담임)",
		DefaultFilename: defaultFilename,
		Filters:         []runtime.FileFilter{{DisplayName: "PHGC 취합자료 (*.phgcpatch)", Pattern: "*.phgcpatch"}},
	})
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
		return "", fmt.Errorf("담임 계정으로 로그인한 뒤에만 취합자료를 제출할 수 있습니다")
	}
	changes, err := a.db.GetClassPatchChanges(a.user.ClassNum)
	if err != nil {
		return "", err
	}
	if len(changes) == 0 {
		return "", fmt.Errorf("제출할 학생 데이터가 없습니다")
	}
	// 입력된 암호가 학년부장의 공용 데이터 암호와 일치하는지 엄격히 검증
	if _, err := openSharedKeyEnvelope(a.db.dataDir, password); err != nil {
		return "", fmt.Errorf("공용 데이터 암호가 올바르지 않습니다. 학년부장에게 확인 후 정확한 암호를 입력해 주세요")
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
		if change.Attendance != "" || change.Volunteer != "" || change.Extra != "" {
			if err := a.refreshStudentSchoolScoreCache(change.ClassNum, change.StudentNum, change.StudentName); err != nil {
				return 0, err
			}
		}
	}
	return len(patch.Changes), nil
}

// ImportTeacherPatchSelected applies only the categories explicitly selected
// by the grade head after previewing a teacher patch.
func (a *App) ImportTeacherPatchSelected(password, inputPath string, selections []PatchMergeSelection) (int, error) {
	patch, err := decryptPatchGCM(password, inputPath)
	if err != nil {
		return 0, err
	}
	if patch.ClassNum < 1 || patch.SourceUsername == "" {
		return 0, fmt.Errorf("변경분 파일 정보가 올바르지 않습니다")
	}
	selected := make(map[string]PatchMergeSelection, len(selections))
	for _, item := range selections {
		if item.StudentNum != "" {
			selected[item.StudentNum] = item
		}
	}
	applied := 0
	for _, change := range patch.Changes {
		if change.ClassNum != patch.ClassNum {
			return 0, fmt.Errorf("변경분에 다른 학급 데이터가 포함되어 있습니다")
		}
		choice, ok := selected[change.StudentNum]
		if !ok {
			continue
		}
		filtered := PatchChange{ClassNum: change.ClassNum, StudentNum: change.StudentNum, StudentName: change.StudentName}
		if choice.Attendance {
			filtered.Attendance = change.Attendance
		}
		if choice.Volunteer {
			filtered.Volunteer = change.Volunteer
		}
		if choice.Extra {
			filtered.Extra = change.Extra
		}
		if choice.Applications {
			filtered.Applications = change.Applications
		}
		if filtered.Attendance == "" && filtered.Volunteer == "" && filtered.Extra == "" && len(filtered.Applications) == 0 {
			continue
		}
		if err := a.db.ApplyPatchChange(filtered); err != nil {
			return applied, err
		}
		if filtered.Attendance != "" || filtered.Volunteer != "" || filtered.Extra != "" {
			if err := a.refreshStudentSchoolScoreCache(filtered.ClassNum, filtered.StudentNum, filtered.StudentName); err != nil {
				return applied, err
			}
		}
		applied++
	}
	if applied == 0 {
		return 0, fmt.Errorf("병합할 변경 항목을 하나 이상 선택해주세요")
	}
	return applied, nil
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
		preview.Items = append(preview.Items, PatchPreviewItem{
			StudentNum: change.StudentNum, StudentName: change.StudentName,
			Attendance: change.Attendance != "", Volunteer: change.Volunteer != "",
			Extra: change.Extra != "", Applications: len(change.Applications) > 0,
		})
	}
	sort.Slice(preview.Items, func(i, j int) bool {
		numI, errI := strconv.Atoi(preview.Items[i].StudentNum)
		numJ, errJ := strconv.Atoi(preview.Items[j].StudentNum)
		if errI == nil && errJ == nil {
			return numI < numJ
		}
		return preview.Items[i].StudentNum < preview.Items[j].StudentNum
	})
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
	// 공용 데이터 암호 사전 검증: 틀린 암호 입력 시 파일 탐색기를 열지 않고 즉시 차단
	if _, err := openSharedKeyEnvelope(a.db.dataDir, password); err != nil {
		return PatchPreview{}, fmt.Errorf("공용 데이터 비밀번호가 올바르지 않습니다")
	}
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Title: "취합자료 미리보기(학년부장)", Filters: []runtime.FileFilter{{DisplayName: "PHGC 취합자료 (*.phgcpatch)", Pattern: "*.phgcpatch"}}})
	if err != nil || path == "" {
		return PatchPreview{}, err
	}
	return a.InspectTeacherPatch(password, path)
}

// OpenTeacherPatch lets the administrator select and merge one or more patch files.
func (a *App) OpenTeacherPatch(password string) (map[string]int, error) {
	// 공용 데이터 암호 사전 검증: 틀린 암호 입력 시 파일 탐색기를 열지 않고 즉시 차단
	if _, err := openSharedKeyEnvelope(a.db.dataDir, password); err != nil {
		return nil, fmt.Errorf("공용 데이터 비밀번호가 올바르지 않습니다")
	}
	paths, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title:   "취합자료 일괄 병합(학년부장) - 여러 파일 동시 선택 가능 (Ctrl 또는 Shift 클릭)",
		Filters: []runtime.FileFilter{{DisplayName: "PHGC 취합자료 (*.phgcpatch)", Pattern: "*.phgcpatch"}},
	})
	if err != nil || len(paths) == 0 {
		return nil, err
	}
	totalMerged := 0
	validFileCount := 0
	for _, path := range paths {
		if count, err := a.ImportTeacherPatch(password, path); err == nil {
			totalMerged += count
			validFileCount++
		}
	}
	if validFileCount == 0 {
		return nil, fmt.Errorf("선택된 파일 중 올바른 PHGC 취합자료가 없거나 암호가 일치하지 않습니다")
	}
	return map[string]int{
		"files":    validFileCount,
		"students": totalMerged,
	}, nil
}

// JointSharePackage 관내 타 학교와 안전하게 공유하는 커트라인 및 지원현황 통계 패키지 (학생 개인정보 100% 원천 배제)
type JointSharePackage struct {
	Format        string                   `json:"format"`
	SchoolName    string                   `json:"schoolName"`
	AdmissionYear int                      `json:"admissionYear"`
	ExportedAt    string                   `json:"exportedAt"`
	Cutoffs       []CutoffInfo             `json:"cutoffs"`
	Applications  []ApplicationSummary     `json:"applications"`
	OfficialItems []map[string]interface{} `json:"officialItems"`
}

// ExportJointShareData 현재 연도의 커트라인과 지원현황 집계(개인정보 없음) 및 공식자료를 관내 공유용 파일로 내보냄
func (a *App) ExportJointShareData(admissionYear int) (string, error) {
	if a.user == nil || a.user.Role != "master" {
		return "", fmt.Errorf("관내 진학자료 내보내기는 학년부장 계정만 가능합니다")
	}
	config, err := a.db.GetSchoolConfig()
	if err != nil {
		return "", fmt.Errorf("학교 설정을 불러올 수 없습니다: %w", err)
	}
	if admissionYear <= 0 {
		admissionYear = config.AdmissionYear
	}

	// 1. 해당 연도 커트라인 추출
	allCutoffs, err := a.db.GetCutoffs()
	if err != nil {
		allCutoffs = []CutoffInfo{}
	}
	var yearCutoffs []CutoffInfo
	for _, c := range allCutoffs {
		if c.Year == admissionYear {
			yearCutoffs = append(yearCutoffs, c)
		}
	}

	// 2. 해당 연도 지원현황 통계 추출 (개인 식별정보 완전 배제)
	allApps, err := a.db.GetApplicationSummaries()
	if err != nil {
		allApps = []ApplicationSummary{}
	}
	var yearApps []ApplicationSummary
	for _, app := range allApps {
		if app.AdmissionYear == admissionYear {
			yearApps = append(yearApps, app)
		}
	}

	// 3. 고교 공식 공개 입결 데이터 추출
	var officialList []map[string]interface{}
	if officialResp, err := a.sync.GetOfficialAdmissionData(); err == nil && officialResp != nil {
		officialList = officialResp.Items
	}

	pkg := JointSharePackage{
		Format:        "PHGC_JOINT_SHARE_V1",
		SchoolName:    config.SchoolName,
		AdmissionYear: admissionYear,
		ExportedAt:    time.Now().Format("2006-01-02 15:04:05"),
		Cutoffs:       yearCutoffs,
		Applications:  yearApps,
		OfficialItems: officialList,
	}

	data, err := json.MarshalIndent(pkg, "", "  ")
	if err != nil {
		return "", fmt.Errorf("공유 패키지 생성 실패: %w", err)
	}

	schoolName := strings.TrimSpace(config.SchoolName)
	if schoolName == "" {
		schoolName = "울산중학교"
	}
	safeSchoolName := strings.Map(func(r rune) rune {
		if strings.ContainsRune(`\/:*?"<>|`, r) {
			return '_'
		}
		return r
	}, schoolName)
	defaultFilename := fmt.Sprintf("PHGC_관내진학자료_%s_%d학년도.phgcdata", safeSchoolName, admissionYear)
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "관내 진학자료 내보내기",
		DefaultFilename: defaultFilename,
		Filters:         []runtime.FileFilter{{DisplayName: "PHGC 관내 진학자료 (*.phgcdata)", Pattern: "*.phgcdata"}},
	})
	if err != nil || path == "" {
		return "", err
	}

	if err := os.WriteFile(path, data, 0644); err != nil {
		return "", fmt.Errorf("파일 저장 실패: %w", err)
	}
	return path, nil
}

// OpenExternalURL 기본 웹브라우저로 외부 웹페이지(공식 GitHub 릴리즈 페이지 등)를 엽니다.
func (a *App) OpenExternalURL(targetURL string) error {
	if targetURL == "" {
		targetURL = "https://github.com/purnpado/PHGC/releases"
	}
	runtime.BrowserOpenURL(a.ctx, targetURL)
	return nil
}

// ImportJointShareData 타 학교의 진학자료 파일(단일 또는 다중 선택)을 열어 우리 학교 커트라인과 공식자료에 일괄 병합
func (a *App) ImportJointShareData(admissionYear int) (map[string]int, error) {
	if a.user == nil || a.user.Role != "master" {
		return nil, fmt.Errorf("타교자료 병합은 학년부장 계정만 가능합니다")
	}
	paths, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title:   "타교 진학자료 일괄 병합 - 여러 파일 동시 선택 가능",
		Filters: []runtime.FileFilter{{DisplayName: "PHGC 관내 진학자료 (*.phgcdata)", Pattern: "*.phgcdata"}},
	})
	if err != nil || len(paths) == 0 {
		return nil, err
	}

	var allCutoffsToMerge []CutoffInfo
	var allOfficialItems []map[string]interface{}
	totalApplications := 0
	validFileCount := 0

	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}

		var pkg JointSharePackage
		if err := json.Unmarshal(data, &pkg); err != nil || pkg.Format != "PHGC_JOINT_SHARE_V1" {
			continue
		}
		validFileCount++

		// 1. 커트라인 병합 목록에 추가
		allCutoffsToMerge = append(allCutoffsToMerge, pkg.Cutoffs...)

		// 2. 타교의 지원현황 중 합격/진학 결과가 있는 항목을 커트라인으로 자동 변환하여 추가 병합
		for _, app := range pkg.Applications {
			if app.AcceptedCount > 0 || app.FinalCount > 0 {
				scoreType := "score"
				if strings.Contains(app.SchoolName, "일반계고") || strings.Contains(app.Category, "general") {
					scoreType = "percentile"
				}
				allCutoffsToMerge = append(allCutoffsToMerge, CutoffInfo{
					Year:       app.AdmissionYear,
					SchoolName: app.SchoolName,
					Department: app.Department,
					Track:      app.Track,
					ScoreType:  scoreType,
					MaxValue:   app.MaxAcceptedScore,
					MinValue:   app.MinAcceptedScore,
					AvgValue:   app.AvgAcceptedScore,
				})
			}
		}
		totalApplications += len(pkg.Applications)
		allOfficialItems = append(allOfficialItems, pkg.OfficialItems...)
	}

	if validFileCount == 0 {
		return nil, fmt.Errorf("선택된 파일 중 올바른 PHGC 관내 진학자료가 없습니다")
	}

	mergedCutoffCount, err := a.db.MergeCutoffs(allCutoffsToMerge)
	if err != nil {
		return nil, fmt.Errorf("커트라인 병합 중 오류 발생: %w", err)
	}

	// 3. 공식자료 보완 (로컬 JSON에 신규 항목 병합)
	mergedOfficialCount := 0
	if len(allOfficialItems) > 0 {
		exePath, err := os.Executable()
		if err == nil {
			officialFile := filepath.Join(filepath.Dir(exePath), "official_admission_data.json")
			var localData OfficialAdmissionData
			if curBytes, readErr := os.ReadFile(officialFile); readErr == nil {
				_ = json.Unmarshal(curBytes, &localData)
			}
			existKeyMap := make(map[string]bool)
			for _, item := range localData.Items {
				k := fmt.Sprintf("%v_%v_%v", item["schoolName"], item["department"], item["admissionYear"])
				existKeyMap[k] = true
			}
			for _, item := range allOfficialItems {
				k := fmt.Sprintf("%v_%v_%v", item["schoolName"], item["department"], item["admissionYear"])
				if !existKeyMap[k] {
					localData.Items = append(localData.Items, item)
					existKeyMap[k] = true
					mergedOfficialCount++
				}
			}
			if mergedOfficialCount > 0 {
				if newBytes, marshalErr := json.MarshalIndent(localData, "", "  "); marshalErr == nil {
					_ = os.WriteFile(officialFile, newBytes, 0644)
				}
			}
		}
	}

	return map[string]int{
		"files":        validFileCount,
		"cutoffs":      mergedCutoffCount,
		"applications": totalApplications,
		"official":     mergedOfficialCount,
	}, nil
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

// QuitApp 프로그램 정상 안전 종료
func (a *App) QuitApp() {
	if a.ctx != nil {
		runtime.Quit(a.ctx)
	} else {
		os.Exit(0)
	}
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

// GetOfficialAdmissionData 로컬 공식 고입자료 목록 조회
func (a *App) GetOfficialAdmissionData() (*OfficialAdmissionData, error) {
	return a.sync.GetOfficialAdmissionData()
}

// SaveOfficialAdmissionData 로컬 공식 고입자료 저장
func (a *App) SaveOfficialAdmissionData(items []map[string]interface{}) error {
	if items == nil {
		items = []map[string]interface{}{}
	}
	official := &OfficialAdmissionData{Items: items}
	return a.sync.SaveOfficialAdmissionData(official)
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

// SetWindowTitle 창 제목을 동적으로 변경 (학년부장, 담임교사 구분용)
func (a *App) SetWindowTitle(title string) {
	if a.ctx != nil && title != "" {
		runtime.WindowSetTitle(a.ctx, title)
	}
}

// AgreementRecord 사용 서약 동의 기록 구조체
type AgreementRecord struct {
	Accepted   bool   `json:"accepted"`
	AcceptedAt string `json:"acceptedAt"`
	Version    string `json:"version"`
}

func getAgreementPath() string {
	exePath, err := os.Executable()
	if err != nil {
		return "data/agreement.json"
	}
	exePath, _ = filepath.EvalSymlinks(exePath)
	return filepath.Join(filepath.Dir(exePath), "data", "agreement.json")
}

// IsAgreementAccepted 프로그램 이용 및 개인정보 보호 서약 동의 여부 확인
func (a *App) IsAgreementAccepted() bool {
	p := getAgreementPath()
	data, err := os.ReadFile(p)
	if err != nil {
		return false
	}
	var rec AgreementRecord
	if err := json.Unmarshal(data, &rec); err != nil {
		return false
	}
	return rec.Accepted
}

// AcceptAgreement 프로그램 이용 및 개인정보 보호 서약 동의 처리
func (a *App) AcceptAgreement() error {
	p := getAgreementPath()
	dir := filepath.Dir(p)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("동의 정보 저장 폴더 생성 실패: %w", err)
	}

	rec := AgreementRecord{
		Accepted:   true,
		AcceptedAt: time.Now().Format(time.RFC3339),
		Version:    "1.0",
	}
	b, err := json.MarshalIndent(rec, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(p, b, 0644); err != nil {
		return err
	}

	// 서약 동의가 완료되었으므로 이제 기본 config DB 초기화 진행
	if !a.db.hasEncryptedConfigDB() {
		if err := a.db.InitConfigDB(); err != nil {
			fmt.Println("서약 동의 후 config DB 초기화 오류:", err)
		}
	}
	return nil
}

// SelfDestruct 사용자가 서약에 비동의 시 프로그램 실행 파일 및 관련 데이터를 즉시 안전하게 파기하고 종료
func (a *App) SelfDestruct() error {
	currentExe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("실행 파일 경로를 확인할 수 없습니다: %w", err)
	}
	currentExe, _ = filepath.EvalSymlinks(currentExe)
	exeDir := filepath.Dir(currentExe)
	dataDir := filepath.Join(exeDir, "data")
	currentPid := os.Getpid()

	psScript := fmt.Sprintf(`
$pidToWait = %d
$exePath = '%s'
$dataDirPath = '%s'

try {
    $proc = Get-Process -Id $pidToWait -ErrorAction SilentlyContinue
    if ($proc) { $proc.WaitForExit(5000) }
} catch {}
Start-Sleep -Milliseconds 500

# 1. data 폴더 영구 완전 삭제 (휴지통 우회)
if (Test-Path -LiteralPath $dataDirPath) {
    for ($i = 0; $i -lt 10; $i++) {
        try {
            [System.IO.Directory]::Delete($dataDirPath, $true)
            break
        } catch {
            try {
                Remove-Item -LiteralPath $dataDirPath -Recurse -Force -ErrorAction Stop
                break
            } catch { Start-Sleep -Milliseconds 300 }
        }
    }
}

# 2. 실행 파일(.exe) 영구 완전 삭제 (휴지통 우회)
for ($i = 0; $i -lt 15; $i++) {
    try {
        [System.IO.File]::Delete($exePath)
        break
    } catch {
        try {
            Remove-Item -LiteralPath $exePath -Force -ErrorAction Stop
            break
        } catch { Start-Sleep -Milliseconds 400 }
    }
}
`, currentPid, strings.ReplaceAll(currentExe, "'", "''"), strings.ReplaceAll(dataDir, "'", "''"))

	encodedScript := encodePowerShell(psScript)
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", encodedScript)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("자가 삭제 스크립트 실행 실패: %w", err)
	}

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

// --- 학생 1:1 진학 상담 일지 API (작성자 본인 격리 및 보안 보장) ---

// GetStudentCounselingRecords 특정 학생의 상담 일지 목록 반환 (오직 로그인한 교사 본인이 작성한 기록만 열람 가능)
func (a *App) GetStudentCounselingRecords(classNum int, studentNum, studentName string) ([]StudentCounselingRecord, error) {
	if a.user == nil {
		return nil, fmt.Errorf("로그인이 필요합니다")
	}
	// 담임교사는 자기 반 학생만 조회 가능
	if a.user.Role == "homeroom" && a.user.ClassNum != classNum {
		return nil, fmt.Errorf("담당 학급(%d반) 학생의 상담 일지만 조회할 수 있습니다", a.user.ClassNum)
	}
	return a.db.GetStudentCounselingRecords(classNum, studentNum, studentName, a.user.Username)
}

// GetClassCounselingSummary 학급 내 학생별 최근 상담 일자 맵 반환 (로그인한 교사 본인 상담 기준)
func (a *App) GetClassCounselingSummary(classNum int) (map[string]string, error) {
	if a.user == nil {
		return map[string]string{}, nil
	}
	if a.user.Role == "homeroom" && a.user.ClassNum != classNum {
		return map[string]string{}, nil
	}
	return a.db.GetClassCounselingSummary(classNum, a.user.Username)
}

// SaveStudentCounselingRecord 상담 기록 저장/수정 (본인 아이디로만 등록되며, 다른 사람은 열람/수정 불가)
func (a *App) SaveStudentCounselingRecord(record StudentCounselingRecord) error {
	if a.user == nil {
		return fmt.Errorf("로그인이 필요합니다")
	}
	// 담임교사는 자기 반 학생만 작성 가능
	if a.user.Role == "homeroom" && a.user.ClassNum != record.ClassNum {
		return fmt.Errorf("담당 학급(%d반) 학생의 상담 일지만 작성할 수 있습니다", a.user.ClassNum)
	}

	// 작성자 정보 강제 주입 (보안 격리)
	record.AuthorUsername = a.user.Username
	if a.user.Role == "master" {
		record.AuthorName = "학년부장"
	} else if a.user.Role == "viewer" {
		record.AuthorName = "진로부장"
	} else if a.user.Role == "homeroom" {
		record.AuthorName = fmt.Sprintf("%d반 담임", a.user.ClassNum)
	} else {
		record.AuthorName = a.user.Username
	}

	return a.db.SaveStudentCounselingRecord(record)
}

// DeleteStudentCounselingRecord 상담 기록 삭제 (본인 글만 삭제 가능)
func (a *App) DeleteStudentCounselingRecord(classNum int, id int64) error {
	if a.user == nil {
		return fmt.Errorf("로그인이 필요합니다")
	}
	if a.user.Role == "homeroom" && a.user.ClassNum != classNum {
		return fmt.Errorf("담당 학급(%d반) 학생의 상담 일지만 삭제할 수 있습니다", a.user.ClassNum)
	}
	return a.db.DeleteStudentCounselingRecord(classNum, id, a.user.Username)
}


