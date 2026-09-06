package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// LoginIndex contains no student data and no password material. It exists so
// the login screen can show account choices without opening encrypted SQLite.
type LoginIndex struct {
	SchoolName string         `json:"schoolName"`
	Accounts   []LoginAccount `json:"accounts"`
}

type LoginAccount struct {
	Username string `json:"username"`
	Role     string `json:"role"`
	ClassNum int    `json:"classNum"`
}

func loginIndexPath(dataDir string) string { return filepath.Join(dataDir, "login-index.json") }

func saveLoginIndex(dataDir, schoolName string, users []User) error {
	accounts := make([]LoginAccount, 0, len(users))
	for _, user := range users {
		accounts = append(accounts, LoginAccount{Username: user.Username, Role: user.Role, ClassNum: user.ClassNum})
	}
	data, err := json.Marshal(LoginIndex{SchoolName: schoolName, Accounts: accounts})
	if err != nil {
		return err
	}
	return os.WriteFile(loginIndexPath(dataDir), data, 0600)
}

func loadLoginIndex(dataDir string) (LoginIndex, error) {
	data, err := os.ReadFile(loginIndexPath(dataDir))
	if err != nil {
		return LoginIndex{}, err
	}
	var index LoginIndex
	if err := json.Unmarshal(data, &index); err != nil {
		return LoginIndex{}, err
	}
	return index, nil
}
