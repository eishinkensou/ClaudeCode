#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
  05-startup-review.ps1  -- スタートアップ項目と削除候補アプリを一覧表示し、確認後に無効化/削除します
  使い方:
    .\05-startup-review.ps1                         # 一覧表示のみ（変更なし）
    .\05-startup-review.ps1 -Disable "OneDrive","Spotify"     # 指定名のスタートアップを無効化（確認あり）
    .\05-startup-review.ps1 -Uninstall "アプリ表示名"          # 指定アプリをアンインストール（確認あり）
  無効化は Task Manager の「スタートアップ」タブと同じ仕組み（StartupApproved）を使うので、元に戻せます。
#>
param(
  [string[]]$Disable,
  [string[]]$Uninstall
)
$ErrorActionPreference = 'Continue'

$uninstKeys = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
              'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
              'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'

$approvedKeys = @{
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'                     = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run'                     = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run'         = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run32'
  'StartupFolder'                                                           = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder'
}

function Get-StartupItems {
  $items = @()
  foreach ($runKey in $approvedKeys.Keys | Where-Object { $_ -ne 'StartupFolder' }) {
    if (-not (Test-Path $runKey)) { continue }
    $p = Get-ItemProperty $runKey
    foreach ($prop in $p.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' }) {
      $ak = $approvedKeys[$runKey]
      $state = '有効'
      if (Test-Path $ak) { $v = (Get-ItemProperty $ak).PSObject.Properties[$prop.Name]; if ($v -and $v.Value[0] -eq 3) { $state = '無効' } }
      $items += [pscustomobject]@{ Name = $prop.Name; State = $state; Source = $runKey.Replace('Software\Microsoft\Windows\CurrentVersion\',''); Command = $prop.Value }
    }
  }
  $sf = [Environment]::GetFolderPath('Startup')
  Get-ChildItem $sf -File -ErrorAction SilentlyContinue | ForEach-Object {
    $ak = $approvedKeys['StartupFolder']; $state = '有効'
    if (Test-Path $ak) { $v = (Get-ItemProperty $ak).PSObject.Properties[$_.Name]; if ($v -and $v.Value[0] -eq 3) { $state = '無効' } }
    $items += [pscustomobject]@{ Name = $_.Name; State = $state; Source = 'StartupFolder'; Command = $_.FullName }
  }
  $items
}

# 一般に無効化しても支障が少ない候補（参考。最終判断はユーザー）
$knownOptional = 'OneDrive','Spotify','Discord','Steam','EpicGamesLauncher','Teams','MicrosoftTeams','Skype','iTunesHelper','Adobe','CCXProcess','Creative Cloud','Zoom','Dropbox','GoogleDrive','Slack','LINE','Cortana','Copilot','Phone Link','YourPhone','Xbox','Epic','Riot','Origin','EA','Ubisoft','Logi','Razer','MSI','Armoury','Lenovo Vantage','HP','Dell'

Write-Host "=== スタートアップ項目 ===" -ForegroundColor Cyan
$startup = Get-StartupItems
$startup | Select-Object Name, State, Source, @{n='候補';e={ $n=$_.Name; if ($knownOptional | Where-Object { $n -like "*$_*" }) {'★無効化候補'} else {''} }}, Command |
  Format-Table -Wrap -AutoSize

Write-Host "=== インストール済みアプリ（削除候補の目安付き）===" -ForegroundColor Cyan
$bloatHints = 'McAfee','Norton','WildTangent','CyberLink','Booking.com','ExpressVPN','Candy Crush','Dropbox Promotion','Trial','体験版','Toolbar','Weather','Bing','Amazon','Netflix','Disney','Spotify','TikTok','Facebook','Instagram','Messenger','Twitter','Xbox Game Bar Plugin','Solitaire','Game Pass','Cortana','Skype','3D Viewer','Paint 3D','Mixed Reality','Get Help','Tips','Feedback Hub'
Get-ItemProperty $uninstKeys -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -and -not $_.SystemComponent } |
  Sort-Object DisplayName -Unique |
  Select-Object DisplayName, Publisher, @{n='SizeMB';e={ if ($_.EstimatedSize) {[math]::Round($_.EstimatedSize/1024,0)} }},
    @{n='候補';e={ $d=$_.DisplayName; if ($bloatHints | Where-Object { $d -like "*$_*" }) {'★削除候補'} else {''} }} |
  Format-Table -AutoSize
Write-Host "--- Store アプリ（Appx）のうち削除候補 ---"
Get-AppxPackage | Where-Object { $n=$_.Name; $bloatHints | Where-Object { $n -like "*$_*" } } | Select-Object Name, Version | Format-Table -AutoSize

if (-not $Disable -and -not $Uninstall) {
  Write-Host "`n一覧のみ表示しました（変更なし）。" -ForegroundColor Green
  Write-Host "無効化する項目を決めたら:  .\05-startup-review.ps1 -Disable `"名前1`",`"名前2`""
  Write-Host "削除するアプリを決めたら:  .\05-startup-review.ps1 -Uninstall `"表示名`""
  exit 0
}

if ($Disable) {
  Write-Host "`n=== スタートアップ無効化 ===" -ForegroundColor Cyan
  foreach ($name in $Disable) {
    $hits = $startup | Where-Object { $_.Name -like "*$name*" }
    if (-not $hits) { Write-Warning "見つかりません: $name"; continue }
    foreach ($h in $hits) {
      $ans = Read-Host "無効化しますか？ [$($h.Name)] ($($h.Source)) (y/N)"
      if ($ans -notmatch '^[yY]') { continue }
      $srcKey = if ($h.Source -eq 'StartupFolder') { 'StartupFolder' } else { $approvedKeys.Keys | Where-Object { $_.Replace('Software\Microsoft\Windows\CurrentVersion\','') -eq $h.Source } }
      $ak = $approvedKeys[$srcKey]
      New-Item $ak -Force | Out-Null
      Set-ItemProperty $ak -Name $h.Name -Value ([byte[]](3,0,0,0,0,0,0,0,0,0,0,0)) -Type Binary
      Write-Host "  無効化しました: $($h.Name)（Task Manager の『スタートアップ』タブで再度有効化できます）"
    }
  }
}

if ($Uninstall) {
  Write-Host "`n=== アプリのアンインストール ===" -ForegroundColor Cyan
  foreach ($name in $Uninstall) {
    $apps = Get-ItemProperty $uninstKeys -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like "*$name*" -and $_.UninstallString }
    $appx = Get-AppxPackage | Where-Object { $_.Name -like "*$name*" }
    if (-not $apps -and -not $appx) { Write-Warning "見つかりません: $name"; continue }
    foreach ($a in $apps) {
      $ans = Read-Host "アンインストールしますか？ [$($a.DisplayName)] (y/N)"
      if ($ans -notmatch '^[yY]') { continue }
      $cmd = $a.UninstallString
      $guid = [regex]::Match($cmd, '\{[0-9A-F-]{36}\}').Value
      if ($cmd -match '^msiexec' -and $guid) { Start-Process msiexec.exe -ArgumentList "/x $guid /passive /norestart" -Wait }
      else { Start-Process cmd.exe -ArgumentList "/c `"$cmd`"" -Wait }
      Write-Host "  完了: $($a.DisplayName)"
    }
    foreach ($x in $appx) {
      $ans = Read-Host "Store アプリを削除しますか？ [$($x.Name)] (y/N)"
      if ($ans -notmatch '^[yY]') { continue }
      Remove-AppxPackage -Package $x.PackageFullName -ErrorAction Continue
      Write-Host "  完了: $($x.Name)"
    }
  }
}
