package main

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/xuri/excelize/v2"
	"golang.org/x/text/encoding/korean"
	"golang.org/x/text/transform"
)

// StudentExcelData 엑셀에서 파싱된 학생 한 명의 데이터
type StudentExcelData struct {
	ClassNum   int
	StudentNum string
	Name       string
	RawData    string // 나머지 모든 컬럼 데이터를 JSON으로 저장
}

// ParseExcel 나이스 엑셀 또는 CSV 파일을 읽어 학급별로 분류하여 반환
func ParseExcel(filePath string) (map[int][]StudentExcelData, error) {
	rows, err := readRows(filePath)
	if err != nil {
		return nil, fmt.Errorf("데이터 읽기 실패: %w", err)
	}

	if len(rows) < 2 {
		return nil, fmt.Errorf("데이터가 부족합니다 (최소 헤더와 데이터 1줄 필요)")
	}

	result := make(map[int][]StudentExcelData)
	
	// classNum -> studentKey -> StudentExcelData
	// studentKey = "번호_이름"
	studentMap := make(map[int]map[string]*StudentExcelData)

	currentClassNum := -1
	var headers []string
	nameColIdx := -1
	studentNumColIdx := -1
	
	var lastName string
	var lastStudentNum string

	for _, row := range rows {
		if len(row) == 0 {
			continue
		}

		// 1. 반 정보 탐색 ("3학년 1반" 형태)
		for _, cell := range row {
			val := strings.ReplaceAll(strings.TrimSpace(cell), " ", "")
			if strings.Contains(val, "학년") && strings.Contains(val, "반") {
				parts := strings.Split(val, "학년")
				if len(parts) == 2 {
					classStr := strings.ReplaceAll(parts[1], "반", "")
					if num, err := strconv.Atoi(classStr); err == nil {
						currentClassNum = num
					}
				}
			}
		}

		// 2. 헤더 행 탐색
		hasClassHeader := false
		hasNameHeader := false
		hasNumHeader := false
		
		tempNameIdx := -1
		tempNumIdx := -1

		for j, cell := range row {
			val := strings.ReplaceAll(strings.TrimSpace(cell), " ", "")
			if val == "성명" || val == "이름" {
				hasNameHeader = true
				tempNameIdx = j
			} else if val == "번호" || val == "학번" {
				hasNumHeader = true
				tempNumIdx = j
			} else if val == "반" || val == "학반" {
				hasClassHeader = true
			}
		}

		// 헤더를 찾으면 인덱스 저장 (한 번만 세팅하거나, 반이 바뀔 때마다 다시 세팅)
		if hasNameHeader && (hasNumHeader || hasClassHeader) {
			headers = row
			nameColIdx = tempNameIdx
			studentNumColIdx = tempNumIdx
			continue // 헤더 행 자체는 데이터가 아니므로 건너뜀
		}

		// 3. 데이터 행 파싱
		// 헤더를 이미 찾았고, 이름 컬럼이 유효한 범위 내에 있을 때만 처리
		if headers != nil && nameColIdx != -1 && nameColIdx < len(row) {
			name := strings.TrimSpace(row[nameColIdx])
			if name == "" {
				name = lastName // 병합된 셀(빈 칸)일 경우 이전 이름 사용
			} else {
				lastName = name // 새로운 이름이면 업데이트
			}

			if name == "" {
				continue // 그래도 이름이 없으면 완전히 빈 줄이거나 유효하지 않은 데이터이므로 건너뜐다
			}

			// 반 정보가 없으면 기본값 1반으로 처리 (오류 방지)
			if currentClassNum == -1 {
				currentClassNum = 1
			}

			studentNum := ""
			if studentNumColIdx != -1 && studentNumColIdx < len(row) {
				studentNum = strings.TrimSpace(row[studentNumColIdx])
			}
			if studentNum == "" {
				studentNum = lastStudentNum
			} else {
				// 번호가 숫자가 아니면 (예: "3학년 8반", "< 교양교과 >" 등 엑셀 하단 요약 정보) 무시
				if _, err := strconv.Atoi(studentNum); err != nil {
					continue
				}
				lastStudentNum = studentNum
			}

			// 학생 식별 키
			studentKey := fmt.Sprintf("%s_%s", studentNum, name)

			if studentMap[currentClassNum] == nil {
				studentMap[currentClassNum] = make(map[string]*StudentExcelData)
			}

			// 현재 행의 과목 데이터 추출 (이름, 번호 외의 컬럼)
			subjectData := make(map[string]string)
			for j, cell := range row {
				if j != nameColIdx && j != studentNumColIdx {
					headerName := ""
					if j < len(headers) {
						headerName = strings.TrimSpace(headers[j])
					}
					if headerName == "" {
						headerName = fmt.Sprintf("Column%d", j)
					}
					subjectData[headerName] = strings.TrimSpace(cell)
				}
			}

			// 이미 있는 학생이면 과목 데이터 리스트에 추가, 아니면 새로 생성
			if existingStudent, exists := studentMap[currentClassNum][studentKey]; exists {
				// 기존 RawData(JSON 배열)를 파싱해서 합침
				var records []map[string]string
				json.Unmarshal([]byte(existingStudent.RawData), &records)
				records = append(records, subjectData)
				newRawJSON, _ := json.Marshal(records)
				existingStudent.RawData = string(newRawJSON)
			} else {
				// 첫 과목 데이터
				records := []map[string]string{subjectData}
				rawJSON, _ := json.Marshal(records)
				
				studentMap[currentClassNum][studentKey] = &StudentExcelData{
					ClassNum:   currentClassNum,
					StudentNum: studentNum,
					Name:       name,
					RawData:    string(rawJSON),
				}
			}
		}
	}

	// 맵 구조를 배열로 변환
	for classNum, studentsMap := range studentMap {
		var students []StudentExcelData
		for _, student := range studentsMap {
			students = append(students, *student)
		}
		result[classNum] = students
	}

	if len(result) == 0 {
		return nil, fmt.Errorf("유효한 학생 데이터를 찾지 못했습니다. (나이스 교과학습발달상황 양식인지 확인해주세요)")
	}

	return result, nil
}

