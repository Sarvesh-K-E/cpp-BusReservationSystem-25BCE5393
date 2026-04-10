$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path ".\dist" | Out-Null

emcc `
  .\cpp\reservation_system.cpp `
  -O2 `
  -std=c++17 `
  --bind `
  -s MODULARIZE=1 `
  -s EXPORT_ES6=1 `
  -s ENVIRONMENT=web `
  -s ALLOW_MEMORY_GROWTH=1 `
  -s WASM=1 `
  -o .\dist\reservation.js

Write-Host "Built dist/reservation.js and dist/reservation.wasm"
