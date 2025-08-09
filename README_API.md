# API de Notificações - Documentação Atualizada

## Visão Geral

Esta API permite o envio de notificações push para aplicativos móveis através do Firebase Cloud Messaging (FCM), com suporte a múltiplas rotas por usuário e diferentes tipos de mensagens.

## Estrutura do Banco de Dados

### Tabelas Principais

1. **users**: Usuários com suporte a múltiplas rotas
2. **routes**: Rotas com tokens Firebase e autenticação opcional
3. **messages**: Mensagens com diferentes tipos (texto, imagem, áudio)

## Endpoints da API

### 1. Criar Usuário
**POST** `/database/create-user`

Cria um novo usuário com uma ou mais rotas associadas.

**Payload:**
```json
{
  "name": "Nome do Usuário",
  "routes": [
    {
      "name": "pessoal",
      "token": "fMEP..."
    },
    {
      "name": "trabalho", 
      "token": "fMEP..."
    }
  ]
}
```

**Resposta (201):**
```json
{
  "success": true,
  "message": "Usuário criado com sucesso.",
  "data": {
    "user_id": 1,
    "name": "Nome do Usuário",
    "routes": [
      {
        "id": 1,
        "name": "pessoal",
        "token": "fMEP..."
      }
    ]
  }
}
```

### 2. Verificar Rota
**POST** `/database/check-route`

Verifica se uma rota existe e está associada a um usuário.

**Payload:**
```json
{
  "user_id": 1,
  "name": "pessoal"
}
```

**Resposta (200):**
```json
{
  "success": true,
  "route": {
    "id": 1,
    "name": "pessoal",
    "token": "fMEP...",
    "user_id": 1
  }
}
```

### 3. Autenticação de Rota
**PATCH** `/database/auth_route`

Adiciona ou atualiza um Bearer Token para autenticação de uma rota específica.

**Payload:**
```json
{
  "route_id": 1,
  "bearer_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Resposta (200):**
```json
{
  "success": true,
  "message": "Token de autenticação atualizado com sucesso.",
  "route_id": 1,
  "has_token": true
}
```

### 4. Enviar Mensagem de Texto
**POST** `/send-message`

Envia uma mensagem de texto para uma rota específica.

**Payload:**
```json
{
  "user_id": 1,
  "route_name": "pessoal",
  "type": "text",
  "content": "Olá! Esta é uma mensagem de teste."
}
```

**Resposta (200):**
```json
{
  "success": true,
  "message": "Mensagem enviada com sucesso",
  "messageId": 1,
  "type": "text",
  "fcmSuccess": true,
  "sseSuccess": true,
  "overallDelivery": "SUCCESS"
}
```

### 5. Enviar Imagem
**POST** `/send-image`

Envia uma mensagem contendo a URL de uma imagem.

**Payload:**
```json
{
  "user_id": 1,
  "route_name": "pessoal",
  "type": "image",
  "content": "https://exemplo.com/imagem.jpg"
}
```

**Resposta (200):**
```json
{
  "success": true,
  "message": "Mensagem enviada com sucesso",
  "messageId": 2,
  "type": "image",
  "fcmSuccess": true,
  "sseSuccess": true,
  "overallDelivery": "SUCCESS"
}
```

### 6. Enviar Áudio
**POST** `/send-audio`

Envia uma mensagem contendo a URL de um arquivo de áudio.

**Payload:**
```json
{
  "user_id": 1,
  "route_name": "pessoal",
  "type": "audio",
  "content": "https://exemplo.com/audio.mp3"
}
```

**Resposta (200):**
```json
{
  "success": true,
  "message": "Mensagem enviada com sucesso",
  "messageId": 3,
  "type": "audio",
  "fcmSuccess": true,
  "sseSuccess": true,
  "overallDelivery": "SUCCESS"
}
```

## Validações

### URLs de Imagem
- Deve ser HTTPS
- Extensões suportadas: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`

### URLs de Áudio
- Deve ser HTTPS
- Extensões suportadas: `.mp3`, `.wav`, `.ogg`, `.m4a`, `.aac`, `.flac`

### Tokens Firebase
- Deve começar com `fMEP`
- Deve ser uma string válida

## Códigos de Status HTTP

- **200 OK**: Operação bem-sucedida
- **201 Created**: Recurso criado com sucesso
- **400 Bad Request**: Dados inválidos no payload
- **404 Not Found**: Usuário ou rota não encontrados
- **500 Internal Server Error**: Erro interno do servidor

## Configuração do Banco de Dados

Execute o script `database_schema.sql` no seu banco PostgreSQL:

```bash
psql -d seu_banco -f database_schema.sql
```

## Variáveis de Ambiente

Certifique-se de configurar as seguintes variáveis:

```env
DB_NAME=seu_banco
DB_USER=seu_usuario
DB_PASSWORD=sua_senha
DB_HOST=localhost
DB_PORT=5432
PORT=3000
```

## Exemplo de Uso

### 1. Criar um usuário
```bash
curl -X POST http://localhost:3000/database/create-user \
  -H "Content-Type: application/json" \
  -d '{
    "name": "João Silva",
    "routes": [
      {
        "name": "pessoal",
        "token": "fMEP..."
      }
    ]
  }'
```

### 2. Enviar uma mensagem
```bash
curl -X POST http://localhost:3000/send-message \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "route_name": "pessoal",
    "type": "text",
    "content": "Olá! Como você está?"
  }'
```

### 3. Enviar uma imagem
```bash
curl -X POST http://localhost:3000/send-image \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "route_name": "pessoal",
    "type": "image",
    "content": "https://exemplo.com/foto.jpg"
  }'
```

## Logs e Monitoramento

A API inclui logs detalhados para:
- Criação de usuários e rotas
- Envio de mensagens
- Erros de validação
- Status de entrega das notificações

## Compatibilidade

- Endpoints legacy mantidos para compatibilidade
- Suporte a múltiplas rotas por usuário
- Autenticação opcional por rota
- Diferentes tipos de mensagem (texto, imagem, áudio)
