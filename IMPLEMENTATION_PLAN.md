# 📋 PLANO DE IMPLEMENTAÇÃO - ROTAS DE MÍDIA

## 🎯 **OBJETIVO**
Implementar rotas para envio de imagens e áudios através da API, integrando com Google Cloud Storage para armazenamento dos arquivos.

---

## 🚀 **ROTAS A IMPLEMENTAR**

### **1. Rota: POST /send-image**
- **Endpoint**: `/send-image`
- **Método**: POST
- **Content-Type**: `multipart/form-data`
- **Body**: JSON + arquivo de imagem

#### **Campos obrigatórios:**
```json
{
  "message": "teste",
  "type": "info", 
  "category": "n8n",
  "route": "felipe",
  "channel": "N8N",
  "content": {"felipee":"xxxx"},
  "custom_attributes": {
    "url": "teste"
  },
  "image": "[ARQUIVO_DE_IMAGEM]"
}
```

#### **Validações específicas:**
- ✅ **Tamanho máximo**: 5MB
- ✅ **Formatos aceitos**: jpg, jpeg, png, gif, webp, bmp
- ❌ **Formatos rejeitados**: pdf, doc, txt, etc.
- ✅ **MIME types válidos**: image/*

---

### **2. Rota: POST /send-audio**
- **Endpoint**: `/send-audio`
- **Método**: POST
- **Content-Type**: `multipart/form-data`
- **Body**: JSON + arquivo de áudio

#### **Campos obrigatórios:**
```json
{
  "message": "teste",
  "type": "info",
  "category": "n8n", 
  "route": "felipe",
  "channel": "N8N",
  "content": {"felipee":"xxxx"},
  "custom_attributes": {
    "url": "teste"
  },
  "audio": "[ARQUIVO_DE_AUDIO]"
}
```

#### **Validações específicas:**
- ✅ **Tamanho máximo**: 30MB
- ✅ **Formatos aceitos**: mp3, wav
- ❌ **Formatos rejeitados**: outros formatos de áudio
- ✅ **MIME types válidos**: audio/*

---

## ☁️ **GOOGLE CLOUD STORAGE**

### **Configuração:**
- **Bucket**: `easynotificationspost-assets`
- **Estrutura de pastas**:
  ```
  easynotificationspost-assets/
  ├── images/
  │   └── {route_name}/
  │       ├── imagem1.jpg
  │       ├── imagem2.png
  │       └── ...
  └── audios/
      └── {route_name}/
          ├── audio1.mp3
          ├── audio2.wav
          └── ...
  ```

### **Sistema de Pastas Automático:**
O sistema automaticamente:
1. **Verifica** se a pasta da rota existe no bucket
2. **Cria** a pasta se ela não existir
3. **Insere** o arquivo na pasta correta
4. **Organiza** arquivos por tipo (images/audios) e rota

**Exemplo de criação automática:**
- Primeira imagem para rota "felipe" → cria `images/felipe/`
- Primeiro áudio para rota "felipe" → cria `audios/felipe/`
- Arquivos subsequentes são inseridos nas pastas existentes

### **Variáveis de ambiente necessárias:**
```env
# Google Cloud Storage
GOOGLE_CLOUD_PROJECT_ID=seu-projeto-id
GOOGLE_CLOUD_PRIVATE_KEY_ID=sua-private-key-id
GOOGLE_CLOUD_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_CLOUD_CLIENT_EMAIL=seu-service-account@projeto.iam.gserviceaccount.com
GOOGLE_CLOUD_CLIENT_ID=seu-client-id
GOOGLE_CLOUD_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/...
```

---

## 📦 **DEPENDÊNCIAS NECESSÁRIAS**

### **Instalar:**
```bash
npm install @google-cloud/storage multer
```

### **Dependências:**
- **`@google-cloud/storage`**: Cliente oficial do Google Cloud Storage
- **`multer`**: Middleware para processar multipart/form-data

---

## 🏗️ **ESTRUTURA DE IMPLEMENTAÇÃO**

### **1. Configuração do Google Cloud Storage**
```javascript
// services/googleStorageService.js
const { Storage } = require('@google-cloud/storage');

class GoogleStorageService {
  constructor() {
    this.storage = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      credentials: {
        private_key_id: process.env.GOOGLE_CLOUD_PRIVATE_KEY_ID,
        private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
        client_id: process.env.GOOGLE_CLOUD_CLIENT_ID,
        client_x509_cert_url: process.env.GOOGLE_CLOUD_CLIENT_X509_CERT_URL
      }
    });
    
    this.bucket = this.storage.bucket('easynotificationspost-assets');
  }

  /**
   * Verifica se uma pasta existe no bucket
   * @param {string} folderPath - Caminho da pasta (ex: 'images/felipe/')
   * @returns {Promise<boolean>}
   */
  async folderExists(folderPath) {
    try {
      const [files] = await this.bucket.getFiles({
        prefix: folderPath,
        maxResults: 1
      });
      return files.length > 0;
    } catch (error) {
      console.error('Erro ao verificar existência da pasta:', error);
      return false;
    }
  }

  /**
   * Cria uma pasta no bucket (criando um arquivo vazio como marcador)
   * @param {string} folderPath - Caminho da pasta (ex: 'images/felipe/')
   * @returns {Promise<boolean>}
   */
  async createFolder(folderPath) {
    try {
      const file = this.bucket.file(`${folderPath}.folder-marker`);
      await file.save('', {
        metadata: {
          contentType: 'application/x-directory'
        }
      });
      console.log(`Pasta criada: ${folderPath}`);
      return true;
    } catch (error) {
      console.error('Erro ao criar pasta:', error);
      return false;
    }
  }

  /**
   * Garante que a pasta existe, criando se necessário
   * @param {string} folderPath - Caminho da pasta
   * @returns {Promise<boolean>}
   */
  async ensureFolderExists(folderPath) {
    const exists = await this.folderExists(folderPath);
    if (!exists) {
      return await this.createFolder(folderPath);
    }
    return true;
  }

  /**
   * Faz upload de um arquivo para o bucket
   * @param {Buffer} fileBuffer - Buffer do arquivo
   * @param {string} destination - Caminho de destino no bucket
   * @param {string} contentType - Tipo MIME do arquivo
   * @returns {Promise<{success: boolean, url?: string, error?: string}>}
   */
  async uploadFile(fileBuffer, destination, contentType) {
    try {
      // Garantir que a pasta de destino existe
      const folderPath = destination.substring(0, destination.lastIndexOf('/') + 1);
      await this.ensureFolderExists(folderPath);

      // Fazer upload do arquivo
      const file = this.bucket.file(destination);
      await file.save(fileBuffer, {
        metadata: {
          contentType: contentType
        }
      });

      // Tornar o arquivo público (opcional)
      await file.makePublic();

      const url = `https://storage.googleapis.com/${this.bucket.name}/${destination}`;
      
      return {
        success: true,
        url: url
      };
    } catch (error) {
      console.error('Erro no upload:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = GoogleStorageService;
```

### **2. Middleware de Upload**
```javascript
// middleware/uploadMiddleware.js
const multer = require('multer');

// Middleware para processar arquivos de imagem
const imageUpload = multer({
  storage: multer.memoryStorage(), // Armazena temporariamente na memória
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos de imagem são permitidos'), false);
    }
  }
});

// Middleware para processar arquivos de áudio
const audioUpload = multer({
  storage: multer.memoryStorage(), // Armazena temporariamente na memória
  limits: {
    fileSize: 30 * 1024 * 1024 // 30MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos de áudio são permitidos'), false);
    }
  }
});

