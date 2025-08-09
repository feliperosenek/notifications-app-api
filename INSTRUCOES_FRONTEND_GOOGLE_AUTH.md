# 📱 Instruções para Implementar Google Auth no Frontend

## 🔑 **Credenciais que você precisa usar**

### Para App Android:
- **Android Client ID**: `517854389633-qio4bn2qtbe4tmget5puhv5f2m5g4v7c.apps.googleusercontent.com`
- **Web Client ID**: `517854389633-a3tcfbpq7o76khkl0kr2f472igbog4tf.apps.googleusercontent.com`

### Para Web/React:
- **Web Client ID**: `517854389633-a3tcfbpq7o76khkl0kr2f472igbog4tf.apps.googleusercontent.com`

## 🎯 **O que o frontend precisa fazer**

### 1. **Configurar Google Sign-In**
- Use o **Web Client ID** na configuração do Google Sign-In
- Solicite `idToken` na configuração (muito importante!)
- Configure para solicitar email e perfil do usuário

### 2. **Quando usuário clicar no botão Google**
- Abrir popup/tela de login do Google
- Google vai retornar um `idToken` (string longa)
- Este `idToken` é o que você precisa enviar para a API

### 3. **Enviar para sua API (2 opções)**

#### **Opção A - Fluxo ID Token (simples):**
- **URL**: `http://192.168.0.103:3200/auth/google-login`
- **Método**: `POST`
- **Content-Type**: `application/json`
- **Body**: 
```json
{
  "idToken": "o_token_que_o_google_retornou"
}
```

#### **Opção B - Fluxo Authorization Code (recomendado):**
- **URL**: `http://localhost:3200/auth/google-callback` (use localhost, não IP)
- **Método**: `POST`
- **Content-Type**: `application/json`
- **Body**: 
```json
{
  "code": "o_codigo_que_o_google_retornou",
  "redirect_uri": "http://localhost:3200/auth/callback",
  "device_id": "id_unico_do_dispositivo",
  "device_name": "nome_do_dispositivo"
}
```

### 4. **Resposta da API (se sucesso)**
```json
{
  "success": true,
  "message": "Login com Google realizado com sucesso.",
  "user": {
    "id": 123,
    "firstName": "João",
    "lastName": "Silva",
    "email": "joao@gmail.com",
    "profilePicture": "https://...",
    "authProvider": "google",
    "isVerified": true
  },
  "token": "jwt_token_para_usar_nas_proximas_chamadas"
}
```

### 5. **Salvar dados do usuário**
- Salvar o `token` (JWT) para usar em próximas chamadas à API
- Salvar dados do `user` para mostrar na interface
- Redirecionar usuário para tela principal

## 🔧 **Outras rotas da API que você pode usar**

### Verificar se token ainda é válido:
- **URL**: `http://192.168.0.103:3200/auth/verify-token`
- **Método**: `POST`
- **Body**: `{"token": "seu_jwt_token"}`

### Renovar token:
- **URL**: `http://192.168.0.103:3200/auth/refresh-token`
- **Método**: `POST`
- **Body**: `{"token": "seu_jwt_token_atual"}`

### Logout:
- **URL**: `http://192.168.0.103:3200/auth/logout`
- **Método**: `POST`
- **Body**: `{"token": "seu_jwt_token"}` (opcional)

## ⚠️ **IMPORTANTE - Pontos críticos**

### ✅ **FAÇA ISSO:**
1. **Use sempre o Web Client ID** (`517854389633-a3tcfbpq7o76khkl0kr2f472igbog4tf.apps.googleusercontent.com`)
2. **Solicite idToken** na configuração do Google Sign-In
3. **Envie apenas o idToken** para a API (não outros dados)
4. **Salve o JWT token** retornado pela API para próximas chamadas
5. **Configure o IP correto** da sua API (substitua `SEU_IP` pelo IP real)

### ❌ **NÃO FAÇA:**
1. Não use o Android Client ID em apps web
2. Não tente validar o idToken no frontend
3. Não envie senha junto com Google login
4. Não esqueça de configurar CORS na API se necessário

## 🔍 **Como testar se está funcionando**

### 1. **Teste manual da API primeiro:**
```bash
# No terminal/Postman, teste se a API responde:
POST http://localhost:3200/auth/google-login
Content-Type: application/json

{
  "idToken": "token_invalido_para_teste"
}

# Deve retornar erro 401 com mensagem sobre token inválido
```

### 2. **Fluxo completo:**
1. Usuário clica no botão Google
2. Google abre popup/tela de login
3. Usuário faz login no Google
4. Google retorna idToken para seu app
5. Seu app envia idToken para `POST /auth/google-login`
6. API valida com Google e retorna JWT + dados do usuário
7. Seu app salva JWT e redireciona usuário

## 📝 **Configurações necessárias no Google Console**

### Para Web:
- **Origens JavaScript autorizadas**: `http://localhost:3000`, `http://localhost:3200`, `https://seudominio.com`
- **URIs de redirecionamento**: Configurar conforme sua aplicação

### Para Android:
- **Nome do pacote**: `com.seuapp.notifications` (ou o que você usar)
- **SHA-1 fingerprint**: Obter do seu certificado Android e configurar

## 🎯 **Resumo do que implementar**

1. **Botão "Entrar com Google"** na tela de login
2. **Configuração do Google Sign-In** com Web Client ID
3. **Função para enviar idToken** para a API
4. **Salvar JWT token** retornado pela API  
5. **Usar JWT token** em chamadas subsequentes para a API
6. **Tela de perfil** mostrando dados do usuário
7. **Botão de logout** que limpa os dados salvos

## 🔧 **URLs da sua API**

- **Base URL**: `http://SEU_IP:3200`
- **Google Login**: `/auth/google-login`
- **Verificar Token**: `/auth/verify-token`  
- **Renovar Token**: `/auth/refresh-token`
- **Logout**: `/auth/logout`
- **Login Tradicional**: `/auth/login` (ainda funciona)

## 📞 **Se algo não funcionar**

### Erros comuns:
- **"Token inválido"**: Verifique se está usando Web Client ID correto
- **"Conexão recusada"**: Verifique IP e porta da API
- **CORS Error**: Configure CORS na API para aceitar seu domínio
- **"Client ID não configurado"**: Verifique credenciais no Google Console

### Para debug:
- Verifique se a API está rodando na porta 3200
- Teste as rotas da API com Postman primeiro
- Verifique logs do navegador/app para erros
- Confirme que o idToken está sendo gerado pelo Google
