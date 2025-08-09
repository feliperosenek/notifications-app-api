# 🔐 Tokens de Autenticação para Rotas

## 🚀 Endpoints

### Criar Rotas
```bash
POST /database/set-route
{
  "user_id": 1,
  "routes": [
    {
      "name": "joao-notifications"
    },
    {
      "name": "joao-webhooks"
    }
  ]
}
```

### Listar Rotas do Usuário
```bash
GET /database/user-routes/1
```

### Gerar Token Automaticamente
```bash
PATCH /database/auth_route
{
  "route_id": 1
}
```

### Excluir Token da Rota
```bash
DELETE /database/delete-token
{
  "route_id": 1
}
```

### Editar Nome da Rota
```bash
PATCH /database/edit-route
{
  "route_id": 1,
  "new_name": "novo-nome-da-rota"
}
```

### Excluir Rota
```bash
DELETE /database/delete-route
{
  "route_id": 1
}
```

### Verificar Token
```bash
GET /database/check-route?route=felipe
```

## 📝 Exemplo Completo

**Criar rotas:**
```bash
curl -X POST http://localhost:3000/database/set-route \
  -d '{"user_id": 1, "routes": [{"name": "joao-notifications"}]}'
```

**Listar rotas do usuário:**
```bash
curl -X GET http://localhost:3000/database/user-routes/1
```

**Gerar token automaticamente:**
```bash
curl -X PATCH http://localhost:3000/database/auth_route \
  -d '{"route_id": 1}'
```

**Excluir token da rota:**
```bash
curl -X DELETE http://localhost:3000/database/delete-token \
  -d '{"route_id": 1}'
```

**Editar nome da rota:**
```bash
curl -X PATCH http://localhost:3000/database/edit-route \
  -d '{"route_id": 1, "new_name": "joao-webhooks"}'
```

**Excluir rota:**
```bash
curl -X DELETE http://localhost:3000/database/delete-route \
  -d '{"route_id": 1}'
```

**Resposta criando rotas:**
```json
{
  "success": true,
  "message": "Rotas configuradas com sucesso.",
  "data": {
    "user_id": 1,
    "routes": [
      {
        "id": 1,
        "name": "joao-notifications",
        "token": null
      }
    ]
  }
}
```

**Resposta com token gerado:**
```json
{
  "success": true,
  "message": "Token de autenticação gerado automaticamente.",
  "route_id": 1,
  "has_token": true,
  "token": "joao_notifications_auth_1703123456789_abc123def456"
}
```

**Resposta excluindo token:**
```json
{
  "success": true,
  "message": "Token da rota removido com sucesso.",
  "route_id": 1,
  "route_name": "joao-notifications"
}
```

**Resposta listando rotas:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "first_name": "João",
    "last_name": "Silva",
    "email": "joao@exemplo.com"
  },
  "routes": [
    {
      "id": 1,
      "name": "joao-notifications",
      "has_token": true,
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:35:00Z"
    }
  ],
  "total_routes": 1
}
```

## 🛡️ Boas Práticas

- Tokens são **sempre gerados automaticamente** pela API
- Formato: `{route_name}_auth_{timestamp}_{random_bytes}`
- Mínimo 16 caracteres
- Use HTTPS em produção
- Rotacione tokens periodicamente
