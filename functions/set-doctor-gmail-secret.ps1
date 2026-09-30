$ErrorActionPreference = 'Stop'
$secure = Read-Host -AsSecureString 'Enter the Google app password for relapseclinic0@gmail.com'
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $password = ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) -replace '\s', '')
  if ($password.Length -ne 16) { throw 'A Google app password should contain 16 characters.' }
  $payload = @{
    enabled = $true
    user = 'relapseclinic0@gmail.com'
    appPassword = $password
  } | ConvertTo-Json -Compress
  $payload | firebase functions:secrets:set DOCTOR_EMAIL_CONFIG --data-file - --project relapse-clinic-db
  if ($LASTEXITCODE -ne 0) { throw 'Firebase did not save the Gmail secret.' }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  $password = $null
  $payload = $null
}
