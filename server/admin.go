package main

import (
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const mergedCutoffsPath = "server-data/merged_cutoffs.json"
const noticesPath = "server-data/notice.json"

func requireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		username, password, ok := c.Request.BasicAuth()
		expectedUser := os.Getenv("PHGC_ADMIN_USERNAME")
		expectedPassword := os.Getenv("PHGC_ADMIN_PASSWORD")
		if expectedUser == "" {
			expectedUser = "admin"
		}
		if !ok || expectedPassword == "" || subtle.ConstantTimeCompare([]byte(username), []byte(expectedUser)) != 1 || subtle.ConstantTimeCompare([]byte(password), []byte(expectedPassword)) != 1 {
			c.Header("WWW-Authenticate", `Basic realm="PHGC Admin"`)
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "운영자 인증이 필요합니다."})
			return
		}
		c.Next()
	}
}

func repoContentURL(path string) string {
	return fmt.Sprintf("%s/api/v1/repos/%s/%s/contents/%s", giteaURL, giteaOwner, getDataRepo(), path)
}

func readRepoJSON(path string, target interface{}) (bool, error) {
	req, _ := http.NewRequest(http.MethodGet, repoContentURL(path), nil)
	req.Header.Set("Authorization", "token "+giteaToken)
	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return false, nil
	}
	if resp.StatusCode >= 400 {
		return false, fmt.Errorf("Gitea 조회 실패: HTTP %d", resp.StatusCode)
	}
	var file struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&file); err != nil {
		return false, err
	}
	data, err := base64.StdEncoding.DecodeString(strings.ReplaceAll(file.Content, "\n", ""))
	if err != nil {
		return false, err
	}
	return true, json.Unmarshal(data, target)
}

func writeRepoJSON(path, message string, value interface{}) error {
	url := repoContentURL(path)
	client := &http.Client{Timeout: 15 * time.Second}
	sha := ""
	getReq, _ := http.NewRequest(http.MethodGet, url, nil)
	getReq.Header.Set("Authorization", "token "+giteaToken)
	if getResp, err := client.Do(getReq); err == nil {
		if getResp.StatusCode == http.StatusOK {
			var file struct {
				SHA string `json:"sha"`
			}
			_ = json.NewDecoder(getResp.Body).Decode(&file)
			sha = file.SHA
		}
		getResp.Body.Close()
	}
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	body := map[string]string{"content": base64.StdEncoding.EncodeToString(data), "message": message}
	if sha != "" {
		body["sha"] = sha
	}
	payload, _ := json.Marshal(body)
	method := http.MethodPost
	if sha != "" {
		method = http.MethodPut
	}
	req, _ := http.NewRequest(method, url, strings.NewReader(string(payload)))
	req.Header.Set("Authorization", "token "+giteaToken)
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		data, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Gitea 저장 실패: %s", string(data))
	}
	return nil
}

func listCutoffFiles(year string) ([]string, error) {
	url := fmt.Sprintf("%s/api/v1/repos/%s/%s/contents/server-data/cutoffs", giteaURL, giteaOwner, getDataRepo())
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	req.Header.Set("Authorization", "token "+giteaToken)
	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return []string{}, nil
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("제출 목록 조회 실패: HTTP %d", resp.StatusCode)
	}
	var files []struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&files); err != nil {
		return nil, err
	}
	prefix := year + "_"
	result := make([]string, 0)
	for _, file := range files {
		if strings.HasPrefix(file.Name, prefix) && strings.HasSuffix(file.Name, ".json") {
			result = append(result, file.Name)
		}
	}
	sort.Strings(result)
	return result, nil
}

func handleAdminDashboard(c *gin.Context) {
	year := c.DefaultQuery("year", fmt.Sprintf("%d", time.Now().Year()))
	files, err := listCutoffFiles(year)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	var notices []map[string]interface{}
	_, _ = readRepoJSON(noticesPath, &notices)
	c.JSON(200, gin.H{"year": year, "submissionCount": len(files), "submissions": files, "noticeCount": len(notices)})
}

