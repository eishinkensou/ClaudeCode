#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
  03-enable-defender.ps1  -- Windows Defender のサービスとリアルタイム保護を有効化し、定義ファイルを更新します
  注意: McAfee を削除し「再起動した後」に実行してください。
        他社製ウイルス対策が残っていると Defender は自動的に受動モードになり有効化できません。
#>
$ErrorActionPreference = 'Continue'

Write-Host "=== 1. 他社製ウイルス対策の確認 ===" -ForegroundColor Cyan
$av = Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct
$others = $av | Where-Object { $_.displayName -notlike '*Defender*' -and $_.displayName -notlike '*Windows*' }
if ($others) {
  Write-Warning "他社製ウイルス対策が登録されています: $($others.displayName -join ', ')"
  Write-Warning "先に削除（MCPR 含む）と再起動を行ってください。続行しても Defender は有効化できない場合があります。"
}

Write-Host "`n=== 2. Defender を無効化するポリシーの解除 ===" -ForegroundColor Cyan
foreach ($k in 'HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender', 'HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender\Real-Time Protection') {
  if (Test-Path $k) {
    foreach ($v in 'DisableAntiSpyware','DisableAntiVirus','DisableRealtimeMonitoring','DisableBehaviorMonitoring','DisableOnAccessProtection','DisableScanOnRealtimeEnable') {
      if ((Get-ItemProperty $k -ErrorAction SilentlyContinue).PSObject.Properties[$v]) {
        Remove-ItemProperty $k -Name $v -ErrorAction SilentlyContinue; Write-Host "  削除: $k\$v"
      }
    }
  }
}
Write-Host "  完了"

Write-Host "`n=== 3. サービスの有効化 ===" -ForegroundColor Cyan
foreach ($s in 'WinDefend','WdNisSvc','SecurityHealthService','wscsvc') {
  $svc = Get-Service $s -ErrorAction SilentlyContinue
  if (-not $svc) { Write-Host "  $s : 見つかりません"; continue }
  try {
    if ($svc.StartType -eq 'Disabled') { Set-Service $s -StartupType Automatic -ErrorAction Stop }
    if ($svc.Status -ne 'Running') { Start-Service $s -ErrorAction Stop }
    Write-Host "  $s : $((Get-Service $s).Status)"
  } catch {
    Write-Warning "  $s : $($_.Exception.Message)"
    Write-Warning "  （Windows の保護によりスクリプトから変更できない場合があります。手順書の『手動で有効化』を参照）"
  }
}

Write-Host "`n=== 4. リアルタイム保護などの有効化 ===" -ForegroundColor Cyan
try {
  Set-MpPreference -DisableRealtimeMonitoring $false -ErrorAction Stop
  Set-MpPreference -DisableBehaviorMonitoring $false -DisableIOAVProtection $false -DisableScriptScanning $false -ErrorAction SilentlyContinue
  Set-MpPreference -MAPSReporting Advanced -SubmitSamplesConsent SendSafeSamples -ErrorAction SilentlyContinue
  Write-Host "  完了"
} catch {
  Write-Warning "  Set-MpPreference 失敗: $($_.Exception.Message)"
  Write-Warning "  改ざん防止（Tamper Protection）が有効な場合は設定アプリから手動で有効化してください（手順書参照）。"
}

Write-Host "`n=== 5. 定義ファイル（セキュリティ インテリジェンス）の更新 ===" -ForegroundColor Cyan
try { Update-MpSignature -ErrorAction Stop; Write-Host "  完了" } catch { Write-Warning "  失敗: $($_.Exception.Message)" }

Write-Host "`n=== 6. 現在の状態 ===" -ForegroundColor Cyan
try {
  $st = Get-MpComputerStatus
  $st | Select-Object AMServiceEnabled, AntivirusEnabled, RealTimeProtectionEnabled, IsTamperProtected,
    AntivirusSignatureVersion, AntivirusSignatureLastUpdated, AntivirusSignatureAge | Format-List | Out-String | Write-Host
  if ($st.AntivirusEnabled -and $st.RealTimeProtectionEnabled) {
    Write-Host "Windows Defender は有効です。" -ForegroundColor Green
    $ans = Read-Host "クイックスキャンを今すぐ実行しますか？ (y/N)"
    if ($ans -match '^[yY]') { Start-MpScan -ScanType QuickScan; Write-Host "クイックスキャン完了" }
  } else {
    Write-Warning "まだ有効になっていません。PC を再起動して再度このスクリプトを実行するか、手順書の『手動で有効化』を参照してください。"
  }
} catch { Write-Warning "状態取得失敗: $($_.Exception.Message)" }
