# Documentação Técnica do Projeto de Notificações via API e Firebase


## Contexto do Projeto

- **Fluxo Principal:**
  1. Uma mensagem é enviada via API para o backend.
  2. O backend valida a mensagem e a rota de destino.
  3. O backend envia uma notificação para o aplicativo móvel usando o token Firebase associado à rota.
  4. O aplicativo exibe a mensagem recebida.

- **Funcionalidades Atuais:**
  - Cadastro de usuário com uma rota padrão e token Firebase associado, armazenados na tabela `users`.

- **Melhorias Propostas:**
  - Suporte a múltiplas rotas por usuário.
  - Compartilhamento de rotas entre usuários.
  - Criação de endpoints na API para gerenciar rotas e autenticação via tokens (Bearer Token opcional).
  - Nova tabela `routes` para gerenciar rotas separadamente.
  - Atualização da lógica de validação da rota `send-message` para consultar a tabela `routes` em vez da tabela `users`.
  - Suporte a envio de mensagens com tipos diferentes (texto, imagem, áudio) com campo `type` na tabela `messages`.
  - Endpoints para envio de áudio (`send-audio`) e imagem (`send-image`).
  - Endpoint para adicionar ou atualizar tokens em rotas específicas.

---

## Estrutura do Banco de Dados

### Tabela `users` (Usuários)
- **Campos:**
  - `id` (ID): Identificador único do usuário.
  - `name` (string): Nome do usuário.
  - `routes` (array de IDs): Lista de IDs das rotas associadas ao usuário (substitui o campo `route` atual).
  - Outros campos relevantes para o usuário (ex.: e-mail, data de criação, etc.).

### Tabela `routes` (Rotas)
- **Campos:**
  - `id` (ID): Identificador único da rota.
  - `users_id` (array de IDs): Referência aos usuarios da rota.
  - `name` (string): Nome da rota (ex.: "pessoal", "trabalho").
  - `token` (string): Token Firebase associado à rota para envio de notificações.

### Tabela `messages` (Mensagens)
- **Campos:**
  - `id` (ID): Identificador único da mensagem.
  - `route_id` (ID): Referência à rota destino da mensagem.
  - `type` (string): Tipo da mensagem (`text`, `image`, `audio`).
  - `content` (text): Conteúdo da mensagem (texto ou URL para imagem/áudio).
  - `created_at` (timestamp): Data e hora de criação da mensagem.

### Relacionamentos
- **Usuários e Rotas**: Um usuário pode ter várias rotas (relação 1:N). O campo `routes` na tabela `users` armazena os IDs das rotas da tabela `routes`.
- **Rotas e Mensagens**: Uma rota pode receber várias mensagens (relação 1:N). O campo `route_id` na tabela `messages` referencia a rota.

---

## Endpoints da API

### 1. Alterar rota database/create-user
- **Método:** POST
- **Endpoint:** `database/create-user`
- **Descrição:** Cria um novo usuário com uma ou mais rotas associadas.
- **Payload JSON:**
  ```json
  {
    "name": "Nome do Usuário",
    "routes": [
      {
        "name": "pessoal",
        "token": "token_route"
      }
    ]
  }
  ```
- **Validações:**
  - `name` é obrigatório e deve ser uma string não vazia.
  - Pelo menos uma rota deve ser fornecida, com `name` válido.
- **Retorno:**
  - **201 Created**: Retorna o `id` do usuário criado e os IDs das rotas criadas.
  - **400 Bad Request**: Caso os campos obrigatórios estejam ausentes ou inválidos.

### 2. Atualizar Rota databsase/check-route
- **Método:** POST
- **Endpoint:** `databsase/check-route`
- **Descrição:** Atualizar o endpoint para checkar a rota na tabela routes e nao em users
- 
- **Validações:**
  - `user_id` deve existir na tabela `users`.
  - `name` são obrigatórios e não podem ser vazios.
- **Retorno:**
  - **200 OK**: Dados da rota criada ou atualizada.
  - **404 Not Found**: Caso o `user_id` não exista.
  - **400 Bad Request**: Caso os campos obrigatórios estejam ausentes ou inválidos.

