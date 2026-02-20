# 🧪 Testes da API

## ✅ Status dos Testes

### Teste de Criação de Momento
**Status:** ✅ PASSOU

O teste completo foi executado com sucesso:
- ✅ Registro de usuário
- ✅ Autenticação
- ✅ Criação de momento
- ✅ Listagem de momentos

## 📝 Como Testar Manualmente

### 1. Registrar Usuário

```powershell
$body = @{
    email = "teste@example.com"
    password = "senha123"
    name = "Teste"
} | ConvertTo-Json

$response = Invoke-WebRequest -Uri "http://localhost:3001/api/auth/register" `
    -Method POST `
    -Headers @{"Content-Type"="application/json"} `
    -Body $body

$data = $response.Content | ConvertFrom-Json
$token = $data.token
```

### 2. Criar Momento

```powershell
$momentBody = @{
    title = "Meu Primeiro Momento"
    recipientName = "Maria"
    senderName = "João"
    introPhrase = "Você é especial"
    startDate = "2020-02-14T00:00:00.000Z"
    locale = "pt-BR"
} | ConvertTo-Json

$response = Invoke-WebRequest -Uri "http://localhost:3001/api/moments" `
    -Method POST `
    -Headers @{
        "Content-Type"="application/json"
        "Authorization"="Bearer $token"
    } `
    -Body $momentBody

$moment = $response.Content | ConvertFrom-Json
Write-Host "Momento criado: $($moment.moment.slug)"
```

### 3. Listar Momentos

```powershell
$response = Invoke-WebRequest -Uri "http://localhost:3001/api/moments/my" `
    -Method GET `
    -Headers @{"Authorization"="Bearer $token"}

$data = $response.Content | ConvertFrom-Json
$data.moments | Format-Table
```

## 🔍 Verificar Logs

Se houver problemas, verifique os logs do servidor. O servidor deve estar rodando em `http://localhost:3001`

## 🐛 Problemas Comuns

### Erro 401 - Não autorizado
- Verifique se o token está sendo enviado no header `Authorization: Bearer <token>`
- Verifique se o token não expirou

### Erro 400 - Validação
- Verifique se todos os campos obrigatórios estão presentes
- Verifique o formato dos dados (especialmente datas)

### Erro 500 - Erro interno
- Verifique os logs do servidor
- Verifique se o banco de dados está acessível

