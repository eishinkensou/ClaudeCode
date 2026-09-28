#Requires -Version 5.1
<#
  01-diagnose.ps1  -- 読み取り専用の診断スクリプト（何も変更しません）
  実行方法: 管理者として PowerShell を開き、
    Set-ExecutionPolicy -Scope Process Bypass -Force
    .\01-diagnose.ps1
  結果はデスクトップの PC診断_yyyyMMdd_HHmm.txt に保存されます。
#>
$ErrorActionPreference = 'Continue'
$out = Join-Path ([Environment]::GetFolderPath('Desktop')) ("PC診断_{0}.txt" -f (Get-Date -Format 'yyyyMMdd_HHmm'))
Start-Transcript -Path $out -Force | Out-Null

function Section($t) { "`n" + ('=' * 70); "  $t"; ('=' * 70) }

Section 'OS / 本体'
$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
[pscustomobject]@{
  Windows      = "$($os.Caption) $($os.Version) (ビルド $($os.BuildNumber))"
  Model        = "$($cs.Manufacturer) $($cs.Model)"
  LastBoot     = $os.LastBootUpTime
  UptimeHours  = [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalHours, 1)
} | Format-List

Section 'CPU'
Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed, LoadPercentage | Format-List

Section 'メモリ'
$totalGB = [math]::Round($cs.TotalPhysicalMemory / 1GB, 1)
$freeGB  = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
[pscustomobject]@{
  TotalGB = $totalGB; FreeGB = $freeGB
  UsedPercent = [math]::Round((1 - $freeGB / $totalGB) * 100, 0)
  CommitUsedGB = [math]::Round(($os.TotalVirtualMemorySize - $os.FreeVirtualMemory) / 1MB, 1)
} | Format-List
Get-CimInstance Win32_PhysicalMemory | Select-Object BankLabel, @{n='GB';e={[math]::Round($_.Capacity/1GB,0)}}, Speed | Format-Table -AutoSize

Section 'ディスク種別（HDD/SSD）と状態'
Get-PhysicalDisk | Select-Object FriendlyName, MediaType, BusType, HealthStatus, @{n='SizeGB';e={[math]::Round($_.Size/1GB,0)}} | Format-Table -AutoSize

Section 'ボリュームの空き容量'
Get-Volume | Where-Object DriveLetter | Select-Object DriveLetter, FileSystemLabel, FileSystem,
  @{n='SizeGB';e={[math]::Round($_.Size/1GB,1)}},
  @{n='FreeGB';e={[math]::Round($_.SizeRemaining/1GB,1)}},
  @{n='FreePercent';e={ if ($_.Size) {[math]::Round($_.SizeRemaining/$_.Size*100,0)} }} | Format-Table -AutoSize

Section 'ディスク負荷（10秒サンプル）'
try {
  $c = Get-Counter '\PhysicalDisk(_Total)\% Disk Time','\PhysicalDisk(_Total)\Avg. Disk Queue Length','\Processor(_Total)\% Processor Time' -SampleInterval 2 -MaxSamples 5
  $c.CounterSamples | Group-Object Path | ForEach-Object {
    [pscustomobject]@{ Counter = $_.Name; Avg = [math]::Round(($_.Group.CookedValue | Measure-Object -Average).Average, 1) }
  } | Format-Table -AutoSize
} catch { "カウンター取得に失敗: $($_.Exception.Message)" }

Section 'CPU 使用上位プロセス（累積CPU時間）'
Get-Process | Sort-Object CPU -Descending | Select-Object -First 15 Name, Id,
  @{n='CPUSec';e={[math]::Round($_.CPU,0)}}, @{n='MemMB';e={[math]::Round($_.WorkingSet64/1MB,0)}}, Description | Format-Table -AutoSize

Section 'メモリ使用上位プロセス'
Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 15 Name, Id,
  @{n='MemMB';e={[math]::Round($_.WorkingSet64/1MB,0)}}, Description | Format-Table -AutoSize

