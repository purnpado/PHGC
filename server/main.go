package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/smtp"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

var (
	giteaURL      string
	giteaToken    string
	giteaOwner    string
	giteaRepo     string
	giteaDataRepo string
	smtpUser      string
	smtpPass      string
)

func init() {
	_ = godotenv.Load()
	giteaURL = os.Getenv("GITEA_URL")
	giteaToken = os.Getenv("GITEA_TOKEN")
	giteaOwner = os.Getenv("GITEA_OWNER")
	giteaRepo = os.Getenv("GITEA_REPO")
	giteaDataRepo = os.Getenv("GITEA_DATA_REPO")
	smtpUser = os.Getenv("SMTP_USER")
	smtpPass = os.Getenv("SMTP_PASS")

	if giteaURL == "" || giteaToken == "" || giteaOwner == "" {
		log.Println("WARNING: Gitea ENV variables are missing!")
	}
}

// CORSMiddleware allows cross-origin requests from the client
func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

func main() {
	r := gin.Default()
	r.Use(CORSMiddleware())

	r.GET("/ping", func(c *gin.Context) {
		c.JSON(200, gin.H{"message": "pong"})
	})

	api := r.Group("/api")
	{
		api.POST("/cutoff", handleCutoff)
		api.GET("/cutoff", handleGetCutoffs)
		api.DELETE("/cutoff", handleDeleteCutoffs)
		api.POST("/feedback", handleFeedback)
		api.GET("/feedback/:id", handleGetFeedback)
		api.GET("/sync/*filepath", handleSyncFile)
		api.GET("/download/:filename", handleDownloadLatest)
		api.POST("/webhook/gitea", handleGiteaWebhook)
	}
	admin := api.Group("/admin", requireAdmin())
	{
		admin.GET("/dashboard", handleAdminDashboard)
		admin.GET("/cutoff-submissions", handleAdminCutoffSubmissions)
		admin.GET("/merged-cutoffs", handleAdminGetMergedCutoffs)
		admin.PUT("/merged-cutoffs", handleAdminSaveMergedCutoffs)
		admin.GET("/notices", handleAdminGetNotices)
		admin.PUT("/notices", handleAdminSaveNotices)
		admin.GET("/feedback", handleAdminFeedbacks)
		admin.POST("/feedback/:id/reply", handleAdminReplyFeedback)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Server starting on port %s", port)
	r.Run(":" + port)
}

// ----------------------------------------------------
// Handlers
// ----------------------------------------------------

func getDataRepo() string {
	if giteaDataRepo != "" {
		return giteaDataRepo
	}
	return giteaRepo
}

// handleCutoff 각 학교에서 업로드한 고교 커트라인 데이터를 Gitea에 저장
func handleCutoff(c *gin.Context) {
	var payload CutoffSubmission
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "허용되지 않은 필드가 있거나 JSON 형식이 올바르지 않습니다."})
		return
	}
	items, err := validatePublicCutoffs(payload.Items, payload.AdmissionYear)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	middleSchool := items[0].SourceMiddleSchoolName
	for _, item := range items[1:] {
		if item.SourceMiddleSchoolName != middleSchool {
			c.JSON(http.StatusBadRequest, gin.H{"error": "한 번의 제출에는 하나의 중학교 자료만 포함할 수 있습니다."})
			return
		}
	}

	jsonData, _ := json.MarshalIndent(items, "", "  ")
	b64Content := base64.StdEncoding.EncodeToString(jsonData)

	fileName := cutoffSubmissionPath(payload.AdmissionYear, middleSchool)
	targetRepo := getDataRepo()

	// 1. 기존 파일이 있는지 확인하여 sha 확보 (덮어쓰기용)
	url := fmt.Sprintf("%s/api/v1/repos/%s/%s/contents/%s", giteaURL, giteaOwner, targetRepo, fileName)
	client := &http.Client{Timeout: 10 * time.Second}

	var existingSHA string
	chkReq, _ := http.NewRequest("GET", url, nil)
	chkReq.Header.Set("Authorization", "token "+giteaToken)
	if chkResp, chkErr := client.Do(chkReq); chkErr == nil && chkResp.StatusCode == 200 {
		var fileInfo struct {
			SHA string `json:"sha"`
		}
		_ = json.NewDecoder(chkResp.Body).Decode(&fileInfo)
		existingSHA = fileInfo.SHA
		chkResp.Body.Close()
	}

	// 2. 파일 생성 또는 수정 (PUT)
	reqBody := map[string]interface{}{
		"content": b64Content,
		"message": fmt.Sprintf("Update public cutoff data (%d)", payload.AdmissionYear),
	}
	if existingSHA != "" {
		reqBody["sha"] = existingSHA
	}
	reqJSON, _ := json.Marshal(reqBody)

	method := "POST"
	if existingSHA != "" {
		method = "PUT"
	}

	req, _ := http.NewRequest(method, url, bytes.NewBuffer(reqJSON))
	req.Header.Set("Authorization", "token "+giteaToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil || resp.StatusCode >= 400 {
		var respStr string
		if resp != nil {
			b, _ := io.ReadAll(resp.Body)
			respStr = string(b)
		}
		log.Printf("Gitea API error: %v, %s", err, respStr)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to upload to Gitea: %s", respStr)})
		return
	}
	defer resp.Body.Close()

	c.JSON(http.StatusOK, gin.H{"message": "공개 커트라인 자료가 등록되었습니다.", "count": len(items)})
}

