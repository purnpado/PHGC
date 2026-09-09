package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

func (dm *DBManager) SealAllDatabases() error {
	if len(dm.dataKey) != 32 {
		return nil
	}
	files, err := filepath.Glob(filepath.Join(dm.dataDir, "*.db"))
	if err != nil {
		return err
	}
	password := hex.EncodeToString(dm.dataKey)
	for _, file := range files {
		// Every application DB connection is short-lived. Reopening it here lets
		// SQLite checkpoint its WAL before we encrypt the main database file.
		db, err := dm.openDB(file)
		if err != nil {
			return err
		}
		if _, err = db.Exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE"); err != nil {
			db.Close()
			return fmt.Errorf("DB 종료 정리 실패: %w", err)
		}
		db.Close()
		if _, err := sealDatabaseFile(password, file); err != nil {
			return err
		}
		removePlainDatabaseArtifacts(file)
	}
	return nil
}

// UnsealAllDatabases restores the encrypted package only after a user has
// successfully opened their personal key envelope. Plain DB files exist only
// while the application is running and are sealed again during shutdown.
func (dm *DBManager) UnsealAllDatabases() error {
	if len(dm.dataKey) != 32 {
		return fmt.Errorf("데이터 잠금 키가 준비되지 않았습니다")
	}
	files, err := filepath.Glob(filepath.Join(dm.dataDir, "*.db.phgc"))
	if err != nil {
		return err
	}
	password := hex.EncodeToString(dm.dataKey)
	for _, encryptedPath := range files {
		workingPath := strings.TrimSuffix(encryptedPath, ".phgc")
		if _, err := os.Stat(workingPath); err == nil {
			// A prior version could create an empty config.db before login.
			// The encrypted package remains the source of truth in that case.
			if filepath.Base(workingPath) == "config.db" && !hasSchoolConfigTable(workingPath) {
				removePlainDatabaseArtifacts(workingPath)
			} else {
				// A usable plaintext DB can only be left by abnormal termination.
				// Keep it for recovery rather than silently discarding newer work.
				continue
			}
		} else if !os.IsNotExist(err) {
			return err
		}
		if err := unsealDatabaseFile(password, encryptedPath, workingPath); err != nil {
			return fmt.Errorf("암호화된 DB 열기 실패: %w", err)
		}
	}
	return nil
}

func hasSchoolConfigTable(path string) bool {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return false
	}
	defer db.Close()
	var name string
	err = db.QueryRow("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'school_config'").Scan(&name)
	return err == nil
}

// SchoolConfig 학교 설정 정보
type SchoolConfig struct {
	SchoolName    string `json:"schoolName"`
	ClassCount    int    `json:"classCount"`
	IsSmallSchool bool   `json:"isSmallSchool"`
	AdmissionYear int    `json:"admissionYear"`
}

// SetupRequest 초기 설정 요청
type SetupRequest struct {
	SchoolName         string `json:"schoolName"`
	ClassCount         int    `json:"classCount"`
	AdminPassword      string `json:"adminPassword"`
	SharedDataPassword string `json:"sharedDataPassword"`
	IsSmallSchool      bool   `json:"isSmallSchool"`
	AdmissionYear      int    `json:"admissionYear"`
}

// CutoffInfo 고교 커트라인 정보 (연도 및 전형, 최고/최저/평균점 포함)
type CutoffInfo struct {
	Year       int     `json:"year"`
	SchoolName string  `json:"schoolName"`
	Department string  `json:"department"` // 후기고는 빈 문자열
	Track      string  `json:"track"`      // 마이스터고(일반), 마이스터고(특별), 특성화고(취업), 특성화고(일반), 일반계고
	ScoreType  string  `json:"scoreType"`  // percentile 또는 total_score
	MaxValue   float64 `json:"maxValue"`
	MinValue   float64 `json:"minValue"`
	AvgValue   float64 `json:"avgValue"` // 평균점
}

// ApplicationRecord is a local-only student admission application. Scores are
// frozen at the time of application so later formula changes do not alter
// historical results.
type ApplicationRecord struct {
	ID                 int      `json:"id"`
	ClassNum           int      `json:"classNum"`
	StudentNum         string   `json:"studentNum"`
	StudentName        string   `json:"studentName"`
	AdmissionYear      int      `json:"admissionYear"`
	Category           string   `json:"category"` // meister, special, self_foreign, general, other
	SchoolName         string   `json:"schoolName"`
	Track              string   `json:"track"`
	Status             string   `json:"status"`
	Score              float64  `json:"score"`
	ScoreBasis         string   `json:"scoreBasis"`
	Preferences        []string `json:"preferences"`
	AssignedDepartment string   `json:"assignedDepartment"`
	AssignedSchool     string   `json:"assignedSchool"`
	UpdatedAt          string   `json:"updatedAt"`
}

// ApplicationSummary is a school-internal aggregate. It intentionally has no
// student, class, teacher or middle-school identifier and can be used for the
// grade-head's application dashboard.
type ApplicationSummary struct {
	AdmissionYear    int     `json:"admissionYear"`
	Category         string  `json:"category"`
	SchoolName       string  `json:"schoolName"`
	Track            string  `json:"track"`
	Department       string  `json:"department"`
	PreferenceRank   int     `json:"preferenceRank"`
	PlannedCount     int     `json:"plannedCount"`
	SubmittedCount   int     `json:"submittedCount"`
	AcceptedCount    int     `json:"acceptedCount"`
	RejectedCount    int     `json:"rejectedCount"`
	FinalCount       int     `json:"finalCount"`
	MinAcceptedScore float64 `json:"minAcceptedScore"`
	MaxAcceptedScore float64 `json:"maxAcceptedScore"`
	AvgAcceptedScore float64 `json:"avgAcceptedScore"`
	MaxRejectedScore float64 `json:"maxRejectedScore"`
	MinExpectedScore float64 `json:"minExpectedScore"`
	MaxExpectedScore float64 `json:"maxExpectedScore"`
	AvgExpectedScore float64 `json:"avgExpectedScore"`
}

// AdmissionClosure records that one admission year has been finalized by the
// grade head.  It lives only in the school's encrypted configuration DB.
type AdmissionClosure struct {
	AdmissionYear  int    `json:"admissionYear"`
	Status         string `json:"status"`
	ClosedAt       string `json:"closedAt"`
	ClosedBy       string `json:"closedBy"`
	Note           string `json:"note"`
	CutoffsApplied int    `json:"cutoffsApplied"`
}

// AdmissionClosureReview is intentionally aggregate-only and helps prevent
// an admission year from being closed while applications remain in progress.
type AdmissionClosureReview struct {
	AdmissionYear  int `json:"admissionYear"`
	TotalRecorded  int `json:"totalRecorded"`
	PendingCount   int `json:"pendingCount"`
	AcceptedCount  int `json:"acceptedCount"`
	RejectedCount  int `json:"rejectedCount"`
	WithdrawnCount int `json:"withdrawnCount"`
	FinalCount     int `json:"finalCount"`
}

// DB 매니저
type DBManager struct {
	dataDir string
	dataKey []byte
}

func (dm *DBManager) setDataKey(key []byte) {
	dm.dataKey = append(dm.dataKey[:0], key...)
}

// NewDBManager 데이터 디렉토리 경로를 설정하고 매니저를 반환 (폴더는 사전 생성하지 않고 지연 생성)
func NewDBManager() *DBManager {
	// 1차: 실행파일 위치 기준으로 data 폴더 시도
	exePath, err := os.Executable()
	if err != nil {
		exePath = "."
	}
	baseDir := filepath.Dir(exePath)
	dataDir := filepath.Join(baseDir, "data")

	// 공유폴더(UNC 경로) 또는 부모 경로 쓰기 불가능한 경우
	// 사용자 로컬 AppData 폴더에 데이터 저장
	if strings.HasPrefix(dataDir, `\\`) || !isDirWritable(baseDir) {
		homeDir, err := os.UserHomeDir()
		if err == nil {
			dataDir = filepath.Join(homeDir, ".neoeodigallae", "data")
		}
	}

	return &DBManager{dataDir: dataDir}
}

