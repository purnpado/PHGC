package main

import (
	"database/sql"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"

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

// DB 매니저
type DBManager struct {
	dataDir string
	dataKey []byte
}

func (dm *DBManager) setDataKey(key []byte) {
	dm.dataKey = append(dm.dataKey[:0], key...)
}

// NewDBManager 데이터 디렉토리를 초기화하고 매니저를 반환
func NewDBManager() *DBManager {
	// 1차: 실행파일 위치 기준으로 data 폴더 시도
	exePath, err := os.Executable()
	if err != nil {
		exePath = "."
	}
	dataDir := filepath.Join(filepath.Dir(exePath), "data")

	// 공유폴더(UNC 경로) 또는 쓰기 불가능한 경로인 경우
	// 사용자 로컬 AppData 폴더에 데이터 저장
	if strings.HasPrefix(dataDir, `\\`) || !isWritable(dataDir) {
		homeDir, err := os.UserHomeDir()
		if err == nil {
			dataDir = filepath.Join(homeDir, ".neoeodigallae", "data")
		}
	}

	os.MkdirAll(dataDir, 0700)
	return &DBManager{dataDir: dataDir}
}

// isWritable 디렉토리 쓰기 가능 여부 확인
func isWritable(dir string) bool {
	os.MkdirAll(dir, 0755)
	testFile := filepath.Join(dir, ".write_test")
	f, err := os.Create(testFile)
	if err != nil {
		return false
	}
	f.Close()
	os.Remove(testFile)
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

// openDB SQLite 데이터베이스 연결
func (dm *DBManager) openDB(dbPath string) (*sql.DB, error) {
	// Wails 바인딩은 화면 밖에서도 호출될 수 있다. 잠긴 암호화 패키지에
	// 대해 SQLite가 빈 .db를 자동 생성하는 것을 막는다.
	if len(dm.dataKey) != 32 {
		if _, err := os.Stat(dbPath + ".phgc"); err == nil {
			return nil, fmt.Errorf("데이터 잠금을 먼저 해제해주세요")
		}
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("DB 연결 실패: %w", err)
	}
	// WAL 모드 활성화 (암호화 저장 계층 연결 전까지 기존 SQLite 동작 유지)
	_, err = db.Exec("PRAGMA journal_mode=WAL")
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
	`)
	if err != nil {
		return fmt.Errorf("config 테이블 생성 실패: %w", err)
	}

	// 기존 DB 마이그레이션 (avg_value 컬럼 추가)
	_, _ = db.Exec("ALTER TABLE highschool_cutoffs ADD COLUMN avg_value REAL DEFAULT 0")

	// 기본 커트라인 실데이터 시드 (울산마이스터고 2024-2026 실데이터 & 후기일반고 기본값)
	_, _ = db.Exec(`
		INSERT OR IGNORE INTO highschool_cutoffs (year, school_name, department, track, score_type, min_value, max_value, avg_value) VALUES
		(2024, '울산마이스터고등학교', '공통', '일반전형', 'total_score', 215.82, 291.69, 253.75),
		(2024, '울산마이스터고등학교', '공통', '특별전형', 'total_score', 212.85, 287.15, 250.00),
		(2025, '울산마이스터고등학교', '공통', '일반전형', 'total_score', 218.04, 299.09, 258.50),
		(2025, '울산마이스터고등학교', '공통', '특별전형', 'total_score', 206.33, 285.59, 245.90),
		(2026, '울산마이스터고등학교', '공통', '일반전형', 'total_score', 245.22, 300.00, 272.60),
		(2026, '울산마이스터고등학교', '공통', '특별전형', 'total_score', 241.03, 260.37, 250.70),
		(2026, '울산 후기 일반계고', '공통', '일반계고', 'percentile', 85.0, 85.0, 85.0);
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
	`)

	// 기존 테이블에 컬럼 추가 (오류 무시 - 이미 존재할 경우)
	_, _ = db.Exec(`ALTER TABLE students ADD COLUMN attendance_json TEXT DEFAULT ''`)
	_, _ = db.Exec(`ALTER TABLE students ADD COLUMN volunteer_json TEXT DEFAULT ''`)
	_, _ = db.Exec(`ALTER TABLE students ADD COLUMN extra_json TEXT DEFAULT ''`)

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

// ApplyPatchChange applies only the three fields teachers are allowed to edit.
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
		return dm.UpdateStudentExtra(change.ClassNum, change.StudentNum, change.StudentName, change.Extra)
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

	rows, err := db.Query("SELECT student_num, name, grades_json, IFNULL(attendance_json, ''), IFNULL(volunteer_json, ''), IFNULL(extra_json, '') FROM students")
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
