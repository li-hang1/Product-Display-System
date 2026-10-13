@echo off
setlocal
chcp 65001 >nul
title 保存版本到 GitHub
cd /d "%~dp0"
set "GIT=%~dp0tools\git\cmd\git.exe"

if not exist "%GIT%" (
    echo [错误] 未找到便携版 git，请联系开发者
    pause
    exit /b 1
)

rem -- 检查是否有改动 --
"%GIT%" add -A
"%GIT%" status --porcelain >nul 2>nul
"%GIT%" diff --cached --quiet >nul 2>nul
if not errorlevel 1 (
    echo 没有需要保存的改动。
    pause
    exit /b 0
)

rem -- 用时间戳生成版本说明 --
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "TS=%%i"

echo [1/2] 保存新版本 update-%TS% ...
"%GIT%" commit -m "update-%TS%"
if errorlevel 1 (
    echo [错误] 保存失败
    pause
    exit /b 1
)

echo [2/2] 推送到 GitHub ...
"%GIT%" push origin main
if errorlevel 1 (
    echo 网络不通，5 秒后重试一次...
    timeout /t 5 >nul
    "%GIT%" push origin main
    if errorlevel 1 (
        echo.
        echo [提示] 推送失败（GitHub 网络波动是常见现象）。
        echo        版本已保存在本机，稍后再双击本脚本重试推送即可。
        pause
        exit /b 1
    )
)

echo.
echo 保存成功！此版本已上传 GitHub。
echo 查看历史版本：在项目文件夹运行 tools\git\cmd\git.exe log --oneline
pause
