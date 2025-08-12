# Sistema de Email - Easy Notifications API

## 📧 Visão Geral

Este módulo implementa um sistema completo de gerenciamento de senhas através de email, incluindo:
- **Definição de senha**: Para usuários que nunca definiram uma senha local
- **Redefinição de senha**: Para usuários que esqueceram sua senha
- **Sistema de tokens seguros**: Tokens JWT com expiração de 15 minutos
- **Rate limiting**: Proteção contra spam e ataques
- **Logs de auditoria**: Rastreamento completo de todas as operações

## 🚀 Instalação e Configuração

### 1. Dependências
```bash
npm install @sendgrid/mail jsonwebtoken
```

### 2. Variáveis de Ambiente
Crie um arquivo `.env` com as seguintes variáveis:
```bash
# SendGrid
SENDGRID_API_KEY=your_sendgrid_api_key_here
FROM_EMAIL=pass@easynotificationspost.dev

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Banco de dados (já configurado)
DB_NAME=your_database_name
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_HOST=localhost
DB_PORT=5432
```

### 3. Configuração do Banco de Dados
Execute o script de configuração:
```bash
node setup_email_system.js
```

## 📋 Endpoints Disponíveis

### 1. Solicitar Definição de Senha
```http
POST /email/request-local-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**Resposta de Sucesso:**
```json
{
  "success": true,
  "message": "Email de definição de senha enviado com sucesso.",
  "email": "user@example.com"
}
```

### 2. Solicitar Redefinição de Senha
```http
POST /email/request-password-reset
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**Resposta de Sucesso:**
```json
{
  "success": true,
  "message": "Email de redefinição de senha enviado com sucesso.",
  "email": "user@example.com"
}
```

### 3. Definir Nova Senha
```http
POST /email/set-password
Content-Type: application/json

{
  "token": "jwt-token-here",
  "email": "user@example.com",
  "password": "NovaSenha123!",
  "confirmPassword": "NovaSenha123!"
}
```

### 4. Redefinir Senha
```http
POST /email/reset-password
Content-Type: application/json

{
  "token": "jwt-token-here",
  "email": "user@example.com",
  "password": "NovaSenha123!",
  "confirmPassword": "NovaSenha123!"
}
```

### 5. Verificar Token
```http
GET /email/verify-token?token=jwt-token-here&email=user@example.com&type=set
```

## 🔒 Segurança

### Rate Limiting
- **Por email**: Máximo 3 solicitações por hora
- **Por IP**: Máximo 10 solicitações por hora
- **Headers de resposta**:
  - `X-RateLimit-Limit`: Limite máximo
  - `X-RateLimit-Remaining`: Requisições restantes
  - `X-RateLimit-Reset`: Horário de reset

### Validação de Senha
- **Mínimo**: 8 caracteres
- **Obrigatório**: Pelo menos 1 número
- **Obrigatório**: Pelo menos 1 caractere especial
- **Confirmação**: Senhas devem coincidir

### Tokens JWT
- **Expiração**: 15 minutos
- **Algoritmo**: HS256
- **Payload**: email, type, iat, exp
- **Verificação**: Dupla verificação (JWT + banco de dados)

## 📧 Templates de Email

### Email de Definição de Senha
- **Assunto**: "Defina sua senha - Easy Notifications"
- **Cor**: Azul (#007bff)
- **Link**: `https://seudominio.com/set-password?token=ABC123&email=user@email.com`

### Email de Redefinição de Senha
- **Assunto**: "Redefina sua senha - Easy Notifications"
- **Cor**: Vermelho (#dc3545)
- **Link**: `https://seudominio.com/reset-password?token=ABC123&email=user@email.com`

## 🗄️ Estrutura do Banco de Dados

### Tabela: `password_tokens`
```sql
CREATE TABLE password_tokens (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    token TEXT NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('set', 'reset')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE NULL,
    
    CONSTRAINT idx_password_tokens_email_type UNIQUE (email, type),
    CONSTRAINT idx_password_tokens_token UNIQUE (token)
);
```

## 🔄 Fluxo de Funcionamento

### Cenário 1: Usuário sem Senha Local
1. Usuário tenta login local
2. Sistema verifica se tem senha no banco
3. Se não tiver, abre modal para solicitar email
4. Usuário insere email da conta
5. API envia email com link para definição
6. Usuário clica no link e define senha

### Cenário 2: Usuário Esqueceu a Senha
1. Usuário clica em "Esqueceu sua senha?"
2. Modal abre para inserir email da conta
3. Usuário insere email
4. API envia email com link para redefinição
5. Usuário clica no link e redefine senha

## 🧪 Testes

### Executar Testes Automáticos
```bash
node test_email_endpoints.js
```

### Testes Manuais
1. **Inicie o servidor**: `npm run dev`
2. **Configure as variáveis de ambiente**
3. **Execute o setup do banco**: `node setup_email_system.js`
4. **Teste os endpoints** usando Postman ou similar

## 📝 Logs e Auditoria

### Logs Gerados
- Solicitações de definição/redefinição de senha
- Envio de emails (sucesso/erro)
- Tentativas de uso de tokens
- Rate limiting excedido
- Erros de validação

### Informações Registradas
- Email do usuário
- IP de origem
- User-Agent
- Timestamp
- Resultado da operação
- Detalhes de erro (se houver)

## 🚨 Tratamento de Erros

### Códigos de Status HTTP
- **200**: Sucesso
- **400**: Dados inválidos ou token expirado
- **404**: Email não encontrado
- **429**: Rate limit excedido
- **500**: Erro interno do servidor

### Mensagens de Erro
- Validação de entrada
- Token inválido ou expirado
- Usuário não encontrado
- Erro no envio de email
- Rate limiting

## 🔧 Configuração Avançada

### Personalização de URLs
Edite o arquivo `services/emailService.js`:
```javascript
const setPasswordUrl = `https://seudominio.com/set-password?token=${token}&email=${encodeURIComponent(email)}`;
const resetPasswordUrl = `https://seudominio.com/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
```

### Personalização de Templates
Os templates HTML estão no arquivo `services/emailService.js` e podem ser personalizados conforme necessário.

### Configuração de Rate Limiting
Edite o arquivo `middleware/rateLimiter.js` para ajustar os limites:
```javascript
const emailRateLimiter = createRateLimiter({
    maxRequests: 3,        // Requisições por email
    windowMs: 60 * 60 * 1000, // Janela de tempo (1 hora)
    keyGenerator: 'email'
});
```

## 📚 Arquivos do Sistema

- `services/emailService.js` - Serviço principal de email
- `middleware/rateLimiter.js` - Middleware de rate limiting
- `routes/email.js` - Rotas da API
- `create_password_tokens_table.sql` - Script SQL para criação da tabela
- `setup_email_system.js` - Script de configuração
- `test_email_endpoints.js` - Script de testes
- `ENVIRONMENT_VARIABLES.md` - Documentação das variáveis de ambiente

## 🎯 Próximos Passos

1. **Configurar domínio real** nos templates de email
2. **Implementar sistema de templates** mais robusto
3. **Adicionar métricas** de envio de emails
4. **Implementar retry automático** para emails falhados
5. **Adicionar suporte a múltiplos idiomas**

## 🆘 Suporte

Para dúvidas ou problemas:
1. Verifique os logs do servidor
2. Confirme as variáveis de ambiente
3. Teste a conectividade com SendGrid
4. Verifique a estrutura do banco de dados