module.exports = {
  imageUpload,
  audioUpload
};
```

### **3. Atualização da função processMessageSend**

Para que as novas colunas `image_url` e `audio_url` sejam salvas no banco, é necessário atualizar a função `processMessageSend` existente:

```javascript
// Na função processMessageSend, atualizar a query de INSERT:
const [insertResult] = await sequelize.query(
  `INSERT INTO messages (
      message, type, category, route, channel, content, custom_attributes, 
      route_id, user_id, datetime, status, image_url, audio_url
  ) VALUES (
      :message, :type, :category, :route, :channel, :content, :custom_attributes,
      :route_id, :user_id, NOW(), 'active', :image_url, :audio_url
  ) RETURNING *`,
  {
    replacements: {
      message,
      type,
      category,
      route,
      channel,
      content: content.trim(),
      custom_attributes: custom_attributes ? JSON.stringify(custom_attributes) : null,
      route_id: routeData.id,
      user_id: userData.id,
      image_url: req.body.image_url || null,
      audio_url: req.body.audio_url || null
    }
  }
);
```

### **4. Rotas Atualizadas**
```javascript
// routes/sendMessage.js
const GoogleStorageService = require('../services/googleStorageService');
const { imageUpload, audioUpload } = require('../middleware/uploadMiddleware');

// Instanciar serviço do Google Cloud Storage
const googleStorage = new GoogleStorageService();

