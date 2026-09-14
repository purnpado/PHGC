package main

import (
	"embed"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

// cleanupLegacyWebViewData AppData\Roaming 내의 과거 버전(PHGC_v*.exe 등) 임시 캐시 폴더 자동 청소
func cleanupLegacyWebViewData() {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		return
	}
	entries, err := os.ReadDir(appData)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		// PHGC 관련 구버전 임시 캐시 디렉토리 패턴 감지 및 자동 삭제
		// (예: PHGC_v1.2.2.exe, PHGC-Admin.exe, PHGC-dev.exe 등 과거 버전)
		if strings.HasPrefix(strings.ToLower(name), "phgc") && name != "PHGC_WebviewData" {
			target := filepath.Join(appData, name)
			_ = os.RemoveAll(target)
		}
	}
}

func main() {
	// 1. 과거 버전 실행 잔여 임시 캐시 폴더 자동 청소
	cleanupLegacyWebViewData()

	// Create an instance of the app structure
	app := NewApp()

	// WebView2 사용자 데이터 경로를 단일 공용 폴더로 고정 (버전별 폴더 난립 원천 방지)
	webviewDataPath := filepath.Join(os.Getenv("APPDATA"), "PHGC_WebviewData")

	// Create application with options
	err := wails.Run(&options.App{
		Title:  "그래서? 넌 어디 갈래?",
		Width:  1024,
		Height: 768,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		WindowStartState: options.Maximised,
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Bind: []interface{}{
			app,
		},
		Windows: &windows.Options{
			WebviewUserDataPath: webviewDataPath,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