// isDirWritable 디렉토리 쓰기 권한 여부 확인 (하위 폴더를 강제 생성하지 않고 임시 파일로만 테스트)
func isDirWritable(dir string) bool {
	testFile := filepath.Join(dir, fmt.Sprintf(".write_test_%d_%d", os.Getpid(), time.Now().UnixNano()))
	f, err := os.Create(testFile)
	if err != nil {
		return false
	}
	f.Close()
	_ = os.Remove(testFile)
	return true
}

// getConfigDBPath config.db 경로 반환
func (dm *DBManager) getConfigDBPath() string {
	return filepath.Join(dm.dataDir, "config.db")
}

func (dm *DBManager) hasEncryptedConfigDB() bool {
	_, err := os.Stat(dm.getConfigDBPath() + ".phgc")
	return err == nil
}

// openDB SQLite 데이터베이스 연결 (필요 시 data 폴더 자동 생성)
func (dm *DBManager) openDB(dbPath string) (*sql.DB, error) {
	// Wails 바인딩은 화면 밖에서도 호출될 수 있다. 잠긴 암호화 패키지에
	// 대해 SQLite가 빈 .db를 자동 생성하는 것을 막는다.
	if len(dm.dataKey) != 32 {
		if _, err := os.Stat(dbPath + ".phgc"); err == nil {
			return nil, fmt.Errorf("데이터 잠금을 먼저 해제해주세요")
		}
	}

	// 실제 DB 파일을 열 때 비로소 저장 디렉토리 생성
	if err := os.MkdirAll(filepath.Dir(dbPath), 0700); err != nil {
		return nil, fmt.Errorf("데이터 저장 디렉토리 생성 실패: %w", err)
	}

	db, err := sql.Open("sqlite", dbPath+"?_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, fmt.Errorf("DB 연결 실패: %w", err)
	}
	// WAL 모드 활성화 (암호화 저장 계층 연결 전까지 기존 SQLite 동작 유지)
	_, err = db.Exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("WAL 모드 설정 실패: %w", err)
	}
	return db, nil
}