### 3. Criar endpoints para Token de Autenticação para Rota
- **Método:** PATCH
- **Endpoint:** `/database/auth_route`
- **Descrição:** Permite adicionar, atualizar ou remover um Bearer Token para autenticação de uma rota específica.
- 
- **Validações:**
  - `route_id` deve existir na tabela `routes`.
- **Retorno:**
  - **200 OK**: Confirmação da atualização do token.
  - **404 Not Found**: Caso o `route_id` não exista.
  - **400 Bad Request**: Caso o token seja inválido.

### 4. Enviar Mensagem
- **Método:** POST
- **Endpoint:** `/send-message`
- **Descrição:** Envia uma mensagem de texto para uma rota específica, validando a rota na tabela `routes`.

- **Validações:**
  - Verificar se `user_id` e `route_name` existem e estão relacionados na tabela `routes`.
  - Confirmar que `type` é `text`.
- **Fluxo:**
  1. Validar a existência da rota e sua associação com o usuário.
  2. Usar o token Firebase da rota para enviar a notificação via FCM.
  3. Salvar a mensagem na tabela `messages` com `route_id`, `type`, `content` e `created_at`.
- **Retorno:**
  - **200 OK**: Confirmação do envio.
  - **404 Not Found**: Caso a rota ou usuário não sejam encontrados.
  - **400 Bad Request**: Caso os campos sejam inválidos.

### 5. Enviar Imagem
- **Método:** POST
- **Endpoint:** `/send-image`
- **Descrição:** Envia uma mensagem contendo a URL de uma imagem para uma rota específica.
- **Payload JSON:**
  ```json
  {
    "user_id": "ID_usuario",
    "route_name": "trabalho",
    "type": "image",
    "content": "https://exemplo.com/imagem.jpg"
  }
  ```
- **Validações:**
  - Verificar se `user_id` e `route_name` existem e estão relacionados na tabela `routes`.
  - Confirmar que `type` é `image`.
  - Validar que `content` é uma URL HTTPS válida para uma imagem.
- **Fluxo:**
  - Mesmo fluxo do endpoint `/send-message`, mas com validação específica para URLs de imagem.
- **Retorno:**
  - **200 OK**: Confirmação do envio.
  - **404 Not Found**: Caso a rota ou usuário não sejam encontrados.
  - **400 Bad Request**: Caso os campos sejam inválidos ou a URL não seja válida.

### 6. Enviar Áudio
- **Método:** POST
- **Endpoint:** `/send-audio`
- **Descrição:** Envia uma mensagem contendo a URL de um arquivo de áudio para uma rota específica.
- **Payload JSON:**
  ```json
  {
    "user_id": "ID_usuario",
    "route_name": "pessoal",
    "type": "audio",
    "content": "https://exemplo.com/audio.mp3"
  }
  ```
- **Validações:**
  - Verificar se `user_id` e `route_name` existem e estão relacionados na tabela `routes`.
  - Confirmar que `type` é `audio`.
  - Validar que `content` é uma URL HTTPS válida para um arquivo de áudio.
- **Fluxo:**
  - Mesmo fluxo do endpoint `/send-message`, mas com validação específica para URLs de áudio.
- **Retorno:**
  - **200 OK**: Confirmação do envio.
  - **404 Not Found**: Caso a rota ou usuário não sejam encontrados.
  - **400 Bad Request**: Caso os campos sejam inválidos ou a URL não seja válida.

---

## Regras de Negócio

1. **Criação de Usuários:**
   - Todo usuário deve ter pelo menos uma rota padrão no momento do cadastro.
   - A rota padrão é armazenada na tabela `routes`, e o `id` da rota é referenciado no campo `routes` da tabela `users`.

2. **Gerenciamento de Rotas:**
   - Um usuário pode ter múltiplas rotas, armazenadas na tabela `routes`.
   - Rotas podem ser criadas sem autenticação (sem Bearer Token), mas o usuário pode adicionar ou atualizar um token posteriormente.
   - Rotas podem ser compartilhadas com outros usuários (a implementar, com regras específicas de permissão).

3. **Validação de Mensagens:**
   - A validação do envio de mensagens agora consulta a tabela `routes` para verificar a existência da rota e sua associação com o usuário.
   - O campo `type` na tabela `messages` define o tipo de mensagem (`text`, `image`, `audio`).
   - URLs de imagens e áudios devem ser validadas como HTTPS e acessíveis antes do envio.

