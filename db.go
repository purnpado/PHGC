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
}

// SetupRequest 초기 설정 요청
type SetupRequest struct {
	SchoolName    string `json:"schoolName"`
	ClassCount    int    `json:"classCount"`
	AdminPassword string `json:"adminPassword"`
	IsSmallSchool bool   `json:"isSmallSchool"`
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
			grade       INTEGER DEFAULT 3,
			created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		return fmt.Errorf("config 테이블 생성 실패: %w", err)
	}
	return nil
}

// SaveSchoolConfig 학교 설정 저장 (비밀번호 포함)
func (dm *DBManager) SaveSchoolConfig(schoolName string, classCount int, adminPassword string, isSmallSchool bool) error {
	db, err := dm.openDB(dm.getConfigDBPath())
	if err != nil {
		return err
	}
	defer db.Close()

	// 기존 설정이 있으면 업데이트, 없으면 삽입
	_, err = db.Exec(`
		INSERT INTO school_config (id, school_name, class_count, admin_password, is_small_school, updated_at)
		VALUES (1, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(id) DO UPDATE SET
			school_name    = excluded.school_name,
			class_count    = excluded.class_count,
			admin_password = excluded.admin_password,
			is_small_school = excluded.is_small_school,
			updated_at     = CURRENT_TIMESTAMP
	`, schoolName, classCount, adminPassword, isSmallSchool)
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
	err = db.QueryRow("SELECT school_name, class_count, is_small_school FROM school_config WHERE id = 1").
		Scan(&config.SchoolName, &config.ClassCount, &config.IsSmallSchool)
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


