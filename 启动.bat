@echo off
setlocal
chcp 65001 >nul
title 二维码商品展示系统
cd /d "%~dp0"

echo ============================================
echo   二维码商品展示系统 · 启动中...
echo ============================================
echo.

rem -- 优先使用系统安装的 Node.js，没有则使用项目自带的便携版 --
where node >nul 2>nul
if errorlevel 1 (
    if exist "%~dp0tools\node\node.exe" (
        set "PATH=%~dp0tools\node;%PATH%"
        echo [提示] 使用项目自带便携版 Node.js
    )
)

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未找到 Node.js！
    echo        请安装 Node.js（官网 https://nodejs.org 下载 LTS 版安装）
    pause
    exit /b 1
)

rem -- 首次运行自动安装依赖 --
if not exist "node_modules" (
    echo [首次运行] 正在安装依赖，请耐心等待 1-3 分钟...
    call npm install --registry=https://registry.npmmirror.com
    if errorlevel 1 (
        echo [提示] 国内镜像安装失败，尝试官方源...
        call npm install
    )
)

if not exist "node_modules" (
    echo [错误] 依赖安装失败，请检查网络后重新运行本脚本
    pause
    exit /b 1
)

echo.
echo [启动] 服务启动中，3 秒后自动打开管理后台
echo        也可手动访问 http://localhost:3000/admin/index.html
start "" cmd /c "timeout /t 3 >nul && start http://localhost:3000/admin/index.html"
node server.js

echo.
echo 服务已停止。
pause
