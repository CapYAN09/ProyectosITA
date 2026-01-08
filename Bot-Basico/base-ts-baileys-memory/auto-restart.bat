@echo off
chcp 65001 > nul
title WhatsApp Bot Auto-Restart
mode con: cols=80 lines=25

:start
cls
echo WhatsApp Bot - Auto Restart System
echo ==================================
echo.
echo [%time%] Iniciando ciclo...
echo.

:: Compilar
echo Compilando TypeScript...
call npm run build

if %errorlevel% neq 0 (
    echo Error en compilacion, reintentando en 10s...
    timeout /t 10 /nobreak > nul
    goto :start
)

:: Ejecutar
echo Ejecutando bot...
echo Presiona Ctrl+C para terminar el bot y continuar...
echo.

node "dist/app.js"

echo.
echo Bot terminado, reiniciando en 5 segundos...
echo Para salir completamente: Cierra esta ventana o presiona Ctrl+C dos veces
echo.

timeout /t 5 /nobreak > nul
goto :start