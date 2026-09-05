@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist "backend-api\src\core.js" (
  echo ERROR: Run this from the BDG_CS_ASSISTANT repository root.
  pause
  exit /b 1
)

call npm --prefix backend-api run check || goto :failed
call npm --prefix backend-api run test:prompt-runtime || goto :failed
call npm --prefix backend-api run test:simplified-ai || goto :failed
call npm --prefix backend-api run test:v1181-ai-knowledge || goto :failed
call npm --prefix admin-pro run typecheck || goto :failed
call npm --prefix admin-pro run build || goto :failed
git diff --check || goto :failed

echo.
echo SUCCESS: AI Knowledge verification passed.
pause
exit /b 0

:failed
echo.
echo FAILED: AI Knowledge verification did not pass.
pause
exit /b 1