// InitConfigDB config.db 테이블 초기화
func (dm *DBManager) InitConfigDB() error {
	db, err := dm.openDB(dm.getConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS school_config (
			id             INTEGER PRIMARY KEY,
			school_name    TEXT NOT NULL,
			class_count    INTEGER NOT NULL,
			admin_password TEXT NOT NULL DEFAULT '',
			is_small_school BOOLEAN DEFAULT 0,
			admission_year  INTEGER DEFAULT 2025,
			expected_support_token TEXT NOT NULL DEFAULT '',
			grade       INTEGER DEFAULT 3,
			created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS highschool_cutoffs (
			id INTEGER PRIMARY KEY,
			year INTEGER NOT NULL,
			school_name TEXT NOT NULL,
			department TEXT NOT NULL,
			track TEXT NOT NULL,
			score_type TEXT NOT NULL,
			max_value REAL,
			min_value REAL,
			avg_value REAL DEFAULT 0,
			UNIQUE(year, school_name, department, track)
		);
		CREATE TABLE IF NOT EXISTS feedback_issues (
			id INTEGER PRIMARY KEY,
			issue_id INTEGER NOT NULL UNIQUE,
			title TEXT NOT NULL,
			status TEXT DEFAULT 'open',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY,
			username TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			role TEXT NOT NULL,
			class_num INTEGER,
			must_change_password BOOLEAN DEFAULT 1,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS admission_closures (
			admission_year INTEGER PRIMARY KEY,
			status TEXT NOT NULL DEFAULT 'closed',
			closed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			closed_by TEXT NOT NULL DEFAULT '',
			note TEXT NOT NULL DEFAULT '',
			cutoffs_applied INTEGER NOT NULL DEFAULT 0
		);
	`)
	if err != nil {
		return fmt.Errorf("config 테이블 생성 실패: %w", err)
	}

	// 기존 DB 마이그레이션 (avg_value 컬럼 추가)
	_, _ = db.Exec("ALTER TABLE highschool_cutoffs ADD COLUMN avg_value REAL DEFAULT 0")
	_, _ = db.Exec("ALTER TABLE school_config ADD COLUMN expected_support_token TEXT NOT NULL DEFAULT ''")

	// 기본 커트라인 실데이터 시드 (울산마이스터고 2024-2026 공식 공개 실데이터 & 후기일반고 기본값)
	_, _ = db.Exec(`
		INSERT OR IGNORE INTO highschool_cutoffs (year, school_name, department, track, score_type, min_value, max_value, avg_value) VALUES
		-- 울산마이스터고등학교 (300점 만점 공식 입결 데이터)
		(2024, '울산마이스터고등학교', '공통', '일반전형', 'total_score', 215.82, 291.69, 253.75),
		(2024, '울산마이스터고등학교', '공통', '특별전형', 'total_score', 212.85, 287.15, 250.00),
		(2024, '울산마이스터고등학교', '', '일반', 'total_score', 215.82, 291.69, 253.75),
		(2024, '울산마이스터고등학교', '', '특별', 'total_score', 212.85, 287.15, 250.00),
		(2025, '울산마이스터고등학교', '공통', '일반전형', 'total_score', 218.04, 299.09, 258.50),
		(2025, '울산마이스터고등학교', '공통', '특별전형', 'total_score', 206.33, 285.59, 245.90),
		(2025, '울산마이스터고등학교', '', '일반', 'total_score', 218.04, 299.09, 258.50),
		(2025, '울산마이스터고등학교', '', '특별', 'total_score', 206.33, 285.59, 245.90),
		(2026, '울산마이스터고등학교', '공통', '일반전형', 'total_score', 245.22, 300.00, 272.60),
		(2026, '울산마이스터고등학교', '공통', '특별전형', 'total_score', 241.03, 260.37, 250.70),
		(2026, '울산마이스터고등학교', '', '일반', 'total_score', 245.22, 300.00, 272.60),
		(2026, '울산마이스터고등학교', '', '특별', 'total_score', 241.03, 260.37, 250.70);
	`)
	return nil
}

// SaveSchoolConfig 학교 설정 저장
func (dm *DBManager) SaveSchoolConfig(schoolName string, classCount int, adminPassword string, isSmallSchool bool, admissionYear int) error {
	db, err := dm.openDB(dm.getConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	// 기존 설정이 있으면 업데이트, 없으면 삽입
	_, err = db.Exec(`
		INSERT INTO school_config (id, school_name, class_count, admin_password, is_small_school, admission_year, updated_at)
		VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(id) DO UPDATE SET
			school_name    = excluded.school_name,
			class_count    = excluded.class_count,
			admin_password = excluded.admin_password,
			is_small_school = excluded.is_small_school,
			admission_year  = excluded.admission_year,
			updated_at     = CURRENT_TIMESTAMP
	`, schoolName, classCount, adminPassword, isSmallSchool, admissionYear)
	if err != nil {
		return fmt.Errorf("학교 설정 저장 실패: %w", err)
	}
	return nil
}

// GetSchoolConfig 학교 설정 조회
func (dm *DBManager) GetSchoolConfig() (*SchoolConfig, error) {
	db, err := dm.openDB(dm.getConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()

	var config SchoolConfig
	err = db.QueryRow("SELECT school_name, class_count, is_small_school, admission_year FROM school_config WHERE id = 1").
		Scan(&config.SchoolName, &config.ClassCount, &config.IsSmallSchool, &config.AdmissionYear)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil // 설정이 없는 경우
		}
		return nil, fmt.Errorf("학교 설정 조회 실패: %w", err)
	}
	return &config, nil
}

// GetExpectedSupportToken returns an opaque, random participation key for the
// optional expected-support service. It is stored only in the encrypted local
// config DB and is not derived from a user's password or device identity.
func (dm *DBManager) GetExpectedSupportToken() (string, error) {
	db, err := dm.openDB(dm.getConfigDBPath())
	if err != nil {
		return "", err
	}
	defer db.Close()
	var token string
	if err := db.QueryRow("SELECT expected_support_token FROM school_config WHERE id = 1").Scan(&token); err != nil {
		if err == sql.ErrNoRows {
			return "", fmt.Errorf("학교 초기 설정을 먼저 완료해주세요")
		}
		return "", fmt.Errorf("예상 지원현황 참여 키 조회 실패: %w", err)
	}
	if strings.TrimSpace(token) != "" {
		return token, nil
	}
	bytes := make([]byte, 24)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("예상 지원현황 참여 키 생성 실패: %w", err)
	}
	token = hex.EncodeToString(bytes)
	if _, err := db.Exec("UPDATE school_config SET expected_support_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1", token); err != nil {
		return "", fmt.Errorf("예상 지원현황 참여 키 저장 실패: %w", err)
	}
	return token, nil
}

// UpdateAdmissionYear changes only the default admission year.  It intentionally
// does not recreate teacher accounts or touch their password/key envelopes.
func (dm *DBManager) UpdateAdmissionYear(admissionYear int) error {
	if admissionYear < 2000 || admissionYear > 2100 {
		return fmt.Errorf("입학년도는 2000~2100년 사이여야 합니다")
	}
	db, err := dm.openDB(dm.getConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()
	result, err := db.Exec(`UPDATE school_config SET admission_year = ?, updated_at = CURRENT_TIMESTAMP`, admissionYear)
	if err != nil {
		return fmt.Errorf("입학년도 설정 저장 실패: %w", err)
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return fmt.Errorf("학교 초기 설정을 먼저 완료해주세요")
	}
	return nil
}

// VerifyAdminPassword 관리자 비밀번호 검증
func (dm *DBManager) VerifyAdminPassword(password string) (bool, error) {
	db, err := dm.openDB(dm.getConfigDBPath())
	if err != nil {
		return false, err
	}
	defer db.Close()

	var storedPassword string
	err = db.QueryRow("SELECT admin_password FROM school_config WHERE id = 1").
		Scan(&storedPassword)
	if err != nil {
		return false, fmt.Errorf("비밀번호 조회 실패: %w", err)
	}

	err = bcrypt.CompareHashAndPassword([]byte(storedPassword), []byte(password))
	return err == nil, nil
}

// HasConfig 설정 존재 여부 확인
func (dm *DBManager) HasConfig() bool {
	config, err := dm.GetSchoolConfig()
	return err == nil && config != nil
}

// --- 고입 커트라인 관리 ---

// SaveCutoffs 고교 커트라인 저장
func (dm *DBManager) SaveCutoffs(cutoffs []CutoffInfo) error {
	db, err := dm.openDB(dm.getConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		return err
	}

	for _, c := range cutoffs {
		_, err = tx.Exec(`
			INSERT INTO highschool_cutoffs (year, school_name, department, track, score_type, max_value, min_value, avg_value)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(year, school_name, department, track) DO UPDATE SET
				score_type = excluded.score_type,
				max_value = excluded.max_value,
				min_value = excluded.min_value,
				avg_value = excluded.avg_value
		`, c.Year, c.SchoolName, c.Department, c.Track, c.ScoreType, c.MaxValue, c.MinValue, c.AvgValue)
		if err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}

// GetCutoffs 커트라인 정보 반환
func (dm *DBManager) GetCutoffs() ([]CutoffInfo, error) {
	db, err := dm.openDB(dm.getConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query("SELECT year, school_name, department, track, score_type, max_value, min_value, IFNULL(avg_value, 0) FROM highschool_cutoffs")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cutoffs []CutoffInfo
	for rows.Next() {
		var c CutoffInfo
		if err := rows.Scan(&c.Year, &c.SchoolName, &c.Department, &c.Track, &c.ScoreType, &c.MaxValue, &c.MinValue, &c.AvgValue); err == nil {
			cutoffs = append(cutoffs, c)
		}
	}
	return cutoffs, nil
}

// PurgeOldCutoffs 기준 입학년도 대비 보관 연한(기본 5개년)이 지난 오래된 커트라인 데이터를 자동 정리
func (dm *DBManager) PurgeOldCutoffs(baseAdmissionYear, keepYears int) (int64, error) {
	if keepYears <= 0 {
		keepYears = 5
	}
	cutoffYear := baseAdmissionYear - (keepYears - 1)
	db, err := dm.openDB(dm.getConfigDBPath())
	if err != nil {
		return 0, err
	}
	defer db.Close()

	res, err := db.Exec("DELETE FROM highschool_cutoffs WHERE year < ?", cutoffYear)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// MergeCutoffs 타 학교 커트라인을 우리 학교 커트라인과 스마트 병합
func (dm *DBManager) MergeCutoffs(incoming []CutoffInfo) (int, error) {
	if len(incoming) == 0 {
		return 0, nil
	}
	existing, err := dm.GetCutoffs()
	if err != nil {
		return 0, err
	}
	type key struct {
		year                int
		school, dept, track string
	}
	existMap := make(map[key]CutoffInfo)
	for _, e := range existing {
		k := key{e.Year, e.SchoolName, e.Department, e.Track}
		existMap[k] = e
	}

	mergedList := make([]CutoffInfo, 0, len(incoming))
	count := 0
	for _, inc := range incoming {
		if inc.SchoolName == "" {
			continue
		}
		k := key{inc.Year, inc.SchoolName, inc.Department, inc.Track}
		if cur, ok := existMap[k]; ok {
			updated := cur
			changed := false
			if inc.MinValue > 0 && (cur.MinValue == 0 || inc.MinValue < cur.MinValue) {
				updated.MinValue = inc.MinValue
				changed = true
			}
			if inc.MaxValue > cur.MaxValue {
				updated.MaxValue = inc.MaxValue
				changed = true
			}
			if updated.AvgValue == 0 && inc.AvgValue > 0 {
				updated.AvgValue = inc.AvgValue
				changed = true
			}
			if changed {
				mergedList = append(mergedList, updated)
				count++
			}
		} else {
			mergedList = append(mergedList, inc)
			count++
		}
	}

	if len(mergedList) > 0 {
		if err := dm.SaveCutoffs(mergedList); err != nil {
			return 0, err
		}
	}
	return count, nil
}

// ----------------------------------------------------
// Feedback Issues
// ----------------------------------------------------

type FeedbackIssue struct {
	IssueID   int    `json:"issue_id"`
	Title     string `json:"title"`
	Status    string `json:"status"`
	CreatedAt string `json:"created_at"`
}

func (dm *DBManager) SaveFeedbackIssue(issueID int, title string) error {
	db, err := dm.openDB(dm.getConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec("INSERT INTO feedback_issues (issue_id, title) VALUES (?, ?)", issueID, title)
	return err
}

func (dm *DBManager) GetFeedbackIssues() ([]FeedbackIssue, error) {
	db, err := dm.openDB(dm.getConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query("SELECT issue_id, title, status, created_at FROM feedback_issues ORDER BY created_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	issues := []FeedbackIssue{}
	for rows.Next() {
		var i FeedbackIssue
		rows.Scan(&i.IssueID, &i.Title, &i.Status, &i.CreatedAt)
		issues = append(issues, i)
	}
	return issues, nil
}

// --- 학급별 성적 DB 관리 ---

// getClassDBPath 학급별 DB 경로 반환
func (dm *DBManager) getClassDBPath(classNum int) string {
	return filepath.Join(dm.dataDir, fmt.Errorf("class_%d.db", classNum).Error())
}

// InitClassDB 학급 DB 초기화 (테이블 생성)
func (dm *DBManager) InitClassDB(classNum int) error {
	dbPath := filepath.Join(dm.dataDir, fmt.Sprintf("class_%d.db", classNum))
	db, err := dm.openDB(dbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS students (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			student_num TEXT NOT NULL,
			name TEXT NOT NULL,
			grades_json TEXT,
			attendance_json TEXT DEFAULT '',
			volunteer_json TEXT DEFAULT '',
			extra_json TEXT DEFAULT ''
		);
		CREATE TABLE IF NOT EXISTS student_applications (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			student_num TEXT NOT NULL,
			student_name TEXT NOT NULL,
			admission_year INTEGER NOT NULL,
			category TEXT NOT NULL,
			school_name TEXT DEFAULT '',
			track TEXT DEFAULT '',
			status TEXT NOT NULL DEFAULT '미입력',
			score REAL DEFAULT 0,
			score_basis TEXT DEFAULT '',
			preferences_json TEXT DEFAULT '[]',
			assigned_department TEXT DEFAULT '',
			assigned_school TEXT DEFAULT '',
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(student_num, student_name, admission_year, category, school_name, track)
		);
		CREATE TABLE IF NOT EXISTS student_school_scores (
			student_num TEXT NOT NULL,
			student_name TEXT NOT NULL,
			school_name TEXT NOT NULL,
			track TEXT NOT NULL,
			total_score REAL NOT NULL,
			total_max REAL NOT NULL,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY(student_num, student_name, school_name, track)
		);
	`)

	// 기존 테이블에 컬럼 추가 (오류 무시 - 이미 존재할 경우)
	_, _ = db.Exec(`ALTER TABLE students ADD COLUMN attendance_json TEXT DEFAULT ''`)
	_, _ = db.Exec(`ALTER TABLE students ADD COLUMN volunteer_json TEXT DEFAULT ''`)
	_, _ = db.Exec(`ALTER TABLE students ADD COLUMN extra_json TEXT DEFAULT ''`)
	_, _ = db.Exec(`ALTER TABLE student_applications ADD COLUMN assigned_school TEXT DEFAULT ''`)

	if err != nil {
		return fmt.Errorf("학급 DB 초기화 실패: %w", err)
	}
	return nil
}

// SaveClassStudents 파싱된 학급 데이터를 DB에 저장 (기존 데이터 삭제 후 덮어쓰기)
func (dm *DBManager) SaveClassStudents(classNum int, students []StudentExcelData) error {
	if err := dm.InitClassDB(classNum); err != nil {
		return err
	}

	dbPath := filepath.Join(dm.dataDir, fmt.Sprintf("class_%d.db", classNum))
	db, err := dm.openDB(dbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	// 트랜잭션 시작
	tx, err := db.Begin()
	if err != nil {
		return err
	}

	// 기존 데이터 비우기 (매번 새로 덮어쓰는 방식)
	_, err = tx.Exec("DELETE FROM students")
	if err != nil {
		tx.Rollback()
		return err
	}

	stmt, err := tx.Prepare(`
		INSERT INTO students (student_num, name, grades_json, attendance_json, volunteer_json, extra_json)
		VALUES (?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()

	for _, s := range students {
		_, err = stmt.Exec(s.StudentNum, s.Name, s.RawData, s.AttendanceData, s.VolunteerData, s.ExtraData)
		if err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}

// UpdateStudentAttendance 파싱된 출결 데이터를 기존 학생 DB에 병합
func (dm *DBManager) UpdateStudentAttendance(classNum int, students []StudentExcelData) (int, error) {
	dbPath := filepath.Join(dm.dataDir, fmt.Sprintf("class_%d.db", classNum))
	db, err := dm.openDB(dbPath)
	if err != nil {
		return 0, err
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}

	stmt, err := tx.Prepare(`
		UPDATE students 
		SET attendance_json = ? 
		WHERE (REPLACE(name, ' ', '') = REPLACE(?, ' ', '')) 
		  AND (CAST(student_num AS INTEGER) = CAST(? AS INTEGER) OR student_num = ?)
	`)
	if err != nil {
		tx.Rollback()
		return 0, err
	}
	defer stmt.Close()

	// 2차 fallback stmt (학번 불일치 시 반 내 이름 매칭)
	stmtNameFallback, err := tx.Prepare(`
		UPDATE students 
		SET attendance_json = ? 
		WHERE REPLACE(name, ' ', '') = REPLACE(?, ' ', '')
	`)
	if err != nil {
		tx.Rollback()
		return 0, err
	}
	defer stmtNameFallback.Close()

	updatedCount := 0
	for _, s := range students {
		res, err := stmt.Exec(s.AttendanceData, s.Name, s.StudentNum, s.StudentNum)
		if err != nil {
			tx.Rollback()
			return 0, err
		}
		rows, _ := res.RowsAffected()
		if rows > 0 {
			updatedCount += int(rows)
		} else {
			// fallback: 이름으로 매칭 시도
			resFallback, err := stmtNameFallback.Exec(s.AttendanceData, s.Name)
			if err == nil {
				r2, _ := resFallback.RowsAffected()
				updatedCount += int(r2)
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return updatedCount, nil
}

// UpdateStudentVolunteer 파싱된 봉사 데이터를 기존 학생 DB에 병합
func (dm *DBManager) UpdateStudentVolunteer(classNum int, students []StudentExcelData) (int, error) {
	dbPath := filepath.Join(dm.dataDir, fmt.Sprintf("class_%d.db", classNum))
	db, err := dm.openDB(dbPath)
	if err != nil {
		return 0, err
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}

	stmt, err := tx.Prepare(`
		UPDATE students 
		SET volunteer_json = ? 
		WHERE (REPLACE(name, ' ', '') = REPLACE(?, ' ', '')) 
		  AND (CAST(student_num AS INTEGER) = CAST(? AS INTEGER) OR student_num = ?)
	`)
	if err != nil {
		tx.Rollback()
		return 0, err
	}
	defer stmt.Close()

	// 2차 fallback stmt (학번 불일치 시 반 내 이름 매칭)
	stmtNameFallback, err := tx.Prepare(`
		UPDATE students 
		SET volunteer_json = ? 
		WHERE REPLACE(name, ' ', '') = REPLACE(?, ' ', '')
	`)
	if err != nil {
		tx.Rollback()
		return 0, err
	}
	defer stmtNameFallback.Close()

	updatedCount := 0
	for _, s := range students {
		res, err := stmt.Exec(s.VolunteerData, s.Name, s.StudentNum, s.StudentNum)
		if err != nil {
			tx.Rollback()
			return 0, err
		}
		rows, _ := res.RowsAffected()
		if rows > 0 {
			updatedCount += int(rows)
		} else {
			// fallback: 이름으로 매칭 시도
			resFallback, err := stmtNameFallback.Exec(s.VolunteerData, s.Name)
			if err == nil {
				r2, _ := resFallback.RowsAffected()
				updatedCount += int(r2)
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return updatedCount, nil
}

// UpdateStudentExtra 수기 입력 가산점 및 추가사항 업데이트
func (dm *DBManager) UpdateStudentExtra(classNum int, studentNum, name, extraJSON string) error {
	dbPath := filepath.Join(dm.dataDir, fmt.Sprintf("class_%d.db", classNum))
	db, err := dm.openDB(dbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec("UPDATE students SET extra_json = ? WHERE name = ? AND student_num = ?", extraJSON, name, studentNum)
	return err
}

// ReplaceStudentSchoolScores stores all pre-calculated school/track scores for one student.
func (dm *DBManager) ReplaceStudentSchoolScores(classNum int, studentNum, name string, results []SchoolCalcResult) error {
	if err := dm.InitClassDB(classNum); err != nil {
		return err
	}
	db, err := dm.openDB(dm.getClassDBPath(classNum))
	if err != nil {
		return err
	}
	defer db.Close()
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	if _, err = tx.Exec("DELETE FROM student_school_scores WHERE student_num = ? AND student_name = ?", studentNum, name); err != nil {
		_ = tx.Rollback()
		return err
	}
	stmt, err := tx.Prepare("INSERT INTO student_school_scores (student_num, student_name, school_name, track, total_score, total_max, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)")
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	defer stmt.Close()
	for _, result := range results {
		if _, err = stmt.Exec(studentNum, name, result.SchoolName, result.TrackName, result.TotalScore, result.TotalMax); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

func (dm *DBManager) GetStudentSchoolScore(classNum int, studentNum, name, schoolName, track string) (*SchoolCalcResult, error) {
	if err := dm.InitClassDB(classNum); err != nil {
		return nil, err
	}
	db, err := dm.openDB(dm.getClassDBPath(classNum))
	if err != nil {
		return nil, err
	}
	defer db.Close()
	var result SchoolCalcResult
	err = db.QueryRow(`SELECT school_name, track, total_score, total_max FROM student_school_scores
		WHERE student_num = ? AND student_name = ? AND school_name = ? AND track = ?`,
		studentNum, name, schoolName, track).Scan(&result.SchoolName, &result.TrackName, &result.TotalScore, &result.TotalMax)
	if err != nil {
		return nil, err
	}
	return &result, nil
}

func (dm *DBManager) GetStudentSchoolScores(classNum int, studentNum, name string) ([]SchoolCalcResult, error) {
	if err := dm.InitClassDB(classNum); err != nil {
		return nil, err
	}
	db, err := dm.openDB(dm.getClassDBPath(classNum))
	if err != nil {
		return nil, err
	}
	defer db.Close()
	rows, err := db.Query(`SELECT school_name, track, total_score, total_max FROM student_school_scores
		WHERE student_num = ? AND student_name = ? ORDER BY school_name, track`, studentNum, name)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var results []SchoolCalcResult
	for rows.Next() {
		var result SchoolCalcResult
		if err := rows.Scan(&result.SchoolName, &result.TrackName, &result.TotalScore, &result.TotalMax); err != nil {
			return nil, err
		}
		results = append(results, result)
	}
	return results, rows.Err()
}

func (dm *DBManager) SaveApplication(record ApplicationRecord) error {
	if record.ClassNum < 1 || record.StudentNum == "" || record.StudentName == "" || record.AdmissionYear < 2000 || record.Category == "" || record.Status == "" {
		return fmt.Errorf("지원 기록 정보가 올바르지 않습니다")
	}
	validCategories := map[string]bool{"meister": true, "special": true, "self_foreign": true, "general": true, "other": true, "none": true}
	validStatuses := map[string]bool{
		"미입력": true,
		"지원희망": true, "지원 희망": true,
		"지원예정": true, "지원 예정": true,
		"지원완료": true, "지원 완료": true,
		"합격": true, "불합격": true,
		"포기": true, "최종 진학": true,
		"미진학": true,
	}
	if !validCategories[record.Category] || !validStatuses[record.Status] {
		return fmt.Errorf("지원 구분 또는 상태값이 올바르지 않습니다")
	}
	closed, err := dm.IsAdmissionYearClosed(record.AdmissionYear)
	if err != nil {
		return err
	}
	if closed {
		return fmt.Errorf("%d학년도 입시 결과가 확정되어 지원현황을 수정할 수 없습니다. 학년부장이 확정을 해제한 뒤 수정해주세요", record.AdmissionYear)
	}
	if len(record.Preferences) > 5 {
		return fmt.Errorf("학과 지망은 최대 5개까지 입력할 수 있습니다")
	}
	if (record.Category == "meister" || record.Category == "special" || record.Category == "self_foreign") && record.SchoolName == "" {
		return fmt.Errorf("마이스터고·특성화고·자사고·외고 지원에는 학교명이 필요합니다")
	}
	if record.Category == "none" && record.SchoolName == "" {
		record.SchoolName = "미진학"
	}
	if record.Category == "general" && (len(record.Preferences) != 0 || record.AssignedDepartment != "") {
		return fmt.Errorf("후기 일반고는 학과 지망을 기록하지 않습니다")
	}
	if (record.Category == "self_foreign" || record.Category == "none") && (len(record.Preferences) != 0 || record.AssignedDepartment != "") {
		return fmt.Errorf("자사고·외고 및 미진학은 학과 지망을 기록하지 않습니다")
	}
	prefs, err := json.Marshal(record.Preferences)
	if err != nil {
		return err
	}
	db, err := dm.openDB(dm.getClassDBPath(record.ClassNum))
	if err != nil {
		return err
	}
	defer db.Close()
	_, err = db.Exec(`INSERT INTO student_applications (student_num,student_name,admission_year,category,school_name,track,status,score,score_basis,preferences_json,assigned_department,assigned_school,updated_at)
	VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
	ON CONFLICT(student_num,student_name,admission_year,category,school_name,track) DO UPDATE SET status=excluded.status,score=excluded.score,score_basis=excluded.score_basis,preferences_json=excluded.preferences_json,assigned_department=excluded.assigned_department,assigned_school=excluded.assigned_school,updated_at=CURRENT_TIMESTAMP`, record.StudentNum, record.StudentName, record.AdmissionYear, record.Category, record.SchoolName, record.Track, record.Status, record.Score, record.ScoreBasis, string(prefs), record.AssignedDepartment, record.AssignedSchool)
	return err
}

func (dm *DBManager) DeleteApplication(classNum int, studentNum, studentName, category, schoolName, track string) error {
	db, err := dm.openDB(dm.getClassDBPath(classNum))
	if err != nil {
		return err
	}
	defer db.Close()
	_, err = db.Exec(`DELETE FROM student_applications 
		WHERE student_num=? AND student_name=? AND category=? AND school_name=? AND track=?`,
		studentNum, studentName, category, schoolName, track)
	return err
}

func (dm *DBManager) IsAdmissionYearClosed(admissionYear int) (bool, error) {
	// A class-only temporary DB may be used by imports/tests before the school
	// configuration database exists. In that state no admission year can be
	// closed yet, so writing the class record must remain possible.
	if _, err := os.Stat(dm.getConfigDBPath()); os.IsNotExist(err) {
		return false, nil
	} else if err != nil {
		return false, err
	}
	db, err := dm.openDB(dm.getConfigDBPath())
	if err != nil {
		return false, err
	}
	defer db.Close()
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM admission_closures WHERE admission_year=? AND status='closed'", admissionYear).Scan(&count); err != nil {
		return false, err
	}
	return count > 0, nil
}

func (dm *DBManager) GetAdmissionClosure(admissionYear int) (*AdmissionClosure, error) {
	db, err := dm.openDB(dm.getConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()
	var closure AdmissionClosure
	err = db.QueryRow(`SELECT admission_year,status,COALESCE(closed_at,''),closed_by,note,cutoffs_applied
		FROM admission_closures WHERE admission_year=?`, admissionYear).Scan(
		&closure.AdmissionYear, &closure.Status, &closure.ClosedAt, &closure.ClosedBy, &closure.Note, &closure.CutoffsApplied,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &closure, nil
}

func (dm *DBManager) GetAdmissionClosureReview(admissionYear int) (AdmissionClosureReview, error) {
	config, err := dm.GetSchoolConfig()
	if err != nil {
		return AdmissionClosureReview{}, err
	}
	review := AdmissionClosureReview{AdmissionYear: admissionYear}
	for classNum := 1; classNum <= config.ClassCount; classNum++ {
		db, err := dm.openDB(dm.getClassDBPath(classNum))
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return review, err
		}
		rows, queryErr := db.Query(`SELECT status, COUNT(*) FROM student_applications WHERE admission_year=? GROUP BY status`, admissionYear)
		if queryErr != nil {
			db.Close()
			return review, queryErr
		}
		for rows.Next() {
			var status string
			var count int
			if err := rows.Scan(&status, &count); err != nil {
				rows.Close()
				db.Close()
				return review, err
			}
			review.TotalRecorded += count
			switch status {
			case "미입력", "지원희망", "지원 희망", "지원예정", "지원 예정", "지원완료", "지원 완료":
				review.PendingCount += count
			case "합격":
				review.AcceptedCount += count
			case "불합격":
				review.RejectedCount += count
			case "포기", "미진학":
				review.WithdrawnCount += count
			case "최종 진학":
				review.FinalCount += count
			}
		}
		rows.Close()
		db.Close()
	}
	return review, nil
}

// CloseAdmissionYear locks the finalized year and writes its result-derived
// cutoffs into the local reference table. Pending applications must first be
// recorded as a final result or withdrawal.
func (dm *DBManager) CloseAdmissionYear(admissionYear int, closedBy, note string) (AdmissionClosure, error) {
	review, err := dm.GetAdmissionClosureReview(admissionYear)
	if err != nil {
		return AdmissionClosure{}, err
	}
	if review.PendingCount > 0 {
		return AdmissionClosure{}, fmt.Errorf("지원 예정·지원 완료·미입력 기록이 %d건 남아 있습니다. 합격·불합격·포기·최종 진학으로 결과를 확정해주세요", review.PendingCount)
	}
	if review.TotalRecorded == 0 {
		return AdmissionClosure{}, fmt.Errorf("확정할 지원현황 기록이 없습니다")
	}
	if alreadyClosed, err := dm.IsAdmissionYearClosed(admissionYear); err != nil {
		return AdmissionClosure{}, err
	} else if alreadyClosed {
		return AdmissionClosure{}, fmt.Errorf("%d학년도 입시는 이미 확정되었습니다", admissionYear)
	}
	cutoffsApplied, err := dm.ApplyApplicationCutoffsForYear(admissionYear)
	if err != nil {
		return AdmissionClosure{}, err
	}
	db, err := dm.openDB(dm.getConfigDBPath())
	if err != nil {
		return AdmissionClosure{}, err
	}
	defer db.Close()
	_, err = db.Exec(`INSERT INTO admission_closures (admission_year,status,closed_by,note,cutoffs_applied)
		VALUES (?, 'closed', ?, ?, ?)`, admissionYear, closedBy, strings.TrimSpace(note), cutoffsApplied)
	if err != nil {
		return AdmissionClosure{}, err
	}
	return *mustGetAdmissionClosure(dm, admissionYear), nil
}

// mustGetAdmissionClosure is used after a successful local insert. It keeps
// the CloseAdmissionYear API compact without returning a partially populated
// record to the UI.
func mustGetAdmissionClosure(dm *DBManager, admissionYear int) *AdmissionClosure {
	closure, err := dm.GetAdmissionClosure(admissionYear)
	if err != nil {
		return &AdmissionClosure{AdmissionYear: admissionYear, Status: "closed"}
	}
	return closure
}

func (dm *DBManager) ReopenAdmissionYear(admissionYear int) error {
	db, err := dm.openDB(dm.getConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()
	result, err := db.Exec("DELETE FROM admission_closures WHERE admission_year=?", admissionYear)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return fmt.Errorf("%d학년도 확정 기록이 없습니다", admissionYear)
	}
	return nil
}

func (dm *DBManager) GetStudentApplications(classNum int, studentNum, name string) ([]ApplicationRecord, error) {
	db, err := dm.openDB(dm.getClassDBPath(classNum))
	if err != nil {
		return nil, err
	}
	defer db.Close()
	rows, err := db.Query(`SELECT id,admission_year,category,school_name,track,status,score,score_basis,preferences_json,assigned_department,COALESCE(assigned_school, ''),updated_at FROM student_applications WHERE student_num=? AND student_name=? ORDER BY updated_at DESC`, studentNum, name)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ApplicationRecord
	for rows.Next() {
		var r ApplicationRecord
		var prefs string
		if err := rows.Scan(&r.ID, &r.AdmissionYear, &r.Category, &r.SchoolName, &r.Track, &r.Status, &r.Score, &r.ScoreBasis, &prefs, &r.AssignedDepartment, &r.AssignedSchool, &r.UpdatedAt); err != nil {
			return nil, err
		}
		r.ClassNum = classNum
		r.StudentNum = studentNum
		r.StudentName = name
		_ = json.Unmarshal([]byte(prefs), &r.Preferences)
		out = append(out, r)
	}
	return out, rows.Err()
}

func (dm *DBManager) GetSchoolApplicationRecords() ([]ApplicationRecord, error) {
	config, err := dm.GetSchoolConfig()
	if err != nil {
		return nil, err
	}
	var all []ApplicationRecord
	for classNum := 1; classNum <= config.ClassCount; classNum++ {
		db, err := dm.openDB(dm.getClassDBPath(classNum))
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, err
		}
		rows, err := db.Query(`SELECT student_num,student_name,admission_year,category,school_name,track,status,score,score_basis,preferences_json,assigned_department,COALESCE(assigned_school, ''),updated_at FROM student_applications ORDER BY student_num,updated_at`)
		if err != nil {
			db.Close()
			continue
		}
		for rows.Next() {
			var r ApplicationRecord
			var prefs string
			if err := rows.Scan(&r.StudentNum, &r.StudentName, &r.AdmissionYear, &r.Category, &r.SchoolName, &r.Track, &r.Status, &r.Score, &r.ScoreBasis, &prefs, &r.AssignedDepartment, &r.AssignedSchool, &r.UpdatedAt); err == nil {
				r.ClassNum = classNum
				_ = json.Unmarshal([]byte(prefs), &r.Preferences)
				all = append(all, r)
			}
		}
		rows.Close()
		db.Close()
	}
	return all, nil
}

// GetClassPatchChanges creates an encrypted-transfer snapshot of the fields a
// homeroom teacher may maintain for their own class. The caller encrypts it
// with the shared package password before it leaves the computer.
func (dm *DBManager) GetClassPatchChanges(classNum int) ([]PatchChange, error) {
	students, err := dm.GetClassStudents(classNum)
	if err != nil {
		return nil, err
	}
	changes := make([]PatchChange, 0, len(students))
	for _, student := range students {
		applications, err := dm.GetStudentApplications(classNum, student.StudentNum, student.Name)
		if err != nil {
			return nil, err
		}
		changes = append(changes, PatchChange{ClassNum: classNum, StudentNum: student.StudentNum, StudentName: student.Name, Attendance: student.AttendanceData, Volunteer: student.VolunteerData, Extra: student.ExtraData, Applications: applications})
	}
	return changes, nil
}

// GetApplicationSummaries aggregates only data held inside this school's
// encrypted class DBs. It never sends records to a network service.
func (dm *DBManager) GetApplicationSummaries() ([]ApplicationSummary, error) {
	config, err := dm.GetSchoolConfig()
	if err != nil {
		return nil, err
	}
	classNums := make([]int, 0, config.ClassCount)
	for classNum := 1; classNum <= config.ClassCount; classNum++ {
		classNums = append(classNums, classNum)
	}
	return dm.getApplicationSummaries(classNums)
}

// GetClassApplicationSummaries is the homeroom-safe view: it aggregates only
// one class DB and never exposes other homeroom teachers' records.
func (dm *DBManager) GetClassApplicationSummaries(classNum int) ([]ApplicationSummary, error) {
	if classNum < 1 {
		return nil, fmt.Errorf("학급 정보가 올바르지 않습니다")
	}
	return dm.getApplicationSummaries([]int{classNum})
}

func (dm *DBManager) getApplicationSummaries(classNums []int) ([]ApplicationSummary, error) {
	type accumulator struct {
		ApplicationSummary
		acceptedSum    float64
		expectedSum    float64
		expectedCount  int
		hasMin         bool
		hasMax         bool
		hasExpectedMin bool
		hasExpectedMax bool
	}
	groups := map[string]*accumulator{}
	add := func(r ApplicationRecord, department string, rank int) {
		key := strings.Join([]string{strconv.Itoa(r.AdmissionYear), r.Category, r.SchoolName, r.Track, department, strconv.Itoa(rank)}, "\x1f")
		a := groups[key]
		if a == nil {
			a = &accumulator{ApplicationSummary: ApplicationSummary{AdmissionYear: r.AdmissionYear, Category: r.Category, SchoolName: r.SchoolName, Track: r.Track, Department: department, PreferenceRank: rank}}
			groups[key] = a
		}
		switch r.Status {
		case "지원희망", "지원 희망", "지원예정", "지원 예정":
			a.PlannedCount++
		case "지원완료", "지원 완료":
			a.SubmittedCount++
		case "합격":
			a.AcceptedCount++
		case "불합격":
			a.RejectedCount++
		case "최종 진학":
			a.FinalCount++
			a.AcceptedCount++
		}
		if (r.Status == "지원희망" || r.Status == "지원 희망" || r.Status == "지원예정" || r.Status == "지원 예정" || r.Status == "지원완료" || r.Status == "지원 완료") && r.Score > 0 {
			a.expectedSum += r.Score
			a.expectedCount++
			if !a.hasExpectedMin || r.Score < a.MinExpectedScore {
				a.MinExpectedScore, a.hasExpectedMin = r.Score, true
			}
			if !a.hasExpectedMax || r.Score > a.MaxExpectedScore {
				a.MaxExpectedScore, a.hasExpectedMax = r.Score, true
			}
		}
		if (r.Status == "합격" || r.Status == "최종 진학") && r.Score > 0 {
			a.acceptedSum += r.Score
			if !a.hasMin || r.Score < a.MinAcceptedScore {
				a.MinAcceptedScore, a.hasMin = r.Score, true
			}
			if !a.hasMax || r.Score > a.MaxAcceptedScore {
				a.MaxAcceptedScore, a.hasMax = r.Score, true
			}
		}
		if r.Status == "불합격" && r.Score > 0 && (!a.hasMax || r.Score > a.MaxRejectedScore) {
			a.MaxRejectedScore, a.hasMax = r.Score, true
		}
	}
	for _, classNum := range classNums {
		db, err := dm.openDB(dm.getClassDBPath(classNum))
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, err
		}
		rows, err := db.Query(`SELECT student_num,student_name,admission_year,category,school_name,track,status,score,score_basis,preferences_json,assigned_department,COALESCE(assigned_school, ''),updated_at FROM student_applications`)
		if err != nil {
			db.Close()
			continue
		}
		for rows.Next() {
			var r ApplicationRecord
			var prefs string
			if err := rows.Scan(&r.StudentNum, &r.StudentName, &r.AdmissionYear, &r.Category, &r.SchoolName, &r.Track, &r.Status, &r.Score, &r.ScoreBasis, &prefs, &r.AssignedDepartment, &r.AssignedSchool, &r.UpdatedAt); err == nil {
				_ = json.Unmarshal([]byte(prefs), &r.Preferences)
				if r.Category == "meister" || r.Category == "special" {
					// 예정·지원 단계에서만 여러 지망을 각각 집계한다. 합격·불합격
					// 결과는 실제 배정 학과 한 곳(미입력 시 학교 전체)에만 반영해
					// 한 학생이 여러 학과 합격자로 중복 집계되는 것을 막는다.
					if r.Status == "지원희망" || r.Status == "지원 희망" || r.Status == "지원예정" || r.Status == "지원 예정" || r.Status == "지원완료" || r.Status == "지원 완료" {
						for i, department := range r.Preferences {
							if department != "" {
								add(r, department, i+1)
							}
						}
					} else {
						department := r.AssignedDepartment
						if department == "" {
							department = "전체"
						}
						rank := 0
						for i, preferred := range r.Preferences {
							if preferred == department {
								rank = i + 1
								break
							}
						}
						add(r, department, rank)
					}
				} else {
					add(r, "", 0)
				}
			}
		}
		rows.Close()
		db.Close()
	}
	out := make([]ApplicationSummary, 0, len(groups))
	for _, a := range groups {
		if a.PlannedCount == 0 && a.SubmittedCount == 0 && a.AcceptedCount == 0 && a.RejectedCount == 0 && a.FinalCount == 0 {
			continue
		}
		if a.AcceptedCount > 0 && a.acceptedSum > 0 {
			a.AvgAcceptedScore = a.acceptedSum / float64(a.AcceptedCount)
		}
		if a.expectedCount > 0 {
			a.AvgExpectedScore = a.expectedSum / float64(a.expectedCount)
		}
		out = append(out, a.ApplicationSummary)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].AdmissionYear != out[j].AdmissionYear {
			return out[i].AdmissionYear > out[j].AdmissionYear
		}
		if out[i].Category != out[j].Category {
			return out[i].Category < out[j].Category
		}
		if out[i].SchoolName != out[j].SchoolName {
			return out[i].SchoolName < out[j].SchoolName
		}
		if out[i].Department != out[j].Department {
			return out[i].Department < out[j].Department
		}
		if out[i].PreferenceRank != out[j].PreferenceRank {
			return out[i].PreferenceRank < out[j].PreferenceRank
		}
		return out[i].Track < out[j].Track
	})
	return out, nil
}

// ApplyApplicationCutoffs writes only result-derived, school-internal cutoff
// values. It never sends student records outside this encrypted data folder.
func (dm *DBManager) ApplyApplicationCutoffs() (int, error) {
	return dm.applyApplicationCutoffs(0)
}

// ApplyApplicationCutoffsForYear is used by admission closure to ensure an
// older finalized year never overwrites cutoff rows from another year.
func (dm *DBManager) ApplyApplicationCutoffsForYear(admissionYear int) (int, error) {
	return dm.applyApplicationCutoffs(admissionYear)
}

func (dm *DBManager) applyApplicationCutoffs(admissionYear int) (int, error) {
	summaries, err := dm.GetApplicationSummaries()
	if err != nil {
		return 0, err
	}
	cutoffs := make([]CutoffInfo, 0)
	for _, summary := range summaries {
		if admissionYear > 0 && summary.AdmissionYear != admissionYear {
			continue
		}
		if summary.AcceptedCount == 0 || summary.SchoolName == "" || summary.Category == "other" || summary.Category == "general" {
			continue
		}
		cutoffs = append(cutoffs, CutoffInfo{
			Year:       summary.AdmissionYear,
			SchoolName: summary.SchoolName,
			Department: summary.Department,
			Track:      summary.Track,
			ScoreType:  "total_score",
			MaxValue:   summary.MaxAcceptedScore,
			MinValue:   summary.MinAcceptedScore,
			AvgValue:   summary.AvgAcceptedScore,
		})
	}
	if len(cutoffs) == 0 {
		return 0, nil
	}
	if err := dm.SaveCutoffs(cutoffs); err != nil {
		return 0, err
	}
	return len(cutoffs), nil
}

// ApplyPatchChange applies teacher changes, including class-scoped application
// records.  Every embedded record is bound to the same student and class.
func (dm *DBManager) ApplyPatchChange(change PatchChange) error {
	if change.ClassNum < 1 || change.StudentNum == "" || change.StudentName == "" {
		return fmt.Errorf("변경분의 학생 정보가 올바르지 않습니다")
	}
	if change.Attendance != "" {
		if _, err := dm.UpdateStudentAttendance(change.ClassNum, []StudentExcelData{{StudentNum: change.StudentNum, Name: change.StudentName, AttendanceData: change.Attendance}}); err != nil {
			return err
		}
	}
	if change.Volunteer != "" {
		if _, err := dm.UpdateStudentVolunteer(change.ClassNum, []StudentExcelData{{StudentNum: change.StudentNum, Name: change.StudentName, VolunteerData: change.Volunteer}}); err != nil {
			return err
		}
	}
	if change.Extra != "" {
		if err := dm.UpdateStudentExtra(change.ClassNum, change.StudentNum, change.StudentName, change.Extra); err != nil {
			return err
		}
	}
	for _, record := range change.Applications {
		record.ClassNum = change.ClassNum
		if record.StudentNum != "" && record.StudentNum != change.StudentNum {
			return fmt.Errorf("지원 기록의 학생 번호가 변경분과 일치하지 않습니다")
		}
		if record.StudentName != "" && record.StudentName != change.StudentName {
			return fmt.Errorf("지원 기록의 학생 이름이 변경분과 일치하지 않습니다")
		}
		record.StudentNum = change.StudentNum
		record.StudentName = change.StudentName
		if err := dm.SaveApplication(record); err != nil {
			return err
		}
	}
	return nil
}

// ResetAcademicYear 입시년도 전환 시 커트라인 데이터(highschool_cutoffs)를 제외한 모든 학급 데이터 삭제
func (dm *DBManager) ResetAcademicYear(newYear int) error {
	// 1. 모든 class_*.db 파일 삭제
	files, err := filepath.Glob(filepath.Join(dm.dataDir, "class_*.db"))
	if err == nil {
		for _, f := range files {
			_ = os.Remove(f)
		}
	}

	// 2. config.db의 admissionYear 업데이트
	configDBPath := dm.getConfigDBPath()
	db, err := dm.openDB(configDBPath)
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec("UPDATE school_config SET admission_year = ? WHERE id = 1", newYear)
	return err
}

// GetClassStudentCount 학급 DB의 학생 수 반환
func (dm *DBManager) GetClassStudentCount(classNum int) int {
	dbPath := filepath.Join(dm.dataDir, fmt.Sprintf("class_%d.db", classNum))
	db, err := dm.openDB(dbPath)
	if err != nil {
		return 0 // 파일이 없거나 열 수 없으면 0 반환
	}
	defer db.Close()

	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM students").Scan(&count)
	if err != nil {
		return 0
	}
	return count
}

// GetAllStudents 전체 학급의 학생 데이터 반환 (석차 계산용)
func (dm *DBManager) GetAllStudents(classCount int) (map[int][]StudentExcelData, error) {
	allStudents := make(map[int][]StudentExcelData)

	for i := 1; i <= classCount; i++ {
		dbPath := filepath.Join(dm.dataDir, fmt.Sprintf("class_%d.db", i))
		db, err := dm.openDB(dbPath)
		if err != nil {
			continue // 해당 반 데이터가 없으면 무시
		}

		rows, err := db.Query("SELECT student_num, name, grades_json, IFNULL(attendance_json, ''), IFNULL(volunteer_json, ''), IFNULL(extra_json, '') FROM students")
		if err != nil {
			db.Close()
			continue
		}

		var students []StudentExcelData
		for rows.Next() {
			var s StudentExcelData
			s.ClassNum = i
			err := rows.Scan(&s.StudentNum, &s.Name, &s.RawData, &s.AttendanceData, &s.VolunteerData, &s.ExtraData)
			if err == nil {
				students = append(students, s)
			}
		}
		rows.Close()
		db.Close()

		if len(students) > 0 {
			allStudents[i] = students
		}
	}

	return allStudents, nil
}

// User represents a system user
type User struct {
	ID                 int
	Username           string
	PasswordHash       string
	Role               string
	ClassNum           int
	MustChangePassword bool
}

// InitUsers 초기 마스터, 뷰어, 담임 계정 생성 (기존 계정 초기화)
// 교사 계정은 처음엔 비밀번호 없이 생성되며, 마스터가 추후 세팅합니다.
func (dm *DBManager) InitUsers(classCount int, adminPassword string) error {
	db, err := dm.openDB(dm.getConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec("DELETE FROM users")
	if err != nil {
		return err
	}

	hashedAdmin, err := bcrypt.GenerateFromPassword([]byte(adminPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	// 1. 마스터 계정
	_, err = db.Exec(`
		INSERT INTO users (username, password_hash, role, class_num, must_change_password)
		VALUES (?, ?, ?, ?, ?)
	`, "admin", string(hashedAdmin), "master", 0, false)
	if err != nil {
		return err
	}

	// 2. 진로부장 계정 (초기엔 접속 불가 상태)
	_, err = db.Exec(`
		INSERT INTO users (username, password_hash, role, class_num, must_change_password)
		VALUES (?, ?, ?, ?, ?)
	`, "jinro", "", "viewer", 0, true)
	if err != nil {
		return err
	}

	// 3. 담임 계정 (1반 ~ classCount반) (초기엔 접속 불가 상태)
	for i := 1; i <= classCount; i++ {
		// 3학년 1반은 301, 2반은 302처럼 학급 자체를 계정명으로 쓴다.
		username := fmt.Sprintf("3%02d", i)
		_, err = db.Exec(`
			INSERT INTO users (username, password_hash, role, class_num, must_change_password)
			VALUES (?, ?, ?, ?, ?)
		`, username, "", "homeroom", i, true)
		if err != nil {
			return err
		}
	}

	return nil
}

// GetUsers 시스템 내 모든 사용자 목록 반환
func (dm *DBManager) GetUsers() ([]User, error) {
	db, err := dm.openDB(dm.getConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT id, username, role, class_num, must_change_password
		FROM users
		ORDER BY CASE role
			WHEN 'master' THEN 0
			WHEN 'homeroom' THEN 1
			WHEN 'viewer' THEN 2
			ELSE 3
		END, class_num ASC, username ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Username, &u.Role, &u.ClassNum, &u.MustChangePassword); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, nil
}

// SetUserPassword 관리자가 특정 유저의 비밀번호를 설정/재설정
func (dm *DBManager) SetUserPassword(username, newPassword string) error {
	db, err := dm.openDB(dm.getConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	hashed, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	// 관리자가 설정해주면 무조건 다시 강제 변경하도록 설정
	_, err = db.Exec(`
		UPDATE users 
		SET password_hash = ?, must_change_password = 1 
		WHERE username = ?
	`, string(hashed), username)
	return err
}

// AddViewerUser 뷰어 권한을 가진 새 계정 추가
func (dm *DBManager) AddViewerUser(username, password string) error {
	db, err := dm.openDB(dm.getConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = db.Exec(`
		INSERT INTO users (username, password_hash, role, class_num, must_change_password)
		VALUES (?, ?, ?, ?, ?)
	`, username, string(hashed), "viewer", 0, true)
	return err
}

// CreateUser 사용자 생성 (관리자, 뷰어, 담임 등 자유 생성)
func (dm *DBManager) CreateUser(username, password, role string, classNum int) error {
	db, err := dm.openDB(dm.getConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = db.Exec(`
		INSERT INTO users (username, password_hash, role, class_num, must_change_password)
		VALUES (?, ?, ?, ?, 1)
	`, username, string(hashed), role, classNum)
	return err
}

// DeleteUser 사용자 삭제
func (dm *DBManager) DeleteUser(username string) error {
	if username == "admin" {
		return fmt.Errorf("최고 관리자(admin) 계정은 삭제할 수 없습니다")
	}
	db, err := dm.openDB(dm.getConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec("DELETE FROM users WHERE username = ?", username)
	return err
}

// VerifyUserLogin verifies login credentials
func (dm *DBManager) VerifyUserLogin(username, password string) (*User, error) {
	db, err := dm.openDB(dm.getConfigDBPath())
	if err != nil {
		return nil, err
	}
	defer db.Close()

	var u User
	err = db.QueryRow("SELECT id, username, password_hash, role, COALESCE(class_num, 0), must_change_password FROM users WHERE username = ?", username).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.ClassNum, &u.MustChangePassword)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("계정을 찾을 수 없습니다")
		}
		return nil, err
	}

	err = bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password))
	if err != nil {
		return nil, fmt.Errorf("비밀번호가 일치하지 않습니다")
	}

	return &u, nil
}

// ChangeUserPassword changes the user password
func (dm *DBManager) ChangeUserPassword(username, newPassword string) error {
	db, err := dm.openDB(dm.getConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	_, err = db.Exec("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE username = ?", string(hash), username)
	return err
}

// GetClassStudents 특정 학급의 전체 학생 목록 반환
func (dm *DBManager) GetClassStudents(classNum int) ([]StudentExcelData, error) {
	dbPath := filepath.Join(dm.dataDir, fmt.Sprintf("class_%d.db", classNum))
	db, err := dm.openDB(dbPath)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query("SELECT student_num, name, grades_json, IFNULL(attendance_json, ''), IFNULL(volunteer_json, ''), IFNULL(extra_json, '') FROM students ORDER BY CAST(student_num AS INTEGER) ASC, student_num ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []StudentExcelData
	for rows.Next() {
		var s StudentExcelData
		s.ClassNum = classNum
		if err := rows.Scan(&s.StudentNum, &s.Name, &s.RawData, &s.AttendanceData, &s.VolunteerData, &s.ExtraData); err == nil {
			list = append(list, s)
		}
	}
	return list, nil
}

// GetStudent 특정 학급의 학생 1명 조회
func (dm *DBManager) GetStudent(classNum int, studentNum, name string) (*StudentExcelData, error) {
	dbPath := filepath.Join(dm.dataDir, fmt.Sprintf("class_%d.db", classNum))
	db, err := dm.openDB(dbPath)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	var s StudentExcelData
	s.ClassNum = classNum
	err = db.QueryRow("SELECT student_num, name, grades_json, IFNULL(attendance_json, ''), IFNULL(volunteer_json, ''), IFNULL(extra_json, '') FROM students WHERE name = ? AND student_num = ?", name, studentNum).
		Scan(&s.StudentNum, &s.Name, &s.RawData, &s.AttendanceData, &s.VolunteerData, &s.ExtraData)
	if err != nil {
		return nil, err
	}
	return &s, nil
}
