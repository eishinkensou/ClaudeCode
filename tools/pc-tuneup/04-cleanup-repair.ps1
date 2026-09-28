#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
  04-cleanup-repair.ps1  -- 一時ファイル削除・ストレージセンサー有効化・DISM/sfc によるシステム修復・ディスク最適化
  所要時間: 20〜60分（DISM と sfc が大半）。実行中は PC を操作しても構いませんが、電源は切らないでください。
  ログ: デスクトップの PC修復ログ_yyyyMMdd_HHmm.txt
#>
$ErrorActionPreference = 'Continue'
$log = Join-Path ([Environment]::GetFolderPath('Desktop')) ("PC修復ログ_{0}.txt" -f (Get-Date -Format 'yyyyMMdd_HHmm'))
Start-Transcript -Path $log -Force | Out-Null

function FreeGB { [math]::Round((Get-Volume -DriveLetter C).SizeRemaining / 1GB, 2) }
$before = FreeGB
Write-Host "=== 開始時の C: 空き容量: $before GB ===" -ForegroundColor Cyan

Write-Host "`n=== 1. 一時ファイルの削除 ===" -ForegroundColor Cyan
$targets = @(
  "$env:TEMP",
  "$env:SystemRoot\Temp",
  "$env:LOCALAPPDATA\Microsoft\Windows\INetCache",
  "$env:LOCALAPPDATA\Microsoft\Windows\Explorer\thumbcache_*.db",
  "$env:SystemRoot\SoftwareDistribution\Download",
  "$env:ProgramData\Microsoft\Windows\WER\ReportQueue",
  "$env:LOCALAPPDATA\CrashDumps"
)
# Windows Update のダウンロードキャッシュは、サービス停止中のみ安全に削除できる
Stop-Service wuauserv, bits -Force -ErrorAction SilentlyContinue
foreach ($t in $targets) {
  if (Test-Path $t) {
    $n = (Get-ChildItem $t -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object).Count
    Get-ChildItem $t -Recurse -Force -ErrorAction SilentlyContinue |
      Where-Object { $_.LastWriteTime -lt (Get-Date).AddHours(-1) } |
      Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  $t  ($n 項目を対象、使用中のものはスキップ)"
  }
}
Start-Service bits, wuauserv -ErrorAction SilentlyContinue
# ごみ箱
Clear-RecycleBin -Force -ErrorAction SilentlyContinue; Write-Host "  ごみ箱を空にしました"
# ディスク クリーンアップ（システム ファイル含む）をサイレント実行
$cleanKey = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VolumeCaches'
Get-ChildItem $cleanKey | ForEach-Object { New-ItemProperty -Path $_.PSPath -Name StateFlags0099 -Value 2 -PropertyType DWord -Force | Out-Null }
Write-Host "  ディスク クリーンアップ (cleanmgr /sagerun:99) を実行中..."
Start-Process cleanmgr.exe -ArgumentList '/sagerun:99' -Wait -ErrorAction SilentlyContinue
Write-Host "  完了。空き容量: $(FreeGB) GB"

Write-Host "`n=== 2. ストレージ センサーの有効化 ===" -ForegroundColor Cyan
$ss = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\StorageSense\Parameters\StoragePolicy'
New-Item $ss -Force | Out-Null
# 01=有効, 2048=実行頻度(1=毎日,7=毎週,30=毎月,0=空き不足時), 04=一時ファイル削除, 08/256=ごみ箱(30日), 32/512=ダウンロード(0=削除しない)
Set-ItemProperty $ss -Name 01   -Value 1  -Type DWord
Set-ItemProperty $ss -Name 2048 -Value 7  -Type DWord
Set-ItemProperty $ss -Name 04   -Value 1  -Type DWord
Set-ItemProperty $ss -Name 08   -Value 1  -Type DWord
Set-ItemProperty $ss -Name 256  -Value 30 -Type DWord
Set-ItemProperty $ss -Name 32   -Value 0  -Type DWord
Write-Host "  有効化（毎週 / 一時ファイル削除 / ごみ箱30日 / ダウンロードは削除しない）"

Write-Host "`n=== 3. DISM によるコンポーネントストア修復 ===" -ForegroundColor Cyan
DISM.exe /Online /Cleanup-Image /RestoreHealth
Write-Host "  DISM 終了コード: $LASTEXITCODE"
Write-Host "  コンポーネントストアのクリーンアップ..."
DISM.exe /Online /Cleanup-Image /StartComponentCleanup

Write-Host "`n=== 4. sfc によるシステムファイル検査 ===" -ForegroundColor Cyan
sfc.exe /scannow
Write-Host "  sfc 終了コード: $LASTEXITCODE"

Write-Host "`n=== 5. ディスクの最適化（SSD は TRIM、HDD はデフラグ）===" -ForegroundColor Cyan
Get-Volume | Where-Object { $_.DriveLetter -and $_.DriveType -eq 'Fixed' } | ForEach-Object {
  $dl = $_.DriveLetter
  $diskNo = (Get-Partition -DriveLetter $dl -ErrorAction SilentlyContinue).DiskNumber
  $media = (Get-PhysicalDisk -ErrorAction SilentlyContinue | Where-Object { $_.DeviceId -eq "$diskNo" }).MediaType
  Write-Host "  $dl`: ($media)  ※ Optimize-Volume が SSD なら TRIM、HDD ならデフラグを自動選択します"
  Optimize-Volume -DriveLetter $dl -Verbose
}

Write-Host "`n=== 6. 電源プランをバランスに設定（省電力になっていた場合の改善）===" -ForegroundColor Cyan
powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e
powercfg /getactivescheme

$after = FreeGB
Write-Host "`n=== 完了 ===" -ForegroundColor Green
Write-Host "C: 空き容量  開始: $before GB → 終了: $after GB（+$([math]::Round($after - $before, 2)) GB）"
Write-Host "sfc/DISM が修復を行った場合は再起動が必要です。ログ: $log"
Stop-Transcript | Out-Null
