$lines = Get-Content 'app.js' -Encoding UTF8
# Mantém apenas as primeiras 3552 linhas (0..3551 em base-0 = linhas 1..3552 em base-1)
# Linha 3551 é o '}); // <- fechamento do DOMContentLoaded'
$lines[0..3551] | Set-Content 'app.js' -Encoding UTF8
$count = (Get-Content 'app.js').Count
Write-Host "Truncamento concluido. Total de linhas agora: $count"