// handleGetCutoffs 각 학교들이 보낸 커트라인 데이터를 취합하여 일괄 반환
func handleGetCutoffs(c *gin.Context) {
	yearStr := c.DefaultQuery("year", "2026")
	var published []PublicCutoff
	if exists, err := readRepoJSON(mergedCutoffsPath, &published); err == nil && exists {
		filtered := make([]PublicCutoff, 0, len(published))
		for _, item := range published {
			if fmt.Sprint(item.AdmissionYear) == yearStr {
				filtered = append(filtered, item)
			}
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": filtered, "source": "approved"})
		return
	}
	targetRepo := getDataRepo()

	// Gitea API로 server-data/cutoffs/ 디렉터리 내의 파일 목록 조회
	dirURL := fmt.Sprintf("%s/api/v1/repos/%s/%s/contents/server-data/cutoffs", giteaURL, giteaOwner, targetRepo)
	client := &http.Client{Timeout: 10 * time.Second}

	req, _ := http.NewRequest("GET", dirURL, nil)
	req.Header.Set("Authorization", "token "+giteaToken)

	resp, err := client.Do(req)
	if err != nil || resp.StatusCode >= 400 {
		// 폴더가 없거나 빈 경우 기본 빈 배열 반환
		c.JSON(http.StatusOK, gin.H{"success": true, "data": []interface{}{}, "source": "submissions"})
		return
	}
	defer resp.Body.Close()

	var fileList []struct {
		Name        string `json:"name"`
		DownloadURL string `json:"download_url"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&fileList)

	// 각 학교별 커트라인 파일을 읽어 병합 (동일 학교/전형/학과인 경우 최신값 유지)
	cutoffMap := make(map[string]PublicCutoff)

	prefix := yearStr + "_"
	for _, f := range fileList {
		if !strings.HasPrefix(f.Name, prefix) || !strings.HasSuffix(f.Name, ".json") {
			continue
		}

		rawURL := fmt.Sprintf("%s/api/v1/repos/%s/%s/raw/server-data/cutoffs/%s", giteaURL, giteaOwner, targetRepo, f.Name)
		fReq, _ := http.NewRequest("GET", rawURL, nil)
		fReq.Header.Set("Authorization", "token "+giteaToken)

		if fResp, fErr := client.Do(fReq); fErr == nil && fResp.StatusCode == 200 {
			var schoolCutoffs []PublicCutoff
			if err := json.NewDecoder(fResp.Body).Decode(&schoolCutoffs); err == nil {
				for _, item := range schoolCutoffs {
					key := item.SourceMiddleSchoolName + "\x00" + item.TargetHighSchoolName + "\x00" + item.Department
					cutoffMap[key] = item
				}
			}
			fResp.Body.Close()
		}
	}

	// 맵을 슬라이스로 변환
	var mergedList []PublicCutoff
	for _, item := range cutoffMap {
		mergedList = append(mergedList, item)
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": mergedList, "source": "submissions"})
}

// handleDeleteCutoffs 학교별 커트라인 회수(삭제)
func handleDeleteCutoffs(c *gin.Context) {
	yearStr := c.DefaultQuery("year", "2026")
	schoolName := c.Query("school")
	targetRepo := getDataRepo()
	client := &http.Client{Timeout: 10 * time.Second}

	if schoolName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "학교명(school) 파라미터가 필요합니다."})
		return
	}

	// 특정 학교 데이터 단독 회수
	year, err := strconv.Atoi(yearStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "입학년도가 올바르지 않습니다."})
		return
	}
	fileName := cutoffSubmissionPath(year, schoolName)
	url := fmt.Sprintf("%s/api/v1/repos/%s/%s/contents/%s", giteaURL, giteaOwner, targetRepo, fileName)

	chkReq, _ := http.NewRequest("GET", url, nil)
	chkReq.Header.Set("Authorization", "token "+giteaToken)
	chkResp, err := client.Do(chkReq)
	if err != nil || chkResp.StatusCode != 200 {
		c.JSON(http.StatusNotFound, gin.H{"error": "서버에 등록된 해당 학교의 커트라인 데이터를 찾을 수 없습니다."})
		return
	}

	var fileInfo struct {
		SHA string `json:"sha"`
	}
	_ = json.NewDecoder(chkResp.Body).Decode(&fileInfo)
	chkResp.Body.Close()

	delBody := map[string]interface{}{
		"sha":     fileInfo.SHA,
		"message": fmt.Sprintf("Rollback/Delete cutoff data for %s (%s)", schoolName, yearStr),
	}
	delJSON, _ := json.Marshal(delBody)
	delReq, _ := http.NewRequest("DELETE", url, bytes.NewBuffer(delJSON))
	delReq.Header.Set("Authorization", "token "+giteaToken)
	delReq.Header.Set("Content-Type", "application/json")

	delResp, delErr := client.Do(delReq)
	if delErr != nil || delResp.StatusCode >= 400 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gitea 파일 삭제 실패"})
		return
	}
	defer delResp.Body.Close()

	c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("'%s'의 %s학년도 서버 커트라인 데이터가 안전하게 회수(삭제)되었습니다.", schoolName, yearStr)})
	return
}

func handleFeedback(c *gin.Context) {
	var payload struct {
		SchoolName     string `json:"schoolName"`
		Email          string `json:"email"`
		Title          string `json:"title"`
		Content        string `json:"content"`
		AttachmentName string `json:"attachmentName"`
		AttachmentB64  string `json:"attachmentB64"`
	}

	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON"})
		return
	}

	issueTitle := fmt.Sprintf("[%s] %s", payload.SchoolName, payload.Title)
	issueBody := fmt.Sprintf("**작성자 이메일:** %s\n\n---\n%s", payload.Email, payload.Content)

	url := fmt.Sprintf("%s/api/v1/repos/%s/%s/issues", giteaURL, giteaOwner, giteaRepo)

	reqBody := map[string]interface{}{
		"title": issueTitle,
		"body":  issueBody,
	}
	reqJSON, _ := json.Marshal(reqBody)

	req, _ := http.NewRequest("POST", url, bytes.NewBuffer(reqJSON))
	req.Header.Set("Authorization", "token "+giteaToken)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to create issue: %s", string(b))})
		return
	}
	defer resp.Body.Close()

	var result struct {
		Number int `json:"number"`
	}
	json.NewDecoder(resp.Body).Decode(&result)

	// 이미지 첨부
	if payload.AttachmentB64 != "" {
		err = uploadIssueAttachment(result.Number, payload.AttachmentName, payload.AttachmentB64)
		if err != nil {
			log.Printf("Failed to upload attachment: %v\n", err)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message":  "Feedback submitted",
		"issue_id": result.Number,
	})
}

func handleGetFeedback(c *gin.Context) {
	issueID := c.Param("id")

	// Get Issue Details
	url := fmt.Sprintf("%s/api/v1/repos/%s/%s/issues/%s", giteaURL, giteaOwner, giteaRepo, issueID)
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("Authorization", "token "+giteaToken)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != 200 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Issue not found"})
		return
	}
	defer resp.Body.Close()

	var issue struct {
		State    string `json:"state"`
		Comments int    `json:"comments"`
	}
	json.NewDecoder(resp.Body).Decode(&issue)

	// Get Comments
	var comments []map[string]interface{}
	if issue.Comments > 0 {
		commentsUrl := fmt.Sprintf("%s/api/v1/repos/%s/%s/issues/%s/comments", giteaURL, giteaOwner, giteaRepo, issueID)
		cReq, _ := http.NewRequest("GET", commentsUrl, nil)
		cReq.Header.Set("Authorization", "token "+giteaToken)
		cResp, cErr := client.Do(cReq)
		if cErr == nil && cResp.StatusCode == 200 {
			defer cResp.Body.Close()
			json.NewDecoder(cResp.Body).Decode(&comments)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"state":    issue.State,
		"comments": comments,
	})
}

func handleGiteaWebhook(c *gin.Context) {
	var payload map[string]interface{}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON"})
		return
	}

	// We only care about issue_comment events where action is "created"
	action, _ := payload["action"].(string)
	if action != "created" {
		c.JSON(http.StatusOK, gin.H{"message": "Ignored"})
		return
	}

	commentObj, ok := payload["comment"].(map[string]interface{})
	if !ok {
		c.JSON(http.StatusOK, gin.H{"message": "No comment payload"})
		return
	}

	issueObj, ok := payload["issue"].(map[string]interface{})
	if !ok {
		c.JSON(http.StatusOK, gin.H{"message": "No issue payload"})
		return
	}

	issueBody, _ := issueObj["body"].(string)
	commentBody, _ := commentObj["body"].(string)
	issueTitle, _ := issueObj["title"].(string)

	// Parse email from issue body (Format: **작성자 이메일:** example@gmail.com)
	re := regexp.MustCompile(`(?i)\*\*작성자 이메일:\*\*\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})`)
	matches := re.FindStringSubmatch(issueBody)

	if len(matches) < 2 {
		log.Printf("No email found in issue body")
		c.JSON(http.StatusOK, gin.H{"message": "No email found in issue, ignored"})
		return
	}

	targetEmail := matches[1]

	// Send Email
	if smtpUser != "" && smtpPass != "" {
		err := sendEmail(targetEmail, issueTitle, commentBody)
		if err != nil {
			log.Printf("Failed to send email: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send email"})
			return
		}
		log.Printf("Email successfully sent to %s", targetEmail)
	} else {
		log.Printf("SMTP credentials not configured. Would have sent email to %s", targetEmail)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Webhook processed"})
}

func sendEmail(to, issueTitle, commentBody string) error {
	from := smtpUser
	pass := smtpPass

	msg := "From: " + from + "\n" +
		"To: " + to + "\n" +
		"Subject: [PHGC 피드백 답변] " + issueTitle + "\n\n" +
		"관리자님의 답변이 등록되었습니다:\n\n" +
		commentBody + "\n\n" +
		"---\nPHGC 브릿지 서버 자동 발송"

	err := smtp.SendMail("smtp.gmail.com:587",
		smtp.PlainAuth("", from, pass, "smtp.gmail.com"),
		from, []string{to}, []byte(msg))

	return err
}

// handleDownloadLatest Gitea 최신 릴리즈에서 Asset(exe)을 찾아 프록시 다운로드
func handleDownloadLatest(c *gin.Context) {
	filename := c.Param("filename") // e.g. "PHGC.exe"

	// 1. Gitea API로 최신 릴리즈 정보 조회
	relURL := fmt.Sprintf("%s/api/v1/repos/%s/%s/releases?limit=1", giteaURL, giteaOwner, giteaRepo)
	req, _ := http.NewRequest("GET", relURL, nil)
	req.Header.Set("Authorization", "token "+giteaToken)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != 200 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gitea 릴리즈 조회 실패"})
		return
	}
	defer resp.Body.Close()

	var releases []struct {
		TagName string `json:"tag_name"`
		Assets  []struct {
			Name               string `json:"name"`
			BrowserDownloadURL string `json:"browser_download_url"`
		} `json:"assets"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&releases)

	if len(releases) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "등록된 릴리즈가 없습니다"})
		return
	}

	// 2. 최신 릴리즈의 Asset 중 요청된 파일명 찾기
	var assetURL string
	for _, asset := range releases[0].Assets {
		if strings.EqualFold(asset.Name, filename) {
			assetURL = asset.BrowserDownloadURL
			break
		}
	}

	if assetURL == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("릴리즈 '%s'에 '%s' 파일이 첨부되어 있지 않습니다", releases[0].TagName, filename)})
		return
	}

	// 3. Asset 파일을 Gitea에서 가져와 클라이언트에게 프록시 전달
	assetReq, _ := http.NewRequest("GET", assetURL, nil)
	assetReq.Header.Set("Authorization", "token "+giteaToken)

	dlClient := &http.Client{Timeout: 5 * time.Minute}
	assetResp, err := dlClient.Do(assetReq)
	if err != nil || assetResp.StatusCode != 200 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Asset 다운로드 실패"})
		return
	}
	defer assetResp.Body.Close()

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))
	c.Header("Content-Type", "application/octet-stream")
	io.Copy(c.Writer, assetResp.Body)
}