4. **Autenticação de Rotas:**
   - Rotas podem ser criadas sem autenticação por padrão.
   - Um endpoint específico permite adicionar ou atualizar um Bearer Token para autenticação de uma rota.

---

## Considerações Técnicas para Automação (Cursor)

- **Autenticação da API:**
  - Se necessário, incluir cabeçalhos HTTP com tokens de autenticação (ex.: `Authorization: Bearer <token>`).
  - Para rotas autenticadas, validar o Bearer Token antes de processar a requisição.

- **Formato JSON:**
  - Garantir que todos os payloads sejam bem formatados e sigam os tipos de dados esperados (strings, IDs, URLs válidas).
  - Usar bibliotecas de validação JSON (ex.: Joi ou Yup no backend) para verificar payloads antes do processamento.

- **Controle de Erros:**
  - Tratar respostas HTTP:
    - `200 OK`: Sucesso na operação.
    - `201 Created`: Sucesso na criação de recursos.
    - `400 Bad Request`: Dados inválidos no payload.
    - `404 Not Found`: Usuário ou rota não encontrados.
    - `500 Internal Server Error`: Erros internos do servidor.
  - Implementar logs detalhados para auditoria e depuração.

- **Persistência de IDs:**
  - Armazenar `user_id` e `route_id` retornados pelos endpoints para uso em chamadas subsequentes.
  - Garantir que os IDs sejam salvos em um formato acessível pelo agente automatizado.

- **Timeouts e Retentativas:**
  - Configurar timeouts para chamadas à API (ex.: 10 segundos).
  - Implementar mecanismo de retentativas (ex.: 3 tentativas com intervalo de 2 segundos) em caso de falhas temporárias (ex.: `503 Service Unavailable`).

- **Validações Adicionais:**
  - Verificar a existência de `user_id` e `route_name` antes de enviar mensagens.
  - Validar URLs de imagens e áudios (ex.: extensão `.jpg`, `.png`, `.mp3`, e acessibilidade via HEAD request).
  - Garantir que o token Firebase seja válido antes de enviar notificações.

---

## Fluxo de Automação (Exemplo para Cursor)

1. **Criar Usuário:**
   - Enviar POST para `/users` com nome e rota padrão.
   - Armazenar `user_id` e `route_id` retornados.

2. **Adicionar Nova Rota:**
   - Enviar POST para `/users/{user_id}/routes` com nova rota e token.
   - Armazenar `route_id` retornado.

3. **Adicionar Token de Autenticação (Opcional):**
   - Enviar PATCH para `/routes/{route_id}/token` com um Bearer Token.
   - Confirmar sucesso da operação.

4. **Enviar Mensagem de Texto:**
   - Enviar POST para `/send-message` com `user_id`, `route_name`, `type: "text"`, e conteúdo.
   - Verificar resposta `200 OK`.

5. **Enviar Imagem:**
   - Enviar POST para `/send-image` com `user_id`, `route_name`, `type: "image"`, e URL válida.
   - Verificar resposta `200 OK`.

6. **Enviar Áudio:**
   - Enviar POST para `/send-audio` com `user_id`, `route_name`, `type: "audio"`, e URL válida.
   - Verificar resposta `200 OK`.

7. **Logs e Monitoramento:**
   - Registrar todas as chamadas, respostas e erros em um sistema de logs.
   - Monitorar o status das notificações enviadas via Firebase.

---

## Possíveis Melhorias Futuras

- **Autenticação e Autorização:**
  - Implementar autenticação obrigatória para todos os endpoints da API.
  - Adicionar suporte a permissões granulares para compartilhamento de rotas.

- **Suporte a Múltiplos Dispositivos:**
  - Permitir múltiplos tokens Firebase por rota para suportar vários dispositivos.

- **Gerenciamento de Usuários e Rotas:**
  - Criar uma interface (API ou UI) para gerenciamento de usuários, rotas e tokens.

- **Agendamento de Mensagens:**
  - Adicionar suporte a mensagens agendadas, com armazenamento temporário e envio programado.

- **Validação Avançada de Arquivos:**
  - Implementar verificações de tamanho, formato e integridade para imagens e áudios antes do envio.