// Rota para envio de imagem
router.post('/send-image', messageRateLimit, imageUpload.single('image'), async (req, res) => {
  try {
    // Validar se arquivo foi enviado
    if (!req.file) {
      return res.status(400).json({
        error: 'Arquivo de imagem é obrigatório'
      });
    }

    // Validar campos obrigatórios
    const { message, type, category, route, channel, content, custom_attributes } = req.body;
    const requiredFields = ['message', 'type', 'category', 'route', 'channel', 'content'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: `Campos obrigatórios ausentes: ${missingFields.join(', ')}`
      });
    }

    // Preparar nome do arquivo e caminho no bucket
    const timestamp = Date.now();
    const extension = req.file.originalname.split('.').pop();
    const fileName = `${timestamp}.${extension}`;
    const destination = `images/${route}/${fileName}`;

    // Fazer upload para o Google Cloud Storage
    const uploadResult = await googleStorage.uploadFile(
      req.file.buffer,
      destination,
      req.file.mimetype
    );

    if (!uploadResult.success) {
      return res.status(500).json({
        error: 'Erro ao fazer upload da imagem',
        details: uploadResult.error
      });
    }

    // Adicionar URL da imagem ao content
    const contentWithImage = {
      ...JSON.parse(content),
      image_url: uploadResult.url,
      image_filename: fileName
    };

    // Atualizar req.body para incluir a URL da imagem
    req.body.image_url = uploadResult.url;
    req.body.content = JSON.stringify(contentWithImage);

    // Processar envio da mensagem
    await processMessageSend(req, res, type, JSON.stringify(contentWithImage), route);
    
  } catch (error) {
    logger.error('Erro ao processar upload de imagem', {
      error: error.message,
      body: req.body
    });

    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// Rota para envio de áudio
router.post('/send-audio', messageRateLimit, audioUpload.single('audio'), async (req, res) => {
  try {
    // Validar se arquivo foi enviado
    if (!req.file) {
      return res.status(400).json({
        error: 'Arquivo de áudio é obrigatório'
      });
    }

    // Validar campos obrigatórios
    const { message, type, category, route, channel, content, custom_attributes } = req.body;
    const requiredFields = ['message', 'type', 'category', 'route', 'channel', 'content'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: `Campos obrigatórios ausentes: ${missingFields.join(', ')}`
      });
    }

    // Preparar nome do arquivo e caminho no bucket
    const timestamp = Date.now();
    const extension = req.file.originalname.split('.').pop();
    const fileName = `${timestamp}.${extension}`;
    const destination = `audios/${route}/${fileName}`;

    // Fazer upload para o Google Cloud Storage
    const uploadResult = await googleStorage.uploadFile(
      req.file.buffer,
      destination,
      req.file.mimetype
    );

    if (!uploadResult.success) {
      return res.status(500).json({
        error: 'Erro ao fazer upload do áudio',
        details: uploadResult.error
      });
    }

    // Adicionar URL do áudio ao content
    const contentWithAudio = {
      ...JSON.parse(content),
      audio_url: uploadResult.url,
      audio_filename: fileName
    };

    // Atualizar req.body para incluir a URL do áudio
    req.body.audio_url = uploadResult.url;
    req.body.content = JSON.stringify(contentWithAudio);

    // Processar envio da mensagem
    await processMessageSend(req, res, type, JSON.stringify(contentWithAudio), route);
    
  } catch (error) {
    logger.error('Erro ao processar upload de áudio', {
      error: error.message,
      body: req.body
    });

    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});
```

---

## 🔧 **CONFIGURAÇÃO DO SERVICE ACCOUNT**

### **1. Criar arquivo de credenciais temporário**
```javascript
// scripts/generateCredentials.js
const fs = require('fs');

const credentials = {
  type: "service_account",
  project_id: process.env.GOOGLE_CLOUD_PROJECT_ID,
  private_key_id: process.env.GOOGLE_CLOUD_PRIVATE_KEY_ID,
  private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
  client_id: process.env.GOOGLE_CLOUD_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.GOOGLE_CLOUD_CLIENT_X509_CERT_URL
};

fs.writeFileSync('./temp-credentials.json', JSON.stringify(credentials, null, 2));
console.log('Arquivo de credenciais temporário criado: temp-credentials.json');
```

### **2. Executar script**
```bash
node scripts/generateCredentials.js
```

---

## 📊 **ESTRUTURA DO BANCO DE DADOS**

### **1. Novas colunas na tabela messages:**
```sql
-- Adicionar colunas para URLs dos arquivos de mídia
ALTER TABLE messages 
ADD COLUMN image_url VARCHAR(500),
ADD COLUMN audio_url VARCHAR(500);