func handleSyncFile(c *gin.Context) {
	filepath := c.Param("filepath")
	// Remove leading slash
	if len(filepath) > 0 && filepath[0] == '/' {
		filepath = filepath[1:]
	}
	url := fmt.Sprintf("%s/api/v1/repos/%s/%s/raw/%s", giteaURL, giteaOwner, giteaRepo, filepath)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	req.Header.Set("Authorization", "token "+giteaToken)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		c.JSON(resp.StatusCode, gin.H{"error": "Failed to fetch file from Gitea"})
		return
	}

	body, _ := io.ReadAll(resp.Body)
	c.Data(http.StatusOK, "application/json", body)
}

func uploadIssueAttachment(issueID int, filename, b64Data string) error {
	decoded, err := base64.StdEncoding.DecodeString(b64Data)
	if err != nil {
		return err
	}

	var b bytes.Buffer
	w := multipart.NewWriter(&b)

	fw, err := w.CreateFormFile("attachment", filename)
	if err != nil {
		return err
	}
	fw.Write(decoded)
	w.Close()

	url := fmt.Sprintf("%s/api/v1/repos/%s/%s/issues/%d/assets", giteaURL, giteaOwner, giteaRepo, issueID)
	req, err := http.NewRequest("POST", url, &b)
	if err != nil {
		return err
	}

	req.Header.Set("Authorization", "token "+giteaToken)
	req.Header.Set("Content-Type", w.FormDataContentType())

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Upload failed: %s", string(body))
	}
	return nil
}