func handleAdminCutoffSubmissions(c *gin.Context) {
	year := c.DefaultQuery("year", fmt.Sprintf("%d", time.Now().Year()))
	files, err := listCutoffFiles(year)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"year": year, "files": files})
}

func handleAdminGetMergedCutoffs(c *gin.Context) {
	var items []PublicCutoff
	exists, err := readRepoJSON(mergedCutoffsPath, &items)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	if !exists {
		items = []PublicCutoff{}
	}
	c.JSON(200, gin.H{"items": items, "published": exists})
}

func handleAdminSaveMergedCutoffs(c *gin.Context) {
	var payload struct {
		Items []PublicCutoff `json:"items"`
	}
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		c.JSON(400, gin.H{"error": "잘못된 병합 자료입니다."})
		return
	}
	if len(payload.Items) == 0 {
		if err := writeRepoJSON(mergedCutoffsPath, "admin: clear merged cutoffs", []PublicCutoff{}); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"message": "병합 커트라인이 비워졌습니다.", "count": 0})
		return
	}
	year := payload.Items[0].AdmissionYear
	items, err := validatePublicCutoffs(payload.Items, year)
	if err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if err := writeRepoJSON(mergedCutoffsPath, "admin: publish merged cutoffs", items); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "병합 커트라인이 배포되었습니다.", "count": len(items)})
}

func handleAdminGetNotices(c *gin.Context) {
	var notices []map[string]interface{}
	exists, err := readRepoJSON(noticesPath, &notices)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	if !exists {
		notices = []map[string]interface{}{}
	}
	c.JSON(200, gin.H{"items": notices})
}

func handleAdminSaveNotices(c *gin.Context) {
	var payload struct {
		Items []map[string]interface{} `json:"items"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(400, gin.H{"error": "잘못된 공지 자료입니다."})
		return
	}
	if err := writeRepoJSON(noticesPath, "admin: publish notices", payload.Items); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "공지가 배포되었습니다."})
}

func handleAdminFeedbacks(c *gin.Context) {
	url := fmt.Sprintf("%s/api/v1/repos/%s/%s/issues?state=all", giteaURL, giteaOwner, giteaRepo)
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	req.Header.Set("Authorization", "token "+giteaToken)
	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		c.JSON(500, gin.H{"error": "피드백 목록 조회 실패"})
		return
	}
	var issues []map[string]interface{}
	_ = json.NewDecoder(resp.Body).Decode(&issues)
	c.JSON(200, gin.H{"items": issues})
}

func handleAdminReplyFeedback(c *gin.Context) {
	var payload struct {
		Body  string `json:"body"`
		Close bool   `json:"close"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil || strings.TrimSpace(payload.Body) == "" {
		c.JSON(400, gin.H{"error": "답변을 입력하세요."})
		return
	}
	id := c.Param("id")
	url := fmt.Sprintf("%s/api/v1/repos/%s/%s/issues/%s/comments", giteaURL, giteaOwner, giteaRepo, id)
	data, _ := json.Marshal(gin.H{"body": payload.Body})
	req, _ := http.NewRequest(http.MethodPost, url, strings.NewReader(string(data)))
	req.Header.Set("Authorization", "token "+giteaToken)
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil || resp.StatusCode >= 400 {
		c.JSON(500, gin.H{"error": "답변 저장 실패"})
		return
	}
	resp.Body.Close()
	if payload.Close {
		closeURL := fmt.Sprintf("%s/api/v1/repos/%s/%s/issues/%s", giteaURL, giteaOwner, giteaRepo, id)
		closeData, _ := json.Marshal(gin.H{"state": "closed"})
		closeReq, _ := http.NewRequest(http.MethodPatch, closeURL, strings.NewReader(string(closeData)))
		closeReq.Header.Set("Authorization", "token "+giteaToken)
		closeReq.Header.Set("Content-Type", "application/json")
		closeResp, closeErr := (&http.Client{Timeout: 15 * time.Second}).Do(closeReq)
		if closeErr == nil {
			closeResp.Body.Close()
		}
	}
	c.JSON(200, gin.H{"message": "답변이 등록되었습니다."})
}
