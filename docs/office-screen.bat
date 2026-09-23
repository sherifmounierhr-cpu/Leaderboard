@echo off
setlocal

REM ---------------------------------------------------------------------------
REM Everest leaderboard - office screen launcher.
REM
REM Opens the board full screen in Chrome with sound allowed to play on its own,
REM so the chime, celebration songs and announcement clips are heard without
REM anyone clicking the screen first.
REM
REM It uses a dedicated Chrome profile (EverestBoard). That matters: Chrome
REM ignores these switches when it is already running on the normal profile.
REM Sign in once in this window and the screen stays signed in afterwards.
REM
REM Press Alt+F4 to leave kiosk mode.
REM ---------------------------------------------------------------------------

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo Chrome was not found. Install Google Chrome, then run this file again.
  pause
  exit /b 1
)

REM Board address. Add ^&lang=en for the English board, or change interval=20
REM to rotate faster or slower between screens.
set "URL=https://leaderboard-gray-one.vercel.app/?kiosk=1^&rotate=1^&interval=20"

set "PROFILE=%LocalAppData%\EverestBoard"

start "" "%CHROME%" ^
  --user-data-dir="%PROFILE%" ^
  --autoplay-policy=no-user-gesture-required ^
  --kiosk ^
  --start-fullscreen ^
  --noerrdialogs ^
  --disable-infobars ^
  --disable-session-crashed-bubble ^
  --disable-features=TranslateUI ^
  --check-for-update-interval=31536000 ^
  "%URL%"

endlocal
