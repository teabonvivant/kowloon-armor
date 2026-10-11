@echo off
chcp 65001 >nul
setlocal
if exist "%~dp0九龍裝甲行動.html" (
  start "" "%~dp0九龍裝甲行動.html"
  exit /b 0
)
if exist "%~dp0dist\index.html" (
  start "" "%~dp0dist\index.html"
  exit /b 0
)
echo Game file not found. Keep this launcher beside the standalone HTML file.
echo 找不到遊戲檔案。請把此啟動檔與「九龍裝甲行動.html」放在同一資料夾。
pause
exit /b 1
