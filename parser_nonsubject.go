package main

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

// ParseAttendanceExcel 나이스 출결상황 엑셀/CSV 파싱
func ParseAttendanceExcel(filePath string) (map[int][]StudentExcelData, error) {
	rows, err := readRows(filePath)
	if err != nil {
		return nil, err
	}

	studentMap := make(map[int]map[string]*StudentExcelData)
	currentClassNum := -1

	nameColIdx := -1
	studentNumColIdx := -1
	unrecognizedAbsenceIdx := -1
	unrecognizedLateIdx := -1
	unrecognizedEarlyIdx := -1
	unrecognizedResultIdx := -1

	var lastName, lastStudentNum string
	skipNextRow := false

	for _, row := range rows {
		if len(row) == 0 {
			continue
		}
		
		if skipNextRow {
			skipNextRow = false
			continue
		}

		for _, cell := range row {
			val := strings.ReplaceAll(strings.TrimSpace(cell), " ", "")
			if strings.Contains(val, "학년") && strings.Contains(val, "반") {
				parts := strings.Split(val, "학년")
				if len(parts) == 2 {
					classPart := strings.TrimSpace(strings.ReplaceAll(parts[1], "반", ""))
					if c, err := strconv.Atoi(classPart); err == nil {
						currentClassNum = c
					}
				}
			}
		}

		if nameColIdx == -1 {
			for j, cell := range row {
				val := strings.ReplaceAll(strings.TrimSpace(cell), " ", "")
				if val == "성명" || val == "이름" {
					nameColIdx = j
				} else if val == "번호" || val == "학번" {
					studentNumColIdx = j
				} else if val == "결석" {
					unrecognizedAbsenceIdx = j + 1
				} else if val == "지각" {
					unrecognizedLateIdx = j + 1
				} else if val == "조퇴" {
					unrecognizedEarlyIdx = j + 1
				} else if val == "결과" {
					unrecognizedResultIdx = j + 1
				}
			}
			if nameColIdx != -1 {
				skipNextRow = true // 헤더가 2줄이므로 다음 줄 무시
				continue
			}
		}
		if nameColIdx != -1 && nameColIdx < len(row) {
			rawName := strings.TrimSpace(row[nameColIdx])
			rawNum := ""
			if studentNumColIdx != -1 && studentNumColIdx < len(row) {
				rawNum = strings.TrimSpace(row[studentNumColIdx])
			}

			if rawName == "" && rawNum == "" {
				rawName = lastName
				rawNum = lastStudentNum
			} else {
				// 번호가 숫자가 아니면(예: "번 호", "합계") 유효하지 않은 행
				if _, err := strconv.Atoi(rawNum); err != nil {
					continue
				}
				lastName = rawName
				lastStudentNum = rawNum
			}

			if rawName == "" || rawNum == "" {
				continue
			}
			
			name := rawName
			studentNum := rawNum

			studentKey := fmt.Sprintf("%s_%s", studentNum, name)
			if studentMap[currentClassNum] == nil {
				studentMap[currentClassNum] = make(map[string]*StudentExcelData)
			}

			var existingStudent *StudentExcelData
			if s, exists := studentMap[currentClassNum][studentKey]; exists {
				existingStudent = s
			} else {
				existingStudent = &StudentExcelData{
					ClassNum:   currentClassNum,
					StudentNum: studentNum,
					Name:       name,
				}
				studentMap[currentClassNum][studentKey] = existingStudent
			}

			dataMap := make(map[string]int)
			if existingStudent.AttendanceData != "" {
				json.Unmarshal([]byte(existingStudent.AttendanceData), &dataMap)
			}
			
			addVal := func(idx int, key string) {
				if idx != -1 && idx < len(row) {
					vStr := strings.TrimSpace(row[idx])
					if v, err := strconv.Atoi(vStr); err == nil {
						dataMap[key] += v
					}
				}
			}
			
			addVal(unrecognizedAbsenceIdx, "absence")
			addVal(unrecognizedLateIdx, "late")
			addVal(unrecognizedEarlyIdx, "early")
			addVal(unrecognizedResultIdx, "result")

			b, _ := json.Marshal(dataMap)
			existingStudent.AttendanceData = string(b)
		}
	}

	result := make(map[int][]StudentExcelData)
	for classNum, students := range studentMap {
		for _, s := range students {
			result[classNum] = append(result[classNum], *s)
		}
	}
	return result, nil
}

