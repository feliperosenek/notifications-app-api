-- Script para permitir que o campo token seja nulo na tabela routes
-- Execute este script no seu banco de dados PostgreSQL

-- Alterar a coluna token para permitir valores nulos
ALTER TABLE routes ALTER COLUMN token DROP NOT NULL;

-- Verificar a alteração
SELECT column_name, is_nullable, data_type 
FROM information_schema.columns 
WHERE table_name = 'routes' AND column_name = 'token';

-- Comentário para documentação
COMMENT ON COLUMN routes.token IS 'Token Firebase para envio de notificações (opcional)';
