package main

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

// SchoolConfig 학교 설정 정보
type SchoolConfig struct {
	SchoolName    string `json:"schoolName"`
	ClassCount    int    `json:"classCount"`
	IsSmallSchool bool   `json:"isSmallSchool"`
	AdmissionYear int    `json:"admissionYear"`
}

// SetupRequest 초기 설정 요청
type SetupRequest struct {
	SchoolName    string `json:"schoolName"`
	ClassCount    int    `json:"classCount"`
	AdminPassword string `json:"adminPassword"`
	IsSmallSchool bool   `json:"isSmallSchool"`
	AdmissionYear int    `json:"admissionYear"`
}

// CutoffInfo 고교 커트라인 정보 (연도 및 전형, 최고/최저점 포함)
type CutoffInfo struct {
	Year        int     `json:"year"`
	SchoolName  string  `json:"schoolName"`
	Department  string  `json:"department"` // 후기고는 빈 문자열
	Track       string  `json:"track"`      // 마이스터고(일반), 마이스터고(특별), 특성화고(취업), 특성화고(일반), 일반계고
	ScoreType   string  `json:"scoreType"`  // percentile 또는 total_score
	MaxValue    float64 `json:"maxValue"`
	MinValue    float64 `json:"minValue"`
}

// DB 매니저
type DBManager struct {
	dataDir string
}

// NewDBManager 데이터 디렉토리를 초기화하고 매니저를 반환
func NewDBManager() *DBManager {
	// 실행파일 위치 기준으로 data 폴더 생성
	exePath, err := os.Executable()
	if err != nil {
		exePath = "."
	}
	dataDir := filepath.Join(filepath.Dir(exePath), "data")
	os.MkdirAll(dataDir, 0755)

	return &DBManager{dataDir: dataDir}
}

// getConfigDBPath config.db 경로 반환
func (dm *DBManager) getConfigDBPath() string {
	return filepath.Join(dm.dataDir, "config.db")
}

// openDB SQLite 데이터베이스 연결
func (dm *DBManager) openDB(dbPath string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("DB 연결 실패: %w", err)
	}
	// WAL 모드 활성화 (성능 향상)
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
			INSERT INTO highschool_cutoffs (year, school_name, department, track, score_type, max_value, min_value)
			VALUES (?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(year, school_name, department, track) DO UPDATE SET
				score_type = excluded.score_type,
				max_value = excluded.max_value,
				min_value = excluded.min_value
		`, c.Year, c.SchoolName, c.Department, c.Track, c.ScoreType, c.MaxValue, c.MinValue)
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

	rows, err := db.Query("SELECT year, school_name, department, track, score_type, max_value, min_value FROM highschool_cutoffs")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cutoffs []CutoffInfo
	for rows.Next() {
		var c CutoffInfo
		if err := rows.Scan(&c.Year, &c.SchoolName, &c.Department, &c.Track, &c.ScoreType, &c.MaxValue, &c.MinValue); err == nil {
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
			grades_json TEXT
		);
	`)
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
		INSERT INTO students (student_num, name, grades_json)
		VALUES (?, ?, ?)
	`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()

	for _, s := range students {
		_, err = stmt.Exec(s.StudentNum, s.Name, s.RawData)
		if err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
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
		
		rows, err := db.Query("SELECT student_num, name, grades_json FROM students")
		if err != nil {
			db.Close()
			continue
		}

		var students []StudentExcelData
		for rows.Next() {
			var s StudentExcelData
			s.ClassNum = i
			err := rows.Scan(&s.StudentNum, &s.Name, &s.RawData)
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
	if err != nil { return err }
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

	// 2. 뷰어 계정 (초기엔 접속 불가 상태)
	_, err = db.Exec(`
		INSERT INTO users (username, password_hash, role, class_num, must_change_password)
		VALUES (?, ?, ?, ?, ?)
	`, "viewer", "", "viewer", 0, true)
	if err != nil {
		return err
	}

	// 3. 담임 계정 (1반 ~ classCount반) (초기엔 접속 불가 상태)
	for i := 1; i <= classCount; i++ {
		username := fmt.Sprintf("teacher%d", i)
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
	if err != nil { return nil, err }
	defer db.Close()

	rows, err := db.Query("SELECT id, username, role, class_num, must_change_password FROM users ORDER BY class_num ASC, role DESC")
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
	if err != nil { return err }
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
	if err != nil { return err }
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

// VerifyUserLogin verifies login credentials
func (dm *DBManager) VerifyUserLogin(username, password string) (*User, error) {
	db, err := dm.openDB(dm.getConfigDBPath())
	if err != nil { return nil, err }
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
	if err != nil { return err }
	defer db.Close()

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil { return err }

	_, err = db.Exec("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE username = ?", string(hash), username)
	return err
}
