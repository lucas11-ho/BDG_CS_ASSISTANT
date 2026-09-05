@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist "backend-api\src\core.js" (
  echo.
  echo ERROR: Put these patch files in the ROOT of your BDG_CS_ASSISTANT repository first.
  echo Expected: backend-api\src\core.js
  echo.
  pause
  exit /b 1
)

where node >nul 2>nul || (
  echo ERROR: Node.js is not installed or not in PATH.
  pause
  exit /b 1
)
where git >nul 2>nul || (
  echo ERROR: Git is not installed or not in PATH.
  pause
  exit /b 1
)

node apply-ai-knowledge-v1.18.1.mjs
if errorlevel 1 goto :failed

echo.
echo ================================
echo Backend checks

echo ================================
call npm --prefix backend-api ci --no-audit --no-fund
if errorlevel 1 goto :failed
call npm --prefix backend-api run check
if errorlevel 1 goto :failed
call npm --prefix backend-api run test:prompt-runtime
if errorlevel 1 goto :failed
call npm --prefix backend-api run test:simplified-ai
if errorlevel 1 goto :failed
call npm --prefix backend-api run test:v1181-ai-knowledge
if errorlevel 1 goto :failed

echo.
echo ================================
echo Admin checks

echo ================================
call npm --prefix admin-pro ci --legacy-peer-deps --no-audit --no-fund
if errorlevel 1 goto :failed
call npm --prefix admin-pro run typecheck
if errorlevel 1 goto :failed
call npm --prefix admin-pro run build
if errorlevel 1 goto :failed

echo.
echo ================================
echo Git diff validation

echo ================================
git diff --check
if errorlevel 1 goto :failed
git status --short

echo.
echo SUCCESS: AI Knowledge v1.18.1 is built and verified locally.
echo Current branch: feature/v1.18.1-ai-knowledge

echo.
echo Review the diff, then run:
echo   git add -A
echo   git commit -m "v1.18.1: add scoped AI Knowledge retrieval"
echo   git push -u origin feature/v1.18.1-ai-knowledge

echo.
pause
exit /b 0

:failed
echo.
echo FAILED: The patch or verification stopped. No automatic commit was made.
echo Review the error above. Your existing main branch was not overwritten.
echo.
pause
exit /b 1
