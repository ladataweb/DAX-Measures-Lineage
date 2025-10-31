param (
    [string]$Server,
    [string]$Database
)

Write-Host "Starting External Tool..." -ForegroundColor Cyan
Write-Host "Server: $Server" -ForegroundColor Yellow
Write-Host "Model: $Database" -ForegroundColor Yellow
Write-Host "Building measures dependencies and Coping result to clipboard." -ForegroundColor Green

try {
    # 1. Crear conexión OLE DB al puerto XMLA
    $connString = "Provider=MSOLAP;Data Source=$Server;Initial Catalog=$Database"
    $conn = New-Object -ComObject ADODB.Connection
    $conn.Open($connString)

    # 2. Ejecutar consulta DAX completa
    $query = @"
EVALUATE 
	{ TOJSON(    
		SELECTCOLUMNS(
			FILTER(
				INFO.CALCDEPENDENCY()
				, [OBJECT_TYPE] = "MEASURE" && [REFERENCED_OBJECT_TYPE] <> "COLUMN"            
			)
			,  "Measure", [OBJECT]
			, "Expression", [EXPRESSION]
			, "Referenced_Object_Type", [REFERENCED_OBJECT_TYPE]
			, "Referenced_Object", [REFERENCED_OBJECT]
		)
	, -1)}
"@
    $rs = New-Object -ComObject ADODB.Recordset
    $rs.Open($query, $conn)

    if ($rs.EOF) {
        throw "DAX Quer hasn't return anything."
    }

    # 3. Convertir resultados a JSON
    
	$json = $rs.Fields.Item(0).Value
    $rs.Close()
    $conn.Close()

    #$json = $results | ConvertTo-Json -Depth 5
    #Write-Host "Consulta ejecutada correctamente. Filas: $($results.Count)" -ForegroundColor Green
	Write-Host "Dax Query has run successfully." -ForegroundColor Blue
	
	# Copyy to clip board
	$json | Set-Clipboard

    # 4. Guardar archivo temporal
    #$tempPath = "C:\Temp"
    #if (-not (Test-Path $tempPath)) { New-Item -ItemType Directory -Path $tempPath }
    #$fileName = "calcdependency.json"
    #$filePath = Join-Path $tempPath $fileName
    #$json | Out-File -FilePath $filePath -Encoding UTF8
    #Write-Host "Archivo guardado en: $filePath" -ForegroundColor Cyan

    # 5. Abrir navegador con nombre del archivo como parámetro
    #$encodedFile = [System.Net.WebUtility]::UrlEncode($fileName)
    $url = "https://ladataweb.github.io/DAX-Measures-Lineage/index.html?copy=true"
    Start-Process $url
}
catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
}
finally {
    Write-Host "`nPress any key to close this window..." -ForegroundColor Yellow
    Read-Host
}