Section 'スタートアップ登録（レジストリ Run / スタートアップフォルダー / 有効・無効状態）'
Get-CimInstance Win32_StartupCommand | Select-Object Name, Command, Location, User | Format-Table -Wrap -AutoSize
"--- 無効化状態 (StartupApproved: 先頭バイト 02=有効, 03=無効) ---"
$(foreach ($k in 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run',
                'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder',
                'HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run') {
  if (Test-Path $k) {
    $p = Get-ItemProperty $k
    $p.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
      [pscustomobject]@{ Key = $k.Split('\')[-1]; Name = $_.Name; State = $(if ($_.Value[0] -eq 2) {'有効'} elseif ($_.Value[0] -eq 3) {'無効'} else {$_.Value[0]}) }
    }
  }
}) | Format-Table -AutoSize
"--- タスクスケジューラ（ログオン時に実行する有効なタスク）---"
Get-ScheduledTask | Where-Object { $_.State -ne 'Disabled' -and ($_.Triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger' }) } |
  Select-Object TaskName, TaskPath, State | Format-Table -AutoSize

Section '登録済みウイルス対策ソフト（セキュリティセンター）'
Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct |
  Select-Object displayName, @{n='productStateHex';e={'0x{0:X6}' -f $_.productState}}, pathToSignedProductExe, timestamp | Format-List

Section 'McAfee のインストール状況'
"--- 通常版（アンインストール情報）---"
$uninstKeys = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
              'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
              'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
Get-ItemProperty $uninstKeys -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -like '*McAfee*' -or $_.Publisher -like '*McAfee*' } |
  Select-Object DisplayName, DisplayVersion, Publisher, UninstallString | Format-List
"--- Store 版（Appx）---"
Get-AppxPackage -AllUsers | Where-Object { $_.Name -like '*McAfee*' -or $_.Publisher -like '*McAfee*' } |
  Select-Object Name, PackageFullName, Version | Format-List
"--- McAfee 関連サービス ---"
Get-Service | Where-Object { $_.DisplayName -like '*McAfee*' -or $_.Name -like 'mfe*' -or $_.Name -like 'McAfee*' } |
  Select-Object Name, DisplayName, Status, StartType | Format-Table -AutoSize
"--- McAfee 関連プロセス ---"
Get-Process | Where-Object { $_.Company -like '*McAfee*' -or $_.Name -like 'mc*' -or $_.Name -like 'mfe*' } |
  Select-Object Name, Id, @{n='MemMB';e={[math]::Round($_.WorkingSet64/1MB,0)}}, Company | Format-Table -AutoSize
"--- 残存フォルダー ---"
'C:\Program Files\McAfee','C:\Program Files (x86)\McAfee','C:\Program Files\Common Files\McAfee','C:\ProgramData\McAfee' |
  ForEach-Object { [pscustomobject]@{ Path = $_; Exists = (Test-Path $_) } } | Format-Table -AutoSize

Section 'Windows Defender の状態'
Get-Service WinDefend, WdNisSvc, Sense -ErrorAction SilentlyContinue | Select-Object Name, Status, StartType | Format-Table -AutoSize
try {
  Get-MpComputerStatus | Select-Object AMServiceEnabled, AntivirusEnabled, RealTimeProtectionEnabled, IsTamperProtected,
    AntivirusSignatureLastUpdated, AntivirusSignatureAge, QuickScanEndTime, FullScanEndTime | Format-List
} catch { "Get-MpComputerStatus 失敗（Defender が無効/未登録の可能性）: $($_.Exception.Message)" }
"--- Defender を無効化するポリシー ---"
foreach ($k in 'HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender', 'HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender\Real-Time Protection') {
  if (Test-Path $k) { Get-ItemProperty $k | Select-Object DisableAntiSpyware, DisableAntiVirus, DisableRealtimeMonitoring | Format-List } else { "$k : なし（正常）" }
}

Section '電源プラン'
powercfg /getactivescheme
"--- 利用可能なプラン ---"
powercfg /list

Section '再起動待ちの更新'
[pscustomobject]@{
  CBSRebootPending   = Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending'
  WURebootRequired   = Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired'
  PendingFileRename  = [bool](Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager' -Name PendingFileRenameOperations -ErrorAction SilentlyContinue)
} | Format-List
"--- 最近の更新履歴（上位10件）---"
Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 10 HotFixID, Description, InstalledOn | Format-Table -AutoSize

Section '直近7日のシステムエラー（Critical/Error 上位30件）'
try {
  Get-WinEvent -FilterHashtable @{ LogName = 'System'; Level = 1, 2; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 30 -ErrorAction Stop |
    Select-Object TimeCreated, Id, ProviderName, @{n='Message';e={ ($_.Message -split "`n")[0] }} | Format-Table -Wrap -AutoSize
} catch { "該当なし、または取得失敗: $($_.Exception.Message)" }
"--- 直近7日のアプリケーションエラー（上位15件）---"
try {
  Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Level = 1, 2; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 15 -ErrorAction Stop |
    Select-Object TimeCreated, Id, ProviderName, @{n='Message';e={ ($_.Message -split "`n")[0] }} | Format-Table -Wrap -AutoSize
} catch { "該当なし、または取得失敗: $($_.Exception.Message)" }

Section 'インストール済みアプリ一覧（サイズ順・参考）'
Get-ItemProperty $uninstKeys -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -and -not $_.SystemComponent } |
  Sort-Object { [int64]($_.EstimatedSize -as [int64]) } -Descending |
  Select-Object -First 40 DisplayName, Publisher, @{n='SizeMB';e={ if ($_.EstimatedSize) {[math]::Round($_.EstimatedSize/1024,0)} }}, InstallDate | Format-Table -AutoSize

Stop-Transcript | Out-Null
Write-Host "`n診断結果を保存しました: $out" -ForegroundColor Green
Write-Host "このファイルの内容を貼り付けて共有してください。"
