package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/smtp"
	"os"
	"regexp"
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
		api.POST("/feedback", handleFeedback)
		api.GET("/feedback/:id", handleGetFeedback)
		api.POST("/webhook/gitea", handleGiteaWebhook)
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

func handleCutoff(c *gin.Context) {
	var payload struct {
		SchoolName string      `json:"schoolName"`
		Year       int         `json:"year"`
		Data       interface{} `json:"data"` // Raw array of cutoffs
	}

	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON"})
		return
	}

	// Make JSON string and base64 encode for Gitea Content API
	jsonData, _ := json.MarshalIndent(payload.Data, "", "  ")
	b64Content := base64.StdEncoding.EncodeToString(jsonData)

	fileName := fmt.Sprintf("data/%d_%s_%d.json", payload.Year, payload.SchoolName, time.Now().Unix())
	
	// Gitea Create File API
	url := fmt.Sprintf("%s/api/v1/repos/%s/%s/contents/%s", giteaURL, giteaOwner, giteaDataRepo, fileName)
	
	reqBody := map[string]interface{}{
		"content": b64Content,
		"message": fmt.Sprintf("Add cutoff data for %s (%d)", payload.SchoolName, payload.Year),
	}
	reqJSON, _ := json.Marshal(reqBody)

	req, _ := http.NewRequest("POST", url, bytes.NewBuffer(reqJSON))
	req.Header.Set("Authorization", "token "+giteaToken)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode >= 400 {
		var respStr string
		if resp != nil {
			b, _ := io.ReadAll(resp.Body)
			respStr = string(b)
		}
		log.Printf("Gitea API error: %v, %s", err, respStr)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload to Gitea"})
		return
	}
	defer resp.Body.Close()

	c.JSON(http.StatusOK, gin.H{"message": "Data successfully sent to central server"})
}

func handleFeedback(c *gin.Context) {
	var payload struct {
		SchoolName string `json:"schoolName"`
		Email      string `json:"email"`
		Title      string `json:"title"`
		Content    string `json:"content"`
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create issue"})
		return
	}
	defer resp.Body.Close()

	var result struct {
		Number int `json:"number"`
	}
	json.NewDecoder(resp.Body).Decode(&result)

	c.JSON(http.StatusOK, gin.H{
		"message": "Feedback submitted",
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
		State string `json:"state"`
		Comments int `json:"comments"`
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
		"state": issue.State,
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
