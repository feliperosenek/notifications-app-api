## 🔌 **API (Backend)**

### **Rotas e Endpoints**

### **Sistema de Emails (Sendgrid)**
- **Configuração**: 
  - Credenciais Sendgrid configuradas com token
  - Use @sendgrid/mail
  - Crie um novo modulo email com as rotas necessárias.
  - O email usado para o envio deve ser pass@easynotificationspost.dev
  - A chave key do sendgrid deve ser configurada na variável de ambiente SENDGRID_API_KEY
- **Funcionalidades**:
  - Envio de emails de definição de senha
  - Envio de emails de redefinição de senha

#### 1. **Solicitar Definição de Senha**
```
POST /auth/request-local-password
```
- **Função**: Enviar email com link para definição
- **Processo**:
  - Gerar token único e temporário
  - Enviar email com link contendo token
- **Segurança**: Rate limiting por email

#### 1.1. **Solicitar Redefinição de Senha**
```
POST /auth/request-password-reset
```
- **Função**: Enviar email com link para redefinição de senha
- **Processo**:
  - Gerar token único e temporário
  - Salvar token no banco com expiração
  - Enviar email com link para redefinição
- **Segurança**: Rate limiting por email

### **Funcionalidades de Segurança**

#### 1. **Geração de Tokens**
- **Formato**: JWT ou token único
- **Expiração**: 15 minutos
- Ao acessar o link, deve verificar se o token tem mais de 15minutos do que foi criado. Insira a data no token se for possivel, se não for possivel insira a data como parametro criptografado.

#### 2. **Sistema de Emails**
- **Template**: Email profissional com link seguro
- **Link**: `https://seudominio.com/set-password?token=ABC123&email=user@email.com`
- **Validação**: Token único por solicitação
- **Provedor**: Sendgrid
- **Configuração**: 
  - Templates HTML para definição e redefinição de senha
  - Configuração de domínio verificado
  - Rate limits e configurações de entrega

#### 3. **Rate Limiting**
- **Por email**: Máximo 3 solicitações por hora
- **Por IP**: Máximo 10 solicitações por hora
- **Bloqueio**: Temporário em caso de abuso

#### 4. **Auditoria e Logs**
- **Registro**: Todas as tentativas de definição de senha
- **Rastreamento**: IP, timestamp, email, resultado
- **Alertas**: Tentativas suspeitas ou falhas

---

## 🔄 **Fluxo de Funcionamento**

### **Cenário 1: Usuário sem Senha Local**
1. Usuário tenta login local
2. Sistema verifica se tem senha no banco
3. Se não tiver, abre modal para solicitar email
4. Usuário insere email da conta
5. API envia email com link para definição
6. Usuário clica no link e define senha ao voltar no app e faz login

### **Cenário 1.1: Usuário Esqueceu a Senha**
1. Usuário clica em "Esqueceu sua senha?"
2. Modal abre para inserir email da conta
3. Usuário insere email
4. API envia email com link para redefinição
5. Usuário clica no link e redefine senha no app e faz login

### **Cenário 2: Usuário com Senha Local**
1. Usuário faz login local normalmente
2. Sistema valida email e senha
3. Login bem-sucedido

### **Cenário 3: Login Google**
1. Usuário faz login via Google
2. Sistema valida token do Google
3. Login bem-sucedido (independente de ter senha local)

---

## 🛡️ **Considerações de Segurança**

### **Proteções Implementadas**
- **Tokens únicos**: Cada solicitação gera token diferente
- **Expiração**: Tokens expiram em 15 minutos
- **Rate limiting**: Previne spam e ataques
- **Validação dupla**: Token + email para confirmação
- **Hash de senha**: Senhas nunca armazenadas em texto plano

### **Validações de Entrada**
- **Email**: Formato válido e existente no banco
- **Senha**: Mínimo 8 caracteres, especial + número
- **Token**: Formato válido e não expirado
- **Confirmação**: Senhas devem coincidir