// ParseVolunteerExcel 나이스 봉사상황 엑셀/CSV 파싱
func ParseVolunteerExcel(filePath string) (map[int][]StudentExcelData, error) {
	rows, err := readRows(filePath)
	if err != nil {
		return nil, err
	}

	studentMap := make(map[int]map[string]*StudentExcelData)
	currentClassNum := -1

	nameColIdx := -1
	studentNumColIdx := -1
	totalTimeIdx := -1

	var lastName, lastStudentNum string

	for _, row := range rows {
		if len(row) == 0 {
			continue
		}

		for _, cell := range row {
			val := strings.ReplaceAll(strings.TrimSpace(cell), " ", "")
			if strings.Contains(val, "학년") && strings.Contains(val, "반") {
				parts := strings.Split(val, "학년")
				if len(parts) == 2 {
					classPart := strings.TrimSpace(strings.ReplaceAll(parts[1], "반", ""))
					if c, err := strconv.Atoi(classPart); err == nil {
						currentClassNum = c
					}
				}
			}
		}

		if nameColIdx == -1 {
			for j, cell := range row {
				val := strings.ReplaceAll(strings.TrimSpace(cell), " ", "")
				if val == "성명" || val == "이름" {
					nameColIdx = j
				} else if val == "번호" || val == "학번" {
					studentNumColIdx = j
				} else if strings.Contains(val, "시간누계(전체)") {
					totalTimeIdx = j
				}
			}
			if nameColIdx != -1 {
				continue
			}
		}

		if nameColIdx != -1 && nameColIdx < len(row) {
			rawName := strings.TrimSpace(row[nameColIdx])
			rawNum := ""
			if studentNumColIdx != -1 && studentNumColIdx < len(row) {
				rawNum = strings.TrimSpace(row[studentNumColIdx])
			}

			if rawName == "" && rawNum == "" {
				rawName = lastName
				rawNum = lastStudentNum
			} else {
				if _, err := strconv.Atoi(rawNum); err != nil {
					continue
				}
				lastName = rawName
				lastStudentNum = rawNum
			}

			if rawName == "" || rawNum == "" {
				continue
			}

			if currentClassNum == -1 {
				currentClassNum = 1
			}

			name := rawName
			studentNum := rawNum

			studentKey := fmt.Sprintf("%s_%s", studentNum, name)
			if studentMap[currentClassNum] == nil {
				studentMap[currentClassNum] = make(map[string]*StudentExcelData)
			}

			var existingStudent *StudentExcelData
			if s, exists := studentMap[currentClassNum][studentKey]; exists {
				existingStudent = s
			} else {
				existingStudent = &StudentExcelData{
					ClassNum:   currentClassNum,
					StudentNum: studentNum,
					Name:       name,
				}
				studentMap[currentClassNum][studentKey] = existingStudent
			}

			dataMap := make(map[string]int)
			if existingStudent.VolunteerData != "" {
				json.Unmarshal([]byte(existingStudent.VolunteerData), &dataMap)
			}
			
			if totalTimeIdx != -1 && totalTimeIdx < len(row) {
				vStr := strings.TrimSpace(row[totalTimeIdx])
				if v, err := strconv.Atoi(vStr); err == nil {
					if v > dataMap["total_time"] {
						dataMap["total_time"] = v
					}
				}
			}

			b, _ := json.Marshal(dataMap)
			existingStudent.VolunteerData = string(b)
		}
	}

	result := make(map[int][]StudentExcelData)
	for classNum, students := range studentMap {
		for _, s := range students {
			result[classNum] = append(result[classNum], *s)
		}
	}
	return result, nil
}