// readRows 파일 확장자에 따라 엑셀 또는 CSV 파일을 읽어 2차원 문자열 배열로 반환
func readRows(filePath string) ([][]string, error) {
	ext := strings.ToLower(filepath.Ext(filePath))
	
	if ext == ".csv" {
		data, err := os.ReadFile(filePath)
		if err != nil {
			return nil, fmt.Errorf("CSV 파일 읽기 실패: %w", err)
		}
		
		var reader io.Reader
		// 간단한 인코딩 판별: UTF-8이 아니면 CP949(EUC-KR)로 간주
		if utf8.Valid(data) {
			// BOM 제거 (UTF-8)
			if bytes.HasPrefix(data, []byte("\xef\xbb\xbf")) {
				data = data[3:]
			}
			reader = bytes.NewReader(data)
		} else {
			reader = transform.NewReader(bytes.NewReader(data), korean.EUCKR.NewDecoder())
		}
		
		csvReader := csv.NewReader(reader)
		csvReader.FieldsPerRecord = -1 // 필드 개수 가변 허용
		csvReader.LazyQuotes = true
		
		rows, err := csvReader.ReadAll()
		if err != nil {
			return nil, fmt.Errorf("CSV 파싱 실패: %w", err)
		}
		return rows, nil
	}
	
	// 기본은 엑셀(.xlsx, .xls) 처리
	f, err := excelize.OpenFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("엑셀 파일 열기 실패: %w", err)
	}
	defer f.Close()

	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return nil, fmt.Errorf("엑셀 파일에 시트가 없습니다")
	}
	
	return f.GetRows(sheets[0])
}
