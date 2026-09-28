#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
  02-remove-mcafee.ps1  -- McAfee 製品（通常版・Store 版）をすべてアンインストールします
  実行前に 01-diagnose.ps1 で対象を確認してください。
  ・通常版: 各製品のアンインストーラーが起動します。画面の指示に従ってください（McAfee は確認画面が出ます）。
  ・Store 版: Appx パッケージを削除します。
  ・終了後、残骸があれば McAfee 公式ツール MCPR の実行を案内します。
#>
$ErrorActionPreference = 'Continue'

$uninstKeys = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
              'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
              'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'

function Get-McAfeeWin32 {
  Get-ItemProperty $uninstKeys -ErrorAction SilentlyContinue |
    Where-Object { ($_.DisplayName -like '*McAfee*' -or $_.Publisher -like '*McAfee*') -and $_.UninstallString }
}
function Get-McAfeeAppx {
  Get-AppxPackage -AllUsers | Where-Object { $_.Name -like '*McAfee*' -or $_.Publisher -like '*McAfee*' }
}

$win32 = @(Get-McAfeeWin32)
$appx  = @(Get-McAfeeAppx)

Write-Host "`n=== 検出された McAfee 製品 ===" -ForegroundColor Cyan
if ($win32.Count) { "--- 通常版 ---"; $win32 | Select-Object DisplayName, DisplayVersion | Format-Table -AutoSize | Out-String | Write-Host }
if ($appx.Count)  { "--- Store 版 ---"; $appx | Select-Object Name, Version | Format-Table -AutoSize | Out-String | Write-Host }
if (-not $win32.Count -and -not $appx.Count) { Write-Host "McAfee 製品は見つかりませんでした。" -ForegroundColor Green }

if ($win32.Count -or $appx.Count) {
  $ans = Read-Host "上記をすべてアンインストールします。よろしいですか？ (y/N)"
  if ($ans -notmatch '^[yY]') { Write-Host "中止しました。"; exit 0 }

  # 通常版: WebAdvisor などの周辺製品を先に、本体 (McAfee LiveSafe / Total Protection 等) を最後に
  $ordered = $win32 | Sort-Object { if ($_.DisplayName -match 'LiveSafe|Total Protection|Internet Security|AntiVirus|Personal Security|McAfee Security') { 1 } else { 0 } }
  foreach ($p in $ordered) {
    Write-Host "`n>>> アンインストール中: $($p.DisplayName)" -ForegroundColor Yellow
    $cmd = $p.UninstallString
    try {
      if ($cmd -match '^msiexec' -or $cmd -match '\{[0-9A-F-]{36}\}') {
        $guid = [regex]::Match($cmd, '\{[0-9A-F-]{36}\}').Value
        if ($guid) { Start-Process msiexec.exe -ArgumentList "/x $guid /passive /norestart" -Wait } else { Start-Process cmd.exe -ArgumentList "/c `"$cmd`"" -Wait }
      } else {
        # 例: "C:\Program Files\McAfee\MSC\mcuihost.exe" /body:misp://MSCJsRes.dll::uninstall.html
        Start-Process cmd.exe -ArgumentList "/c `"$cmd`"" -Wait
      }
      Write-Host "    完了（画面上で確認を求められた場合は完了させてください）"
    } catch { Write-Warning "    失敗: $($_.Exception.Message)" }
  }

  foreach ($a in $appx) {
    Write-Host "`n>>> Store 版を削除中: $($a.Name)" -ForegroundColor Yellow
    try {
      Get-AppxPackage -AllUsers -Name $a.Name | Remove-AppxPackage -AllUsers -ErrorAction Stop
      Get-AppxProvisionedPackage -Online | Where-Object DisplayName -eq $a.Name | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue | Out-Null
      Write-Host "    完了"
    } catch { Write-Warning "    失敗: $($_.Exception.Message)" }
  }
}

Write-Host "`n=== 残骸チェック ===" -ForegroundColor Cyan
$leftServices = Get-Service | Where-Object { $_.DisplayName -like '*McAfee*' -or $_.Name -like 'mfe*' }
$leftDirs = 'C:\Program Files\McAfee','C:\Program Files (x86)\McAfee','C:\Program Files\Common Files\McAfee','C:\ProgramData\McAfee' | Where-Object { Test-Path $_ }
$leftWin32 = @(Get-McAfeeWin32); $leftAppx = @(Get-McAfeeAppx)
if ($leftServices) { "残存サービス:"; $leftServices | Select-Object Name, DisplayName, Status | Format-Table -AutoSize | Out-String | Write-Host }
if ($leftDirs)     { "残存フォルダー:"; $leftDirs | Write-Host }
if ($leftWin32)    { "残存アプリ:"; $leftWin32.DisplayName | Write-Host }
if ($leftAppx)     { "残存 Store アプリ:"; $leftAppx.Name | Write-Host }

if ($leftServices -or $leftDirs -or $leftWin32 -or $leftAppx) {
  Write-Host @"

残骸が残っています。McAfee 公式の削除ツール MCPR を実行してください:
  1. https://www.mcafee.com/support/ で「MCPR」を検索し、McAfee Consumer Product Removal ツール (MCPR.exe) をダウンロード
     （直接リンク例: https://download.mcafee.com/molbin/iss-loc/SupportTools/MCPR/MCPR.exe ）
  2. MCPR.exe を右クリック →「管理者として実行」
  3. 使用許諾に同意 → 表示された文字を入力 → 削除完了後に PC を再起動
  4. 再起動後、03-enable-defender.ps1 を実行
"@ -ForegroundColor Yellow
} else {
  Write-Host "残骸は見つかりませんでした。PC を再起動してから 03-enable-defender.ps1 を実行してください。" -ForegroundColor Green
}