-- Índices para performance nas novas colunas
CREATE INDEX idx_messages_image_url ON messages(image_url);
CREATE INDEX idx_messages_audio_url ON messages(audio_url);
```

### **2. Nova tabela para rastrear arquivos de mídia (opcional):**
```sql
CREATE TABLE media_files (
    id SERIAL PRIMARY KEY,
    message_id INTEGER REFERENCES messages(id),
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    media_type VARCHAR(20) NOT NULL CHECK (media_type IN ('image', 'audio')),
    gcs_url VARCHAR(500) NOT NULL,
    route_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_media_files_message_id ON media_files(message_id);
CREATE INDEX idx_media_files_route_name ON media_files(route_name);
CREATE INDEX idx_media_files_media_type ON media_files(media_type);
```

### **3. Como as URLs são salvas:**
- **`image_url`**: URL completa da imagem no Google Cloud Storage
  - Exemplo: `https://storage.googleapis.com/easynotificationspost-assets/images/felipe/1703123456789.jpg`
- **`audio_url`**: URL completa do áudio no Google Cloud Storage
  - Exemplo: `https://storage.googleapis.com/easynotificationspost-assets/audios/felipe/1703123456789.mp3`

**Vantagens desta abordagem:**
- ✅ **Acesso direto** aos arquivos via URL
- ✅ **Rastreabilidade** completa das mensagens com mídia
- ✅ **Performance** otimizada para consultas
- ✅ **Compatibilidade** com sistema existente

---

## 🧪 **TESTES**

### **1. Teste de upload de imagem:**
```bash
curl -X POST http://localhost:3000/send-image \
  -F "message=Teste com imagem" \
  -F "type=info" \
  -F "category=test" \
  -F "route=felipe" \
  -F "channel=TEST" \
  -F "content={\"test\":\"value\"}" \
  -F "custom_attributes={\"url\":\"teste\"}" \
  -F "image=@/path/to/image.jpg"
```

### **2. Teste de upload de áudio:**
```bash
curl -X POST http://localhost:3000/send-audio \
  -F "message=Teste com áudio" \
  -F "type=info" \
  -F "category=test" \
  -F "route=felipe" \
  -F "channel=TEST" \
  -F "content={\"test\":\"value\"}" \
  -F "custom_attributes={\"url\":\"teste\"}" \
  -F "audio=@/path/to/audio.mp3"
```

---

## 📝 **LOGS E MONITORAMENTO**

### **Logs específicos para uploads:**
```javascript
logger.info('Upload de arquivo processado com sucesso', {
  messageId: insertedMessage.id,
  route: routeData.name,
  mediaType: req.file.mimetype.startsWith('image/') ? 'image' : 'audio',
  fileName: req.file.filename,
  fileSize: req.file.size,
  gcsUrl: req.file.path,
  bucket: 'easynotificationspost-assets'
});
```

---

## 🚨 **TRATAMENTO DE ERROS**

### **Erros comuns e soluções:**
1. **Arquivo muito grande**: Retornar erro 413 (Payload Too Large)
2. **Formato inválido**: Retornar erro 400 (Bad Request)
3. **Falha no upload**: Retornar erro 500 (Internal Server Error)
4. **Bucket não encontrado**: Verificar configuração do GCS
5. **Credenciais inválidas**: Verificar variáveis de ambiente

---

## 🔄 **PRÓXIMOS PASSOS**

### **Fase 1: Configuração básica**
- [ ] Instalar dependências
- [ ] Configurar Google Cloud Storage
- [ ] Criar middleware de upload
- [ ] Implementar rotas básicas

### **Fase 2: Integração**
- [ ] Integrar com sistema de mensagens existente
- [ ] Adicionar logs e monitoramento
- [ ] Implementar tratamento de erros

### **Fase 3: Testes e otimização**
- [ ] Testes de upload
- [ ] Validação de formatos
- [ ] Testes de performance
- [ ] Documentação da API

---

## 📚 **REFERÊNCIAS**

- [Google Cloud Storage Node.js Client](https://cloud.google.com/storage/docs/reference/libraries)
- [Multer Documentation](https://github.com/expressjs/multer)
- [Multer GCS](https://github.com/fsmulder/multer-gcs)
- [Express File Upload](https://expressjs.com/en/resources/middleware/multer.html